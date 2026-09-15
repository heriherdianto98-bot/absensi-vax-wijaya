import "dotenv/config";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * INVESTOR REVISED — isolated API
 * Minutes side remains READ ONLY.
 * The only write performed here is to public.investor_revised_snapshots,
 * a dedicated Investor Revised snapshot table. Canonical ERP/Minutes tables,
 * ORIGINAL/FROZEN snapshots, sync.js and scheduler are never touched.
 */

const PORT = Number(process.env.INVESTOR_READONLY_PORT || 8788);
const HOST = process.env.INVESTOR_READONLY_HOST || "127.0.0.1";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNNER = process.env.INVESTOR_READONLY_RUNNER || path.join(__dirname, "audit-investor-monthly-range-readonly.js");
const ALLOWED_ORIGIN = process.env.INVESTOR_READONLY_ORIGIN || "*";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY wajib untuk snapshot Investor Revised.");
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-methods": "POST,OPTIONS,GET",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

function safeBranch(v) {
  const s = String(v || "").trim();
  if (!s || s.length > 100 || /[\r\n]/.test(s)) throw new Error("Cabang tidak valid.");
  return s;
}

function safeMonth(v) {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) throw new Error("Periode harus YYYY-MM.");
  const m = Number(s.slice(5, 7));
  if (m < 1 || m > 12) throw new Error("Bulan tidak valid.");
  return s;
}

function safeYear(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2020 || n > 2100) throw new Error("Tahun tidak valid.");
  return n;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1024 * 64) reject(new Error("Payload terlalu besar."));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("JSON body tidak valid.")); }
    });
    req.on("error", reject);
  });
}

function scalar(text, key) {
  const m = String(text || "").match(new RegExp(`(?:^|\\n)${key}=(-?\\d+)`, "m"));
  return m ? Number(m[1]) : null;
}

function parseAuditResult(stdout) {
  const text = String(stdout || "");
  const marker = text.match(/AUDIT_RESULT_START\s*([\s\S]*?)\s*AUDIT_RESULT_END/);
  if (marker) return JSON.parse(marker[1].trim());
  const branch = text.match(/(?:^|\n)BRANCH=(.+)/m)?.[1]?.trim() || null;
  const period = text.match(/(?:^|\n)PERIOD=(.+)/m)?.[1]?.trim() || null;
  const freeze = text.match(/(?:^|\n)freeze_check_found=(true|false)/m)?.[1] === "true";
  const cashOut = scalar(text, "minutes_cash_out");
  const originalCashOut = scalar(text, "supabase_cash_out");
  const cashOutDelta = scalar(text, "cash_out_delta");
  if (cashOut === null) throw new Error("Collector selesai tetapi total Cash Out Minutes tidak ditemukan pada output.");
  return {
    parser: "LEGACY_READONLY_OUTPUT",
    auditMode: /AUDIT_MODE=READ_ONLY/.test(text) ? "READ_ONLY" : null,
    mainSyncTouched: /MAIN_SYNC_TOUCHED=NO/.test(text) ? false : null,
    databaseWrite: /DATABASE_WRITE=NO/.test(text) ? false : null,
    branch, period,
    dailyRecap: { cashOut, originalCashOut, delta: cashOutDelta, freezeCheckFound: freeze },
    rawOutput: text
  };
}

function runCollector({ branch, month }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER, "--branch", branch, "--month", month], {
      cwd: __dirname,
      env: { ...process.env, HEADLESS: process.env.HEADLESS || "true" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Collector timeout 6 menit.")); }, 6 * 60 * 1000);
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => { clearTimeout(timer); reject(err); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Collector gagal (exit ${code}). ${stderr.trim()}`));
      try { resolve(parseAuditResult(stdout)); }
      catch (err) { reject(new Error(`${err.message} ${stderr.trim()}`.trim())); }
    });
  });
}

const norm = v => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
async function resolveBranch(branchLabel, dataset = null) {
  const direct = Number(dataset?.branch?.id || 0);
  if (direct > 0) return { id: direct, name: dataset?.branch?.name || branchLabel };
  const { data, error } = await sb.from("cabang")
    .select("id,nama_cabang,nama_minutes,kode_cabang")
    .eq("aktif", true);
  if (error) throw error;
  const target = norm(branchLabel);
  const hits = (data || []).filter(r => [r.nama_cabang, r.nama_minutes, r.kode_cabang].map(norm).filter(Boolean).some(x => x === target));
  if (hits.length !== 1) throw new Error(`Mapping cabang snapshot tidak unik: ${branchLabel} (${hits.length})`);
  return { id: Number(hits[0].id), name: hits[0].nama_cabang || branchLabel };
}

function canonicalPayload(payload) { return JSON.stringify(payload); }
function checksum(payload) { return createHash("sha256").update(canonicalPayload(payload)).digest("hex"); }
function periodDate(month) { return `${safeMonth(month)}-01`; }

async function latestSnapshot(branchId, month) {
  const { data, error } = await sb.from("investor_revised_snapshots")
    .select("id,branch_id,period_month,revision_no,status,dataset_schema,dataset_version,source_kind,source_fetched_at,payload,checksum_sha256,created_at,locked_at")
    .eq("branch_id", branchId)
    .eq("period_month", periodDate(month))
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function latestYearSnapshots(branchId, year) {
  const y = safeYear(year);
  const from = `${y}-01-01`;
  const to = `${y + 1}-01-01`;
  const { data, error } = await sb.from("investor_revised_snapshots")
    .select("id,branch_id,period_month,revision_no,status,source_fetched_at,payload,created_at,locked_at")
    .eq("branch_id", branchId)
    .gte("period_month", from)
    .lt("period_month", to)
    .order("period_month", { ascending: true })
    .order("revision_no", { ascending: false });
  if (error) throw error;
  const latestByMonth = new Map();
  for (const row of data || []) {
    const key = String(row.period_month || "").slice(0, 7);
    if (key && !latestByMonth.has(key)) latestByMonth.set(key, row);
  }
  return [...latestByMonth.values()];
}

async function persistSnapshot({ branchLabel, month, payload, fetchedAt }) {
  const dataset = payload?.data || payload;
  const branch = await resolveBranch(branchLabel, dataset);
  const digest = checksum(payload);
  const previous = await latestSnapshot(branch.id, month);
  if (previous?.checksum_sha256 === digest) return { snapshot: previous, reused: true, branch };
  if (previous?.status === "LOCKED") throw new Error(`Snapshot Investor Revised ${branch.name} ${month} sudah LOCKED dan tidak boleh ditimpa.`);
  const revisionNo = Number(previous?.revision_no || 0) + 1;
  const row = {
    branch_id: branch.id,
    period_month: periodDate(month),
    revision_no: revisionNo,
    status: "READY",
    dataset_schema: String(dataset?.schema || "INVESTOR_REVISED_DATASET_V1"),
    dataset_version: Number(dataset?.datasetVersion || dataset?.dataset_version || 1),
    source_kind: "MINUTES_LIVE_REVISED",
    source_fetched_at: fetchedAt || new Date().toISOString(),
    payload,
    checksum_sha256: digest,
    created_by: "INVESTOR_READONLY_API"
  };
  const { data, error } = await sb.from("investor_revised_snapshots").insert(row).select("*").single();
  if (error) throw error;
  return { snapshot: data, reused: false, branch };
}

async function loadLatestByLabel(branchLabel, month) {
  const branch = await resolveBranch(branchLabel);
  return { branch, snapshot: await latestSnapshot(branch.id, month) };
}

async function loadYearByLabel(branchLabel, year) {
  const branch = await resolveBranch(branchLabel);
  return { branch, snapshots: await latestYearSnapshots(branch.id, year) };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true, mode: "READ_ONLY_MINUTES", mainSyncTouched: false, snapshotStore: true, runner: path.basename(RUNNER) });
  }

  if (req.method === "POST" && req.url === "/investor/snapshot-latest") {
    try {
      const body = await readBody(req);
      const branch = safeBranch(body.branch);
      const month = safeMonth(body.month);
      const found = await loadLatestByLabel(branch, month);
      return json(res, 200, {
        ok: true,
        mode: "SNAPSHOT_READ",
        mainSyncTouched: false,
        found: !!found.snapshot,
        branch: found.branch,
        month,
        snapshot: found.snapshot
      });
    } catch (err) {
      return json(res, 500, { ok: false, mode: "SNAPSHOT_READ", mainSyncTouched: false, error: err?.message || String(err) });
    }
  }

  if (req.method === "POST" && req.url === "/investor/snapshots-year") {
    try {
      const body = await readBody(req);
      const branch = safeBranch(body.branch);
      const year = safeYear(body.year);
      const found = await loadYearByLabel(branch, year);
      return json(res, 200, {
        ok: true,
        mode: "SNAPSHOT_YEAR_READ",
        mainSyncTouched: false,
        branch: found.branch,
        year,
        snapshots: found.snapshots
      });
    } catch (err) {
      return json(res, 500, { ok: false, mode: "SNAPSHOT_YEAR_READ", mainSyncTouched: false, error: err?.message || String(err) });
    }
  }

  if (req.method === "POST" && req.url === "/investor/monthly-readonly") {
    const startedAt = new Date().toISOString();
    try {
      const body = await readBody(req);
      const branch = safeBranch(body.branch);
      const month = safeMonth(body.month);
      const data = await runCollector({ branch, month });
      const finishedAt = new Date().toISOString();
      const payload = {
        ok: true,
        mode: "READ_ONLY",
        mainSyncTouched: false,
        databaseWrite: false,
        branch,
        month,
        startedAt,
        finishedAt,
        data
      };
      const stored = await persistSnapshot({ branchLabel: branch, month, payload, fetchedAt: finishedAt });
      return json(res, 200, {
        ...payload,
        snapshotStored: true,
        snapshotId: stored.snapshot.id,
        snapshotRevision: stored.snapshot.revision_no,
        snapshotStatus: stored.snapshot.status,
        snapshotReused: stored.reused
      });
    } catch (err) {
      return json(res, 500, {
        ok: false,
        mode: "READ_ONLY",
        mainSyncTouched: false,
        error: err?.message || String(err)
      });
    }
  }

  return json(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`INVESTOR_READONLY_API=http://${HOST}:${PORT}`);
  console.log("MINUTES_MODE=READ_ONLY");
  console.log("MAIN_SYNC_TOUCHED=NO");
  console.log("SNAPSHOT_STORE=investor_revised_snapshots");
});