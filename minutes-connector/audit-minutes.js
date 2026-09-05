import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!email || !password || !supabaseUrl || !supabaseServiceKey) {
  throw new Error("Env Minutes/Supabase belum lengkap.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";
const DAILY_RECAP_URL = "https://minutesapps.com/dashboard216a/report/recap/";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";

function normalize(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function branchMatches(row, filter) {
  const target = normalize(filter);
  if (!target || target === "all") return true;

  const candidates = [
    row?.nama_cabang,
    row?.nama_minutes,
    row?.kode_cabang
  ]
    .map(normalize)
    .filter(Boolean);

  return candidates.some((value) =>
    value === target ||
    value.includes(target) ||
    target.includes(value)
  );
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = value;
  }
  return out;
}

function formatDateMinutes(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || "")) {
    throw new Error(`Tanggal tidak valid: ${ymd}`);
  }
  const [y, m, d] = ymd.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(m) - 1];
  if (!month) throw new Error(`Bulan tidak valid: ${ymd}`);
  return `${d} ${month} ${y}`;
}

function dateRange(start, end) {
  const rows = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) {
    throw new Error("Range tanggal audit tidak valid.");
  }
  while (cursor <= last) {
    rows.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

async function fetchBranches(branchFilter) {
  const { data, error } = await supabase
    .from("cabang")
    .select("id,kode_cabang,nama_cabang,nama_minutes,urutan,aktif")
    .eq("aktif", true)
    .not("nama_minutes", "is", null)
    .order("urutan", { ascending: true });
  if (error) throw error;

  let rows = (data || []).filter((row) => row.id && row.nama_cabang && row.nama_minutes);
  if (branchFilter && normalize(branchFilter) !== "all") {
    rows = rows.filter((row) => branchMatches(row, branchFilter));
    if (!rows.length) {
      const available = (data || [])
        .filter((row) => row?.nama_cabang)
        .map((row) => `${row.kode_cabang || "-"}:${row.nama_cabang}`)
        .join(" | ");
      throw new Error(`Cabang tidak ditemukan: ${branchFilter}. Tersedia: ${available}`);
    }
  }
  return rows;
}

async function fetchSupabaseRows(start, end, branchIds) {
  const { data, error } = await supabase
    .from("daily_recap_source")
    .select("tanggal,cabang_id,transaction_minutes,customer_minutes,services_minutes")
    .gte("tanggal", start)
    .lte("tanggal", end)
    .in("cabang_id", branchIds)
    .order("tanggal", { ascending: true });
  if (error) throw error;
  return new Map((data || []).map((row) => [`${row.tanggal}|${row.cabang_id}`, row]));
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(4000);
  if (page.url().includes("/user/login")) throw new Error("Login Minutes gagal.");
}

async function switchToMerchant(page) {
  const select = page.locator('select[name="switchrole"]');
  await select.waitFor({ state: "attached", timeout: 20000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.evaluate(() => {
      const el = document.querySelector('select[name="switchrole"]');
      if (!el || !el.form) throw new Error("switchrole tidak ditemukan");
      el.value = "3";
      el.form.submit();
    })
  ]);
  await page.waitForTimeout(3000);
}

async function selectBranch(page, branch) {
  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  const select = page.locator('select[name="merchant"]');
  await select.waitFor({ state: "attached", timeout: 20000 });

  const option = await page.evaluate((name) => {
    const norm = (v = "") => String(v).trim().replace(/\s+/g, " ").toLowerCase();
    const el = document.querySelector('select[name="merchant"]');
    if (!el) return null;
    const target = norm(name);
    const found = [...el.options].find((o) => norm(o.textContent) === target);
    return found ? { value: found.value, name: found.textContent.trim() } : null;
  }, branch.nama_minutes);

  if (!option) throw new Error(`Merchant Minutes tidak ditemukan: ${branch.nama_minutes}`);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.evaluate((value) => {
      const el = document.querySelector('select[name="merchant"]');
      if (!el || !el.form) throw new Error("merchant select tidak ditemukan");
      el.value = value;
      el.form.submit();
    }, option.value)
  ]);
  await page.waitForTimeout(2200);
}

async function readDailyKpi(page, ymd) {
  const url = `${DAILY_RECAP_URL}?date=${encodeURIComponent(formatDateMinutes(ymd))}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await page.evaluate(() => {
      const clean = (v = "") => String(v).trim().replace(/\s+/g, " ");
      const upper = (v = "") => clean(v).toUpperCase();
      const scope = document.querySelector("ul#sparks") || document.querySelector(".col-sm-10.on-mobile");
      if (!scope) return null;
      const lines = String(scope.innerText || "").split(/\n+/).map(clean).filter(Boolean);
      const get = (label) => {
        const idx = lines.findIndex((x) => upper(x) === label);
        const raw = idx >= 0 ? lines[idx + 1] : "";
        return /^\d{1,6}$/.test(raw || "") ? Number(raw) : null;
      };
      const transaction = get("TRANSACTION");
      const customer = get("CUSTOMER");
      const services = get("SERVICES");
      if (transaction == null || customer == null || services == null) return null;
      return { transaction, customer, services };
    });
    if (result) return result;
    if (attempt < 5) await page.waitForTimeout(1200);
  }
  throw new Error(`KPI Daily Recap tidak terbaca untuk ${ymd}`);
}

function compare(minutes, db) {
  const supabaseKpi = {
    transaction: Number(db?.transaction_minutes || 0),
    customer: Number(db?.customer_minutes || 0),
    services: Number(db?.services_minutes || 0)
  };
  const fields = ["transaction", "customer", "services"];
  const mismatch = fields.filter((field) => Number(minutes[field]) !== Number(supabaseKpi[field]));
  return { supabase: supabaseKpi, mismatch, match: mismatch.length === 0 };
}

const args = parseArgs(process.argv.slice(2));
const start = args.start || process.env.AUDIT_START;
const end = args.end || process.env.AUDIT_END || start;
const branchFilter = args.branch || process.env.AUDIT_BRANCH || "all";

if (!start || !end) throw new Error("Gunakan --start YYYY-MM-DD [--end YYYY-MM-DD] [--branch nama|all].");

const dates = dateRange(start, end);
const branches = await fetchBranches(branchFilter);
const dbRows = await fetchSupabaseRows(start, end, branches.map((b) => b.id));

console.log(`AUDIT_READ_ONLY=TRUE`);
console.log(`AUDIT_RANGE=${start}..${end}`);
console.log(`AUDIT_BRANCHES=${branches.length}`);
console.log(`AUDIT_DAYS=${dates.length}`);
console.log(`AUDIT_CHECKS=${branches.length * dates.length * 3}`);

const browser = await chromium.launch({ headless: HEADLESS });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];

try {
  await login(page);
  await switchToMerchant(page);

  for (const branch of branches) {
    await selectBranch(page, branch);
    for (const date of dates) {
      const minutes = await readDailyKpi(page, date);
      const db = dbRows.get(`${date}|${branch.id}`) || null;
      const check = compare(minutes, db);
      results.push({
        tanggal: date,
        cabang: branch.nama_cabang,
        cabang_id: branch.id,
        minutes,
        supabase: check.supabase,
        status: check.match ? "MATCH" : "MISMATCH",
        mismatch_fields: check.mismatch
      });
      console.log(`${check.match ? "✅" : "❌"} ${date} | ${branch.nama_cabang} | Minutes T/C/S=${minutes.transaction}/${minutes.customer}/${minutes.services} | Supabase T/C/S=${check.supabase.transaction}/${check.supabase.customer}/${check.supabase.services} | ${check.match ? "MATCH" : `MISMATCH:${check.mismatch.join(",")}`}`);
    }
  }
} finally {
  await browser.close();
}

const mismatches = results.filter((row) => row.status === "MISMATCH");
console.log("AUDIT_SUMMARY_BEGIN");
console.log(JSON.stringify({
  start,
  end,
  branchFilter,
  branches: branches.length,
  branchDays: results.length,
  checks: results.length * 3,
  matchBranchDays: results.length - mismatches.length,
  mismatchBranchDays: mismatches.length,
  mismatches
}, null, 2));
console.log("AUDIT_SUMMARY_END");

if (mismatches.length > 0) process.exitCode = 2;
