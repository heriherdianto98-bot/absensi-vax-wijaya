"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.ERP_ASSISTANT_PORT || 3210);
const HOST = process.env.ERP_ASSISTANT_HOST || "127.0.0.1";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const MODEL = process.env.OLLAMA_MODEL || "qwen3:4b-instruct";
const KNOWLEDGE_PATH = process.env.ERP_KNOWLEDGE_PATH || path.resolve(__dirname, "../ERP.NEW/knowledge/erp-assistant-knowledge.json");

app.use(express.json({ limit: "256kb" }));

function loadKnowledge() {
  return JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf8"));
}

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function tokens(v) {
  const stop = new Set(["apa","apakah","itu","ini","yang","dan","di","ke","dari","untuk","saya","sy","mau","gimana","bagaimana","maksud","maksudnya","arti","jelasin","jelaskan","kenapa","kok","kalau","kalo","jadi","trs","terus","yg","mksd","mkst"]);
  return norm(v).split(" ").filter(x => x.length > 1 && !stop.has(x));
}

function moduleText(m) {
  return [
    m.id, m.name, m.status, m.purpose,
    ...(m.aliases || []), ...(m.sources || []), ...(m.rules || []),
    ...Object.keys(m.fields || {}), ...Object.values(m.fields || {}),
    ...(m.faq || []).flatMap(x => [x.q, x.a])
  ].join(" ");
}

function selectKnowledge(knowledge, message, history, context) {
  const modules = Array.isArray(knowledge?.modules) ? knowledge.modules : [];
  const recent = (Array.isArray(history) ? history : []).slice(-4).map(x => x?.content || "").join(" ");
  const query = `${message} ${recent} ${context || ""}`;
  const q = norm(query);
  const qt = tokens(query);

  const scored = modules.map(m => {
    const name = norm(m.name);
    const aliases = (m.aliases || []).map(norm);
    const hay = norm(moduleText(m));
    let s = 0;
    if (name && q.includes(name)) s += 40;
    for (const a of aliases) if (a.length >= 4 && q.includes(a)) s += 24;
    for (const t of qt) if (hay.includes(t)) s += 2;
    if (context && hay.includes(norm(context))) s += 5;
    return { m, s };
  }).sort((a,b) => b.s - a.s);

  const picked = scored.filter(x => x.s > 0).slice(0, 3).map(x => x.m);
  if (!picked.length) return modules.slice(0, 2);
  return picked;
}

function compactModule(m) {
  return {
    id: m.id,
    name: m.name,
    status: m.status,
    purpose: m.purpose || "",
    sources: m.sources || [],
    rules: m.rules || [],
    fields: m.fields || {},
    faq: m.faq || []
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-6)
    .map(m => ({ role: m.role, content: m.content.slice(0, 1800) }));
}

function systemPrompt(selected, context) {
  return [
    "Kamu adalah ERP Assistant untuk ERP VAX WIJAYA.",
    "Jawab seperti AI percakapan yang natural, kontekstual, dan nyambung dengan pertanyaan sebelumnya.",
    "Bahasa utama Indonesia. Jawaban singkat, jelas, praktis untuk Owner/SVP.",
    "Gunakan HANYA knowledge ERP resmi yang diberikan untuk fakta ERP VAX.",
    "Jangan mengarang rule, angka, status, formula, field, atau alur yang tidak ada di knowledge.",
    "Jika pertanyaan lanjutan memakai kata seperti 'itu', 'yang tadi', 'kalau begitu', pahami referennya dari history.",
    "Konteks halaman hanya petunjuk tambahan, bukan pembatas modul.",
    "Jangan memberi definisi akuntansi umum jika user bertanya fungsi/istilah ERP VAX.",
    "Jika knowledge yang diberikan belum cukup, katakan knowledge ERP belum cukup untuk bagian tersebut.",
    "Mode READ ONLY: jangan mengaku mengubah data atau menjalankan aksi.",
    `Konteks halaman: ${String(context || "tidak diketahui")}`,
    "KNOWLEDGE ERP RELEVAN:",
    JSON.stringify(selected.map(compactModule))
  ].join("\n");
}

app.get("/health", (_req, res) => {
  try {
    const knowledge = loadKnowledge();
    res.json({ ok: true, model: MODEL, knowledge_modules: knowledge?.modules?.length || 0 });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ ok: false, error: "message_required" });

    const history = normalizeHistory(req.body?.history);
    const context = String(req.body?.context || "Semua modul ERP LOCK").slice(0, 300);
    const knowledge = loadKnowledge();
    const selected = selectKnowledge(knowledge, message, history, context);

    const messages = [
      { role: "system", content: systemPrompt(selected, context) },
      ...history,
      { role: "user", content: message }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    let upstream;
    try {
      upstream = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          stream: false,
          keep_alive: "2m",
          messages,
          options: {
            temperature: 0.15,
            num_ctx: 3072,
            num_predict: 220
          }
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(502).json({ ok: false, error: "ollama_error", detail: text.slice(0, 1000) });
    }

    const data = await upstream.json();
    const answer = String(data?.message?.content || "").trim();
    if (!answer) return res.status(502).json({ ok: false, error: "empty_model_answer" });

    res.json({ ok: true, answer, model: MODEL, knowledge_used: selected.map(m => m.id) });
  } catch (err) {
    const name = err?.name === "AbortError" ? "timeout" : "server_error";
    res.status(500).json({ ok: false, error: name, detail: String(err?.message || err) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[ERP Assistant] listening on http://${HOST}:${PORT}`);
  console.log(`[ERP Assistant] model=${MODEL}`);
  console.log(`[ERP Assistant] knowledge=${KNOWLEDGE_PATH}`);
});
