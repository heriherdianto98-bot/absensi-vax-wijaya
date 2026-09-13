import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

/*
=========================================================
VAX ERP — MONTHLY PERIOD FREEZE
=========================================================
Purpose:
- Freeze ORIGINAL ERP state for the PREVIOUS calendar month.
- Additive only: never writes to live source tables.
- Uses public.erp_freeze_period(...) in Supabase.
- Safe to retry: an already LOCKED period returns ALREADY_LOCKED.
- Intended schedule: every tanggal 1, 01:00 WIB.

OWNER RULE:
- DO NOT modify DailyDataEngine, PayrollUnifiedEngine, LaporanBulananEngine,
  existing Minutes sync logic, formulas, or any LOCK module.
=========================================================
*/

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("SUPABASE_URL atau SUPABASE_SERVICE_KEY belum terbaca dari .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function wibParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second"))
  };
}

function isoDate(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function previousMonthRange() {
  const now = wibParts();
  let y = now.year;
  let m = now.month - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: isoDate(y, m, 1),
    end: isoDate(y, m, lastDay),
    year: y,
    month: m
  };
}

function currentGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function log(message, extra = null) {
  const stamp = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date());
  if (extra === null) console.log(`[${stamp}] ${message}`);
  else console.log(`[${stamp}] ${message}`, extra);
}

async function main() {
  const force = String(process.env.FORCE_MONTHLY_FREEZE || "false").toLowerCase() === "true";
  const now = wibParts();

  if (!force && now.day !== 1) {
    log("SKIP: bukan tanggal 1 WIB. Gunakan FORCE_MONTHLY_FREEZE=true hanya untuk test/manual terkontrol.");
    return;
  }

  const range = previousMonthRange();
  const gitSha = currentGitSha();
  const label = `ERP ORIGINAL ${range.start.slice(0, 7)}`;

  log(`Mulai monthly freeze ORIGINAL ERP: ${range.start} s.d. ${range.end}`);
  log(`Git commit: ${gitSha || "tidak tersedia"}`);

  const { data, error } = await supabase.rpc("erp_freeze_period", {
    p_period_start: range.start,
    p_period_end: range.end,
    p_git_commit_sha: gitSha,
    p_snapshot_label: label
  });

  if (error) {
    throw new Error(`Freeze gagal: ${error.message}`);
  }

  const result = data || {};
  const status = String(result.status || "UNKNOWN");

  if (!['LOCKED', 'ALREADY_LOCKED'].includes(status)) {
    throw new Error(`Freeze selesai dengan status tidak aman: ${status}`);
  }

  log(`Freeze ${status}: ${range.start} s.d. ${range.end}`);
  log(`Snapshot ID: ${result.snapshot_id || "-"}`);
  log(`Total rows: ${result.total_rows ?? "-"}`);
  log(`Snapshot hash: ${result.snapshot_hash || "-"}`);
}

main().catch(err => {
  console.error(`[monthly-period-freeze] FATAL: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
