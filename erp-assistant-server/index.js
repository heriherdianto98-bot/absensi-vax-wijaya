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
  const raw = fs.readFileSync(KNOWLEDGE_PATH, "utf8");
  return JSON.parse(raw);
}

function compactKnowledge(knowledge) {
  const modules = Array.isArray(knowledge?.modules) ? knowledge.modules : [];
  return modules.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    aliases: m.aliases || [],
    purpose: m.purpose || "",
    sources: m.sources || [],
    rules: m.rules || [],
    fields: m.fields || {},
    faq: m.faq || []
  }));
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
}

function systemPrompt(knowledge, context) {
  return [
    "Kamu adalah ERP Assistant untuk ERP VAX WIJAYA.",
    "Jawab natural seperti AI percakapan, bukan FAQ statis dan bukan keyword matcher.",
    "Bahasa utama: Indonesia yang jelas, singkat, dan mudah dipahami Owner/SVP.",
    "Kamu harus memahami pertanyaan lanjutan dari history percakapan.",
    "Konteks halaman hanya petunjuk tambahan, bukan pembatas. Jika user bertanya modul lain, jawab modul itu.",
    "Gunakan HANYA knowledge ERP resmi di bawah ini untuk fakta tentang ERP VAX.",
    "Jangan mengarang rule, angka, status, formula, field, atau alur yang tidak ada di knowledge.",
    "Jika knowledge belum cukup, katakan secara spesifik bahwa knowledge ERP belum cukup dan bagian mana yang belum terdokumentasi.",
    "Jangan menjawab definisi umum akuntansi jika user jelas bertanya arti fitur/istilah di ERP VAX.",
    "Mode READ ONLY: jangan memberi kesan kamu telah mengubah data, memverifikasi transaksi, atau menjalankan aksi.",
    `Konteks halaman saat ini: ${String(context || "tidak diketahui")}`,
    "KNOWLEDGE ERP RESMI:",
    JSON.stringify(compactKnowledge(knowledge))
  ].join("\n");
}

app.get("/health", async (_req, res) => {
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
    const context = String(req.body?.context || "Semua modul ERP LOCK").slice(0, 500);
    const knowledge = loadKnowledge();

    const messages = [
      { role: "system", content: systemPrompt(knowledge, context) },
      ...history,
      { role: "user", content: message }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

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
            temperature: 0.2,
            num_ctx: 4096,
            num_predict: 450
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

    res.json({ ok: true, answer, model: MODEL });
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
