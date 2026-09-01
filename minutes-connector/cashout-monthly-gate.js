import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = String(process.env.DRY_RUN || "true").toLowerCase() !== "false";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() === "true";
const ONLY_CABANG = String(process.env.CABANG || "").trim();

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";

const pad = n => String(n).padStart(2, "0");
const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const money = s => {
  const digits = String(s || "").replace(/[^\d-]/g, "");
  return digits ? Number(digits) : 0;
};
const rp = n => `Rp${Number(n || 0).toLocaleString("id-ID")}`;

function todayWIB() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function previousMonthRange() {
  const [y, m] = todayWIB().split("-").map(Number);
  const firstCurrent = new Date(Date.UTC(y, m - 1, 1, 12));
  const last = new Date(firstCurrent);
  last.setUTCDate(0);
  const first = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1, 12));
  const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  return { from: iso(first), to: iso(last) };
}

function assertEnv() {
  if (!email || !password) throw new Error("MINUTES_EMAIL/MINUTES_PASSWORD belum ada");
  if (!supabaseUrl || !supabaseServiceKey) throw new Error("SUPABASE env belum ada");
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(2500);
  if (page.url().includes("/user/login")) throw new Error("Login Minutes gagal");
}

async function switchMerchantRole(page) {
  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const role = page.locator('select[name="switchrole"]');
  await role.waitFor({ state: "attached", timeout: 20000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
    page.evaluate(() => {
      const s = document.querySelector('select[name="switchrole"]');
      if (!s?.form) throw new Error("switchrole tidak ditemukan");
      s.value = "3";
      s.form.submit();
    })
  ]);
  await page.waitForTimeout(1500);
}

async function selectMerchant(page, merchantName) {
  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const sel = page.locator('select[name="merchant"]');
  await sel.waitFor({ state: "attached", timeout: 20000 });
  const found = await page.evaluate(targetRaw => {
    const target = String(targetRaw || "").trim().replace(/\s+/g, " ").toLowerCase();
    const s = document.querySelector('select[name="merchant"]');
    if (!s) return null;
    const opt = [...s.options].find(o => String(o.textContent || "").trim().replace(/\s+/g, " ").toLowerCase() === target);
    return opt ? { value: opt.value, text: opt.textContent.trim() } : null;
  }, merchantName);
  if (!found) throw new Error(`Merchant tidak ditemukan: ${merchantName}`);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
    page.evaluate(v => {
      const s = document.querySelector('select[name="merchant"]');
      s.value = v;
      s.form.submit();
    }, found.value)
  ]);
  await page.waitForTimeout(1200);
  return found.text;
}

async function openCashManagement(page) {
  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const href = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href]")];
    const hit = links.find(a => {
      const text = String(a.textContent || "").trim().toLowerCase();
      const href = String(a.getAttribute("href") || "").toLowerCase();
      return text.includes("cash management") || href.includes("cashmanagement") || href.includes("cash-management") || href.includes("cash_management");
    });
    return hit?.href || null;
  });
  if (!href) throw new Error("Link Cash Management tidak ditemukan");
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function setPeriod(page, from, to) {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  const result = await page.evaluate(({ from, to, fy, fm, fd, ty, tm, td }) => {
    const inputs = [...document.querySelectorAll("input")].filter(i => {
      const meta = `${i.type} ${i.name} ${i.id} ${i.placeholder}`.toLowerCase();
      return i.type === "date" || /date|from|start|to|end|period|periode|awal|akhir/.test(meta);
    });
    const pick = keys => inputs.find(i => keys.some(k => `${i.name} ${i.id} ${i.placeholder}`.toLowerCase().includes(k)));
    const a = pick(["from","start","awal","date1"]) || inputs[0];
    const b = pick(["to","end","akhir","date2"]) || inputs[1];
    if (!a || !b) return { ok:false, count:inputs.length };
    const set = (el, iso, d, m, y) => {
      el.value = el.type === "date" ? iso : `${d}/${m}/${y}`;
      el.dispatchEvent(new Event("input", { bubbles:true }));
      el.dispatchEvent(new Event("change", { bubbles:true }));
    };
    set(a, from, fd, fm, fy);
    set(b, to, td, tm, ty);
    const form = a.form || b.form;
    if (form) { form.submit(); return { ok:true }; }
    const btn = [...document.querySelectorAll("button,input[type=submit]")].find(x => /filter|search|show|apply|tampil|cari/i.test(String(x.textContent || x.value || "")));
    if (btn) { btn.click(); return { ok:true }; }
    return { ok:true };
  }, { from, to, fy, fm, fd, ty, tm, td });
  if (!result.ok) throw new Error(`Input periode tidak ditemukan (${result.count})`);
  await page.waitForTimeout(1800);
}

async function readMonthlyExpenseTotal(page) {
  const result = await page.evaluate(() => {
    const norm = s => String(s || "").trim().replace(/\s+/g," ").toLowerCase();
    const num = s => {
      const d = String(s || "").replace(/[^\d-]/g, "");
      return d ? Number(d) : 0;
    };
    const tables = [...document.querySelectorAll("table")];
    let best = null;
    for (const t of tables) {
      const title = norm(`${t.getAttribute("data-dt-title") || ""} ${t.textContent || ""}`);
      if (!title.includes("expense")) continue;
      const items = [...t.querySelectorAll("tbody tr")].map(r => {
        const c = r.querySelectorAll("td");
        return { desc: String(c[0]?.textContent || "").trim(), amount: num(c[1]?.textContent || "") };
      }).filter(x => x.desc && !norm(x.desc).includes("opening cash") && x.amount > 0);
      if (!best || items.length > best.items.length) best = { items };
    }
    if (!best) return null;
    return { total: best.items.reduce((s,x)=>s+x.amount,0), count: best.items.length };
  });
  if (!result) throw new Error("Tabel Expense Data bulanan tidak ditemukan");
  return result;
}

function runDrilldown(cabang, range) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      HEADLESS: "true",
      DRY_RUN: DRY_RUN ? "true" : "false",
      LIVE: DRY_RUN ? "false" : "true",
      CABANG: cabang,
      DATE_FROM: range.from,
      DATE_TO: range.to
    };
    const child = spawn("/usr/bin/xvfb-run", ["-a", process.execPath, path.join(__dirname, "cashout-monthly-reconcile.js")], {
      cwd: __dirname,
      env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Drilldown exit ${code}`)));
  });
}

async function main() {
  assertEnv();
  const range = previousMonthRange();
  const sb = createClient(supabaseUrl, supabaseServiceKey);
  let { data: cabang, error } = await sb.from("cabang").select("id,nama_cabang,nama_minutes,aktif,urutan").eq("aktif",true).not("nama_minutes","is",null).order("urutan");
  if (error) throw error;
  cabang = (cabang || []).filter(c => !norm(c.nama_cabang).includes("floating"));
  if (ONLY_CABANG) cabang = cabang.filter(c => norm(c.nama_cabang).includes(norm(ONLY_CABANG)) || norm(c.nama_minutes).includes(norm(ONLY_CABANG)));

  const ids = cabang.map(c=>c.id);
  const { data: rows, error: er } = await sb.from("daily_recap_source").select("cabang_id,tanggal,cash_out").in("cabang_id",ids).gte("tanggal",range.from).lte("tanggal",range.to);
  if (er) throw er;
  const erpTotals = new Map();
  for (const r of rows || []) erpTotals.set(r.cabang_id,(erpTotals.get(r.cabang_id)||0)+Number(r.cash_out||0));

  console.log(`[MONTHLY GATE] ${range.from} -> ${range.to} | cabang=${cabang.length} | DRY_RUN=${DRY_RUN}`);
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  try {
    await login(page);
    await switchMerchantRole(page);
    for (const [i,c] of cabang.entries()) {
      console.log(`\n[GATE ${i+1}/${cabang.length}] ${c.nama_cabang}`);
      await selectMerchant(page, c.nama_minutes);
      await openCashManagement(page);
      await setPeriod(page, range.from, range.to);
      const m = await readMonthlyExpenseTotal(page);
      const e = erpTotals.get(c.id) || 0;
      const delta = m.total - e;
      if (Math.round(delta) === 0) {
        console.log(`[MONTHLY MATCH] Minutes ${rp(m.total)} = ERP ${rp(e)} -> SKIP DAILY`);
        continue;
      }
      console.log(`[MONTHLY MISMATCH] Minutes ${rp(m.total)} | ERP ${rp(e)} | delta ${rp(delta)} -> DRILLDOWN`);
      await runDrilldown(c.nama_minutes, range);
    }
  } finally {
    await browser.close();
  }
  console.log("\n[MONTHLY GATE] selesai");
}

main().catch(err => { console.error(`[MONTHLY GATE] FATAL: ${err.message}`); process.exit(1); });
