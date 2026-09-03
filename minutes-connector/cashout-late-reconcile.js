/**
 * VAX ERP — Late Cash Out Reconciliation V1
 *
 * PURPOSE
 * - Menangkap Cash Out yang diinput SVP/SPP terlambat ke tanggal yang sudah lewat.
 * - TIDAK mengubah logika Cash Out Monthly Reconciliation yang sudah LOCK.
 * - Default window: H-3 s.d. H-1 WIB.
 * - Setiap tanggal dijalankan sebagai range 1 hari terhadap engine monthly existing.
 *   Dengan begitu monthly gate menjadi per-hari dan tidak bisa tertutup oleh offset antar tanggal.
 *
 * SAFETY
 * - Existing rows only mengikuti cashout-monthly-reconcile.js.
 * - Manual default DRY_RUN=true.
 * - LIVE hanya jika LIVE=true DRY_RUN=false.
 * - ALLOW_HISTORICAL_CASHOUT_REPAIR=true hanya untuk window H-3..H-1 ini.
 *
 * Usage manual audit:
 *   DRY_RUN=true HEADLESS=true node cashout-late-reconcile.js
 *
 * Usage production:
 *   LIVE=true DRY_RUN=false HEADLESS=true node cashout-late-reconcile.js
 */

import "dotenv/config";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIVE = String(process.env.LIVE || "").toLowerCase() === "true";
const DRY_RUN = String(process.env.DRY_RUN || "true").toLowerCase() !== "false";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() === "true";
const ONLY_CABANG = String(process.env.CABANG || "").trim();
const DATE_FROM_ENV = String(process.env.DATE_FROM || "").trim();
const DATE_TO_ENV = String(process.env.DATE_TO || "").trim();

function pad(n) {
  return String(n).padStart(2, "0");
}

function jakartaTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDaysISO(iso, deltaDays) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function assertISODate(value, label) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`${label} harus YYYY-MM-DD, didapat: ${value}`);
  }
  return s;
}

function enumerateDates(from, to) {
  const start = assertISODate(from, "DATE_FROM");
  const end = assertISODate(to, "DATE_TO");
  if (start > end) throw new Error(`DATE_FROM (${start}) > DATE_TO (${end})`);
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function resolveDates() {
  if (DATE_FROM_ENV || DATE_TO_ENV) {
    if (!DATE_FROM_ENV || !DATE_TO_ENV) {
      throw new Error("Jika override manual, DATE_FROM dan DATE_TO wajib diisi keduanya.");
    }
    return enumerateDates(DATE_FROM_ENV, DATE_TO_ENV);
  }

  const today = jakartaTodayISO();
  return enumerateDates(addDaysISO(today, -3), addDaysISO(today, -1));
}

function runOneDate(date) {
  return new Promise((resolve, reject) => {
    const target = path.join(__dirname, "cashout-monthly-reconcile.js");
    const label = `[LATE CASHOUT] ${date}`;

    console.log("");
    console.log("============================================================");
    console.log(`${label} mulai | ${DRY_RUN ? "DRY_RUN" : "LIVE"}`);
    console.log("============================================================");

    const child = spawn(
      "/usr/bin/xvfb-run",
      ["-a", process.execPath, target],
      {
        cwd: __dirname,
        stdio: "inherit",
        env: {
          ...process.env,
          LIVE: LIVE ? "true" : "false",
          DRY_RUN: DRY_RUN ? "true" : "false",
          HEADLESS: HEADLESS ? "true" : "false",
          CABANG: ONLY_CABANG,
          DATE: "",
          DATE_FROM: date,
          DATE_TO: date,
          ALLOW_HISTORICAL_CASHOUT_REPAIR: "true"
        }
      }
    );

    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        console.log(`${label} selesai.`);
        resolve();
      } else {
        reject(new Error(`${label} gagal dengan exit code ${code}`));
      }
    });
  });
}

async function main() {
  if (!DRY_RUN && !LIVE) {
    throw new Error("Production write diblok: DRY_RUN=false wajib bersama LIVE=true.");
  }

  const dates = resolveDates();
  console.log(
    `[LATE CASHOUT] window ${dates[0]} s.d. ${dates[dates.length - 1]} WIB | ` +
    `${dates.length} hari | ${ONLY_CABANG || "semua cabang"} | ${DRY_RUN ? "DRY_RUN" : "LIVE"}`
  );

  for (const date of dates) {
    await runOneDate(date);
  }

  console.log("[LATE CASHOUT] seluruh window selesai.");
}

main().catch(error => {
  console.error(`[LATE CASHOUT] FATAL: ${error?.stack || error?.message || error}`);
  process.exit(1);
});
