import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KNOWLEDGE_URL = "https://raw.githubusercontent.com/heriherdianto98-bot/ERP-VAX/main/ERP.NEW/knowledge/erp-assistant-knowledge.json";

type ChatTurn = { role: "user" | "assistant"; content: string };

type RequestBody = {
  message?: string;
  history?: ChatTurn[];
  context?: {
    module?: string | null;
    page?: string | null;
  };
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function extractText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const out = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) parts.push(part.text.trim());
    }
  }
  return parts.join("\n").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    const message = String(body?.message || "").trim();
    if (!message) return json({ error: "Pertanyaan kosong." }, 400);
    if (message.length > 2000) return json({ error: "Pertanyaan terlalu panjang." }, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({
        error: "ERP Assistant AI belum memiliki OPENAI_API_KEY di Supabase Edge Function Secrets.",
        code: "AI_KEY_MISSING",
      }, 503);
    }

    const kbRes = await fetch(KNOWLEDGE_URL, { headers: { "Cache-Control": "no-cache" } });
    if (!kbRes.ok) return json({ error: "Knowledge Base canonical tidak dapat dibaca." }, 502);
    const knowledge = await kbRes.json();

    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((x): x is ChatTurn => !!x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
      .slice(-10)
      .map((x) => ({ role: x.role, content: x.content.slice(0, 2500) }));

    const contextModule = String(body?.context?.module || "").trim();
    const contextPage = String(body?.context?.page || "").trim();

    const instructions = `Anda adalah ERP Assistant internal ERP VAX WIJAYA.

TUJUAN:
- Jawab seperti AI percakapan sungguhan: pahami bahasa Indonesia santai, singkatan, typo, pertanyaan lanjutan, dan konteks percakapan.
- Jawaban harus nyambung dengan pertanyaan terakhir dan riwayat chat.
- Konteks halaman hanya petunjuk tambahan, BUKAN pembatas. Jika user bertanya modul lain, jawab modul lain.

BATASAN KERAS:
- Hanya gunakan fakta/rule/fungsi yang didukung KNOWLEDGE BASE CANONICAL di bawah.
- Jangan mengarang formula, status, source, nominal, atau workflow yang tidak ada di knowledge.
- Jika knowledge tidak cukup, katakan secara natural bahwa knowledge ERP untuk hal itu belum tersedia / perlu diperbarui. Jangan menebak.
- READ ONLY: jangan mengklaim sudah mengubah data, verifikasi, input, atau menjalankan aksi ERP.
- Jika pertanyaan ambigu, gunakan riwayat percakapan untuk resolve. Jika masih ambigu, tanya klarifikasi singkat.
- Jangan menjawab dengan template statis. Susun jawaban baru sesuai pertanyaan user.
- Gunakan bahasa Indonesia ringkas, jelas, praktis. Panggil user "Pak" bila natural.

KONTEKS HALAMAN SAAT INI:
- Modul: ${contextModule || "tidak diketahui"}
- Halaman: ${contextPage || "tidak diketahui"}

KNOWLEDGE BASE CANONICAL (JSON):
${JSON.stringify(knowledge)}`;

    const input = [
      ...history,
      { role: "user", content: message },
    ];

    const aiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("ERP_ASSISTANT_MODEL") || "gpt-5.6-luna",
        instructions,
        input,
        max_output_tokens: 700,
      }),
    });

    const aiPayload = await aiRes.json();
    if (!aiRes.ok) {
      console.error("OpenAI response error", aiPayload);
      return json({ error: "AI provider gagal merespons.", detail: aiPayload?.error?.message || null }, 502);
    }

    const answer = extractText(aiPayload);
    if (!answer) return json({ error: "AI tidak menghasilkan jawaban." }, 502);

    return json({
      answer,
      model: aiPayload?.model || Deno.env.get("ERP_ASSISTANT_MODEL") || "gpt-5.6-luna",
      knowledge_version: knowledge?.last_updated || null,
      mode: "AI_CONTEXTUAL_READ_ONLY",
    });
  } catch (err) {
    console.error(err);
    return json({ error: "ERP Assistant mengalami error.", detail: String(err?.message || err) }, 500);
  }
});
