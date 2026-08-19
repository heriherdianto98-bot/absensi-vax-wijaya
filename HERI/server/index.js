/**
 * HERI VPS API foundation — Phase 1 contract only.
 * No secrets in frontend. No fake bank payments.
 */
const http = require("http");
const { URL } = require("url");

const PORT = process.env.HERI_PORT || 8787;
const API_PREFIX = "/api/v1";

function json(res, status, body) {
  const raw = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const contract = {
  name: "HERI API",
  phase: 1,
  status: "foundation",
  note: "In-memory stubs only. Wire DB/auth on VPS in later phase.",
  endpoints: [
    "GET  /api/v1/health",
    "POST /api/v1/auth/device  { deviceId, publicKey }",
    "GET  /api/v1/transactions?from&to",
    "POST /api/v1/transactions  { ...tx }",
    "POST /api/v1/ai/query  { q }",
    "POST /api/v1/backup  { payload }",
    "GET  /api/v1/backup/latest",
    "GET  /api/v1/payments/status  → all BELUM TERHUBUNG",
  ],
};

// Ephemeral store for foundation demos (not production)
const store = {
  devices: {},
  transactions: [],
  backups: [],
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});

  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = u.pathname;

  try {
    if (path === `${API_PREFIX}/health` && req.method === "GET") {
      return json(res, 200, { ok: true, service: "heri", phase: 1, time: new Date().toISOString() });
    }

    if (path === `${API_PREFIX}/contract` && req.method === "GET") {
      return json(res, 200, contract);
    }

    if (path === `${API_PREFIX}/auth/device` && req.method === "POST") {
      const body = await readBody(req);
      if (!body.deviceId) return json(res, 400, { error: "deviceId required" });
      store.devices[body.deviceId] = {
        deviceId: body.deviceId,
        publicKey: body.publicKey || null,
        linkedAt: new Date().toISOString(),
      };
      return json(res, 200, { ok: true, device: store.devices[body.deviceId], token: "phase1-dev-token" });
    }

    if (path === `${API_PREFIX}/transactions` && req.method === "GET") {
      let rows = store.transactions;
      const from = u.searchParams.get("from");
      const to = u.searchParams.get("to");
      if (from) rows = rows.filter((r) => r.date >= from);
      if (to) rows = rows.filter((r) => r.date <= to);
      return json(res, 200, { count: rows.length, rows });
    }

    if (path === `${API_PREFIX}/transactions` && req.method === "POST") {
      const body = await readBody(req);
      if (!body.id || !body.amount || !body.name) {
        return json(res, 400, { error: "id, name, amount required" });
      }
      if (store.transactions.some((t) => t.id === body.id)) {
        return json(res, 409, { error: "duplicate id" });
      }
      store.transactions.push(body);
      return json(res, 201, { ok: true, id: body.id });
    }

    if (path === `${API_PREFIX}/ai/query` && req.method === "POST") {
      const body = await readBody(req);
      return json(res, 200, {
        answer:
          "Phase 1: AI query dijalankan lokal di app. Endpoint VPS siap menerima `{ q }` lalu nanti memakai DB HERI.",
        echo: body.q || null,
        dataBased: true,
      });
    }

    if (path === `${API_PREFIX}/backup` && req.method === "POST") {
      const body = await readBody(req);
      const item = { at: new Date().toISOString(), payload: body.payload || body };
      store.backups.push(item);
      return json(res, 201, { ok: true, at: item.at });
    }

    if (path === `${API_PREFIX}/backup/latest` && req.method === "GET") {
      const latest = store.backups[store.backups.length - 1] || null;
      return json(res, 200, { latest });
    }

    if (path === `${API_PREFIX}/payments/status` && req.method === "GET") {
      return json(res, 200, {
        qris: "BELUM TERHUBUNG",
        ewallet: "BELUM TERHUBUNG",
        virtualAccount: "BELUM TERHUBUNG",
        tokenTagihan: "BELUM TERHUBUNG",
        eTollNfc: "BELUM TERHUBUNG",
        note: "No fake bank API. Official SDK only in later phases.",
      });
    }

    return json(res, 404, { error: "not found", contract });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[HERI] VPS API foundation on http://127.0.0.1:${PORT}${API_PREFIX}`);
  console.log(`[HERI] Contract: http://127.0.0.1:${PORT}${API_PREFIX}/contract`);
});
