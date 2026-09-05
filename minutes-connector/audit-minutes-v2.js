import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadDailyDataEngine, readErpCanonical } from "./compare-erp-engine-v2.js";

// ======================================================
// VAX ERP — MINUTES AUDIT RUNNER V2 BULK (READ ONLY)
// Satu kali buka Daily Recap per tanggal+cabang, lalu loop semua field.
// Tidak mengubah Minutes, Supabase, DailyDataEngine, atau SetoranMoneyEngine.
// ======================================================

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
if (!email || !password || !supabaseUrl || !supabaseServiceKey) throw new Error("Env Minutes/Supabase belum lengkap.");

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";
const DAILY_RECAP_URL = "https://minutesapps.com/dashboard216a/report/recap/";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";
const ERP_DAILY_ENGINE_PATH = process.env.ERP_DAILY_ENGINE_PATH || "./daily-data-engine.audit-v2.js";

const norm = (v = "") => String(v).trim().replace(/\s+/g, " ").toLowerCase();
const num = (v) => Number(v || 0);
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
  }
  return out;
}
function formatDateMinutes(ymd) {
  const [y, m, d] = String(ymd || "").split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (!y || !months[Number(m)-1] || !d) throw new Error(`Tanggal tidak valid: ${ymd}`);
  return `${d} ${months[Number(m)-1]} ${y}`;
}
function dateRange(start, end) {
  const rows = [], cur = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) throw new Error("Range tanggal audit tidak valid.");
  while (cur <= last) { rows.push(cur.toISOString().slice(0,10)); cur.setUTCDate(cur.getUTCDate()+1); }
  return rows;
}
function branchMatches(row, filter) {
  const target = norm(filter);
  if (!target || target === "all") return true;
  return [row?.nama_cabang,row?.nama_minutes,row?.kode_cabang].map(norm).filter(Boolean)
    .some(v => v === target || v.includes(target) || target.includes(v));
}
async function fetchBranches(filter) {
  const { data, error } = await supabase.from("cabang")
    .select("id,kode_cabang,nama_cabang,nama_minutes,urutan,aktif")
    .eq("aktif", true).not("nama_minutes", "is", null).order("urutan", { ascending:true });
  if (error) throw error;
  let rows = (data || []).filter(r => r.id && r.nama_cabang && r.nama_minutes);
  if (filter && norm(filter) !== "all") rows = rows.filter(r => branchMatches(r, filter));
  if (!rows.length) throw new Error(`Cabang tidak ditemukan: ${filter}`);
  return rows;
}
async function fetchDailyRows(start, end, branchIds) {
  const { data, error } = await supabase.from("daily_recap_source").select("*")
    .gte("tanggal", start).lte("tanggal", end).in("cabang_id", branchIds).order("tanggal", { ascending:true });
  if (error) throw error;
  return new Map((data || []).map(r => [`${r.tanggal}|${r.cabang_id}`, r]));
}
async function fetchMinutesDaily(start, end, branches) {
  const names = branches.map(b => b.nama_minutes);
  const { data, error } = await supabase.from("minutes_daily").select("*")
    .gte("tanggal", start).lte("tanggal", end).in("cabang", names).order("tanggal", { ascending:true });
  if (error) throw error;
  return new Map((data || []).map(r => [`${r.tanggal}|${norm(r.cabang)}`, r]));
}
async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name:/sign in/i }).click();
  await page.waitForTimeout(4000);
  if (page.url().includes("/user/login")) throw new Error("Login Minutes gagal.");
}
async function switchToMerchant(page) {
  const el = page.locator('select[name="switchrole"]');
  await el.waitFor({ state:"attached", timeout:20000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil:"domcontentloaded", timeout:30000 }),
    page.evaluate(() => { const s=document.querySelector('select[name="switchrole"]'); s.value="3"; s.form.submit(); })
  ]);
  await page.waitForTimeout(2500);
}
async function selectBranch(page, branch) {
  await page.goto(DASHBOARD_URL, { waitUntil:"domcontentloaded", timeout:30000 });
  const sel = page.locator('select[name="merchant"]');
  await sel.waitFor({ state:"attached", timeout:20000 });
  const option = await page.evaluate((name) => {
    const n = v => String(v||"").trim().replace(/\s+/g," ").toLowerCase();
    const s = document.querySelector('select[name="merchant"]');
    const o = [...s.options].find(x => n(x.textContent) === n(name));
    return o ? o.value : null;
  }, branch.nama_minutes);
  if (!option) throw new Error(`Merchant Minutes tidak ditemukan: ${branch.nama_minutes}`);
  await Promise.all([
    page.waitForNavigation({ waitUntil:"domcontentloaded", timeout:30000 }),
    page.evaluate((value) => { const s=document.querySelector('select[name="merchant"]'); s.value=value; s.form.submit(); }, option)
  ]);
  await page.waitForTimeout(2200);
}

async function readAllMinutesDailyRecap(page, ymd) {
  await page.goto(`${DAILY_RECAP_URL}?date=${encodeURIComponent(formatDateMinutes(ymd))}`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForTimeout(5000);
  return page.evaluate(() => {
    const clean = (v="") => String(v).replace(/\u00a0/g," ").trim().replace(/\s+/g," ");
    const upper = (v="") => clean(v).toUpperCase();
    const money = (v="") => { const x=String(v).replace(/[^\d-]/g,""); return x ? Number(x) : 0; };

    const kpi = {};
    const scope = document.querySelector("ul#sparks") || document.querySelector(".col-sm-10.on-mobile");
    const lines = String(scope?.innerText || "").split(/\n+/).map(clean).filter(Boolean);
    for (const label of ["TRANSACTION","CUSTOMER","SERVICES"]) {
      const idx = lines.findIndex(x => upper(x) === label);
      kpi[label] = idx >= 0 ? Number(String(lines[idx+1]||"").replace(/[^\d]/g,"")) : null;
    }

    const bodyLines = String(document.querySelector("#content")?.innerText || document.body?.innerText || "")
      .split(/\n+/).map(clean).filter(Boolean);
    function byLabel(label) {
      const target = upper(label);
      for (let i=0;i<bodyLines.length;i++) {
        const u=upper(bodyLines[i]);
        if (u === target || u.startsWith(target+" ") || u.startsWith(target+":")) {
          const tail = clean(bodyLines[i].slice(label.length));
          const cand = tail || bodyLines[i+1] || "";
          if (/\d/.test(cand)) return money(cand);
        }
      }
      return null;
    }

    const settlement = {};
    for (const row of document.querySelectorAll("#settlementrecap tbody tr")) {
      const cells = row.querySelectorAll("td");
      const label = clean(cells[0]?.textContent || "");
      if (label) settlement[label] = money(cells[1]?.textContent || "");
    }

    const expenses = [];
    const expenseTable = document.querySelector('table[data-dt-title="Expense Data"]');
    if (expenseTable) {
      for (const row of expenseTable.querySelectorAll("tbody tr")) {
        const cells=row.querySelectorAll("td");
        const description=clean(cells[0]?.textContent||"");
        const amount=money(cells[1]?.textContent||"");
        const cashier=clean(cells[2]?.textContent||"");
        if (description && !description.toLowerCase().includes("opening cash") && amount>0) expenses.push({description,amount,cashier});
      }
    }

    const nonCash = ["Gopay","QRIS","QR / TF","Transfer","Visa"].reduce((t,k)=>t+Number(settlement[k]||0),0);
    return {
      transaction:kpi.TRANSACTION, customer:kpi.CUSTOMER, services:kpi.SERVICES,
      netServicesSales:byLabel("NET SERVICES SALES"),
      netProductsSales:byLabel("NET PRODUCTS SALES"),
      grossRevenue:Number(settlement["Gross Revenue"]||0),
      revenue:Number(settlement["Revenue"]||0),
      cashPayment:Number(settlement["Cash Payment"]||0),
      gopay:Number(settlement["Gopay"]||0), qris:Number(settlement["QRIS"]||0),
      qrTf:Number(settlement["QR / TF"]||0), transfer:Number(settlement["Transfer"]||0), visa:Number(settlement["Visa"]||0),
      nonCash, totalPayment:Number(settlement["Total Payment"]||0), totalShare:Number(settlement["Total Share"]||0),
      cashIn:Number(settlement["Cash In"]||0), cashOut:Number(settlement["Cash Out"]||0),
      productCost:Number(settlement["Product Cost"]||0), thirdPartyCharges:Number(settlement["3rd Party Charges"]||0),
      netRevenue:Number(settlement["Net Revenue"]||0), expenses, settlement
    };
  });
}

// Mapping loop: hanya field yang memang punya pasangan canonical dibandingkan otomatis.
const FIELD_MAP = [
  ["transaction", m=>m.transaction, d=>num(d?.transaction_minutes), e=>num(e?.transaction)],
  ["customer", m=>m.customer, d=>num(d?.customer_minutes), e=>num(e?.customer)],
  ["services", m=>m.services, d=>num(d?.services_minutes), e=>num(e?.services)],
  ["netServicesSales", m=>m.netServicesSales, d=>num(d?.service), e=>num(e?.netServicesSales)],
  ["netProductsSales", m=>m.netProductsSales, d=>num(d?.produk), e=>num(e?.netProductsSales)],
  ["grossOmzet", m=>m.grossRevenue, d=>num(d?.service)+num(d?.produk), e=>num(e?.grossOmzet)],
  ["cashPayment", m=>m.cashPayment, d=>num(d?.cash_payment), e=>num(e?.cashPayment)],
  ["nonCash", m=>m.nonCash, d=>num(d?.non_cash), e=>num(e?.nonCash)],
  ["cashOut", m=>m.cashOut, d=>num(d?.cash_out), e=>num(e?.cashOut)],
  ["productCost", m=>m.productCost, d=>num(d?.product_cost), e=>num(e?.productCost)],
  ["netRevenueMinutes", m=>m.netRevenue, d=>num(d?.nett_revenue), e=>num(e?.netRevenueMinutes)]
];
const MINUTES_DAILY_MAP = [
  ["grossRevenue","gross_revenue"],["revenue","revenue"],["cashPayment","cash_payment"],["nonCash","non_cash"],
  ["totalPayment","total_payment"],["totalShare","total_share"],["cashIn","cash_in"],["cashOut","cash_out"],
  ["productCost","product_cost"],["thirdPartyCharges","third_party_charges"],["netRevenue","net_revenue"]
];

const args=parseArgs(process.argv.slice(2));
const start=args.start||process.env.AUDIT_START;
const end=args.end||process.env.AUDIT_END||start;
const branchFilter=args.branch||process.env.AUDIT_BRANCH||"all";
if (!start || !end) throw new Error("Tanggal audit wajib.");
const dates=dateRange(start,end);
const branches=await fetchBranches(branchFilter);
const dailyRows=await fetchDailyRows(start,end,branches.map(b=>b.id));
const minutesDailyRows=await fetchMinutesDaily(start,end,branches);
const engine=loadDailyDataEngine(ERP_DAILY_ENGINE_PATH);

console.log("AUDIT_READ_ONLY=TRUE");
console.log("AUDIT_VERSION=MINUTES_AUDIT_RUNNER_V2_BULK");
console.log(`AUDIT_RANGE=${start}..${end}`);
console.log(`AUDIT_BRANCHES=${branches.length}`);
console.log(`AUDIT_FIELDS_3LAYER=${FIELD_MAP.map(x=>x[0]).join(",")}`);
console.log(`AUDIT_FIELDS_MINUTES_DAILY=${MINUTES_DAILY_MAP.map(x=>x[0]).join(",")}`);

const browser=await chromium.launch({headless:HEADLESS});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const results=[];
try {
  await login(page); await switchToMerchant(page);
  for (const branch of branches) {
    await selectBranch(page,branch);
    for (const date of dates) {
      const minutes=await readAllMinutesDailyRecap(page,date);
      const db=dailyRows.get(`${date}|${branch.id}`)||null;
      const md=minutesDailyRows.get(`${date}|${norm(branch.nama_minutes)}`)||null;
      const erp=readErpCanonical(engine,db,branch);
      const checks=[];
      for (const [field,mf,df,ef] of FIELD_MAP) {
        const mv=num(mf(minutes)), sv=num(df(db)), ev=num(ef(erp));
        checks.push({field,minutes:mv,supabase:sv,erp:ev,status:(mv===sv&&sv===ev)?"MATCH":"MISMATCH"});
      }
      for (const [field,col] of MINUTES_DAILY_MAP) {
        const mv=num(minutes[field]), stored=num(md?.[col]);
        checks.push({field:`minutes_daily.${field}`,minutes:mv,supabaseMinutesDaily:stored,status:mv===stored?"MATCH":"MISMATCH"});
      }
      const mismatches=checks.filter(c=>c.status!=="MATCH");
      results.push({tanggal:date,cabang:branch.nama_cabang,minutes,checks,status:mismatches.length?"MISMATCH":"MATCH",mismatches});
      console.log(`${mismatches.length?"❌":"✅"} ${date} | ${branch.nama_cabang} | checked=${checks.length} | mismatch=${mismatches.length}`);
      for (const c of mismatches) console.log(`  MISMATCH ${c.field}: ${JSON.stringify(c)}`);
    }
  }
} finally { await browser.close(); }

const mismatches=results.filter(r=>r.status==="MISMATCH");
console.log("AUDIT_SUMMARY_BEGIN");
console.log(JSON.stringify({version:"V2_BULK",start,end,branchFilter,branches:branches.length,branchDays:results.length,
  fieldsThreeLayer:FIELD_MAP.map(x=>x[0]),fieldsMinutesDaily:MINUTES_DAILY_MAP.map(x=>x[0]),
  totalChecks:results.reduce((t,r)=>t+r.checks.length,0),mismatchBranchDays:mismatches.length,mismatches},null,2));
console.log("AUDIT_SUMMARY_END");
if (mismatches.length) process.exitCode=2;
