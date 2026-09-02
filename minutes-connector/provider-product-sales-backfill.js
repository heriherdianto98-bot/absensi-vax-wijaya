import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new Error(`${label} wajib format YYYY-MM-DD`);
  }
  const d = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} tidak valid`);
  return d;
}

function isoJakartaDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addDay(date) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function runDate(date) {
  return new Promise(resolve => {
    const filePath = path.join(__dirname, "provider-product-sales-sync.js");
    const p = spawn(process.execPath, [filePath, date], {
      cwd: __dirname,
      stdio: "inherit",
      env: process.env
    });

    p.on("error", err => {
      console.error(`❌ ${date}: gagal start: ${err.message}`);
      resolve(1);
    });
    p.on("close", code => resolve(code ?? 1));
  });
}

const fromArg = process.argv[2];
const toArg = process.argv[3] || fromArg;

try {
  const from = parseDate(fromArg, "Tanggal awal");
  const to = parseDate(toArg, "Tanggal akhir");
  if (from > to) throw new Error("Tanggal awal tidak boleh setelah tanggal akhir");

  console.log(`Backfill Provider Product Share: ${fromArg} s/d ${toArg}`);

  let current = from;
  let success = 0;
  let failed = 0;

  while (current <= to) {
    const date = isoJakartaDate(current);
    console.log(`\n===== ${date} =====`);
    const code = await runDate(date);
    if (code === 0) success += 1;
    else {
      failed += 1;
      console.error(`❌ Backfill berhenti di ${date}, exit=${code}`);
      break;
    }
    current = addDay(current);
  }

  console.log(`\nBackfill selesai: ${success} hari OK, ${failed} hari gagal.`);
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(`Backfill gagal: ${error.message}`);
  console.error("Contoh: node provider-product-sales-backfill.js 2026-08-14 2026-08-31");
  process.exitCode = 1;
}
