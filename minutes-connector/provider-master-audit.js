import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// ERP VAX — Minutes Provider Master Audit (READ ONLY)
// Tujuan: ambil master provider Minutes asli: provider_id, nama, service/type, status, cabang.
// Tidak menulis ke Minutes, Supabase, atau engine ERP mana pun.

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
if (!email || !password || !supabaseUrl || !supabaseServiceKey) {
  throw new Error("ENV Minutes/Supabase belum lengkap.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";
const PROVIDER_DATA_URL = "https://minutesapps.com/dashboard216a/provider/data";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";
const OUT = process.argv.find(v => v.startsWith("--out="))?.slice(6) || "audit/provider-master-live.json";
const FILTER = process.argv.find(v => v.startsWith("--branch="))?.slice(9) || "all";

const norm = (v="") => String(v).trim().replace(/\s+/g," ").toLowerCase();

async function fetchBranches(){
  const { data, error } = await supabase.from("cabang")
    .select("id,nama_cabang,nama_minutes,urutan,aktif")
    .eq("aktif", true)
    .not("nama_minutes", "is", null)
    .order("urutan", { ascending:true });
  if (error) throw error;
  return (data || [])
    .filter(r => Number(r.id) >= 1 && Number(r.id) <= 10 && r.nama_minutes)
    .filter(r => FILTER === "all" || [r.nama_cabang,r.nama_minutes].some(x => norm(x).includes(norm(FILTER))));
}

async function login(page){
  await page.goto(LOGIN_URL, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name:/sign in/i }).click();
  await page.waitForTimeout(3500);
  if (page.url().includes("/user/login")) throw new Error("Login Minutes gagal.");
}

async function switchToMerchant(page){
  const s = page.locator('select[name="switchrole"]');
  await s.waitFor({ state:"attached", timeout:20000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil:"domcontentloaded", timeout:30000 }),
    page.evaluate(() => {
      const el=document.querySelector('select[name="switchrole"]');
      if (!el?.form) throw new Error("switchrole tidak ditemukan");
      el.value="3";
      el.form.submit();
    })
  ]);
  await page.waitForTimeout(2200);
}

async function selectBranch(page, branch){
  await page.goto(DASHBOARD_URL, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForTimeout(1000);
  const value = await page.evaluate((target) => {
    const n=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();
    const s=document.querySelector('select[name="merchant"]');
    if (!s) return null;
    const o=[...s.options].find(x=>n(x.textContent)===n(target));
    return o?.value || null;
  }, branch.nama_minutes);
  if (!value) throw new Error(`Merchant tidak ditemukan: ${branch.nama_minutes}`);
  await Promise.all([
    page.waitForNavigation({ waitUntil:"domcontentloaded", timeout:30000 }),
    page.evaluate((v)=>{
      const s=document.querySelector('select[name="merchant"]');
      if (!s?.form) throw new Error("merchant tidak ditemukan");
      s.value=v; s.form.submit();
    }, value)
  ]);
  await page.waitForTimeout(1600);
}

async function readProviderRows(page){
  return page.evaluate(() => {
    const clean=v=>String(v||"").replace(/\u00a0/g," ").trim().replace(/\s+/g," ");
    const out=[];
    const seen=new Set();
    for (const tr of document.querySelectorAll("table tbody tr")) {
      const detail=tr.querySelector('a[href*="/provider/detail/"]');
      const rowId=tr.getAttribute("data-id") || "";
      const href=detail?.getAttribute("href") || "";
      const id=(href.match(/\/provider\/detail\/(\d+)/i)||[])[1] || (/^\d+$/.test(rowId) ? rowId : null);
      const cells=[...tr.querySelectorAll("td")].map(td=>clean(td.textContent));
      const name=clean(cells[0]);
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      const statusCell=cells.find(v=>/^(active|inactive|nonactive|non-active)$/i.test(v)) || "";
      const service=cells.slice(1).find(v=>v && !/^(active|inactive|nonactive|non-active|edit|delete|clone)$/i.test(v)) || "";
      out.push({
        provider_minutes_id:id,
        provider_name_raw:name,
        service_or_type:service,
        status_raw:statusCell,
        active:/^active$/i.test(statusCell),
        detail_url:href ? new URL(href, location.origin).toString() : null
      });
    }
    return out;
  });
}

const branches=await fetchBranches();
if (!branches.length) throw new Error(`Cabang tidak ditemukan untuk filter: ${FILTER}`);

const browser=await chromium.launch({ headless:HEADLESS });
const page=await browser.newPage({ viewport:{width:1500,height:900} });
const results=[];
try {
  await login(page);
  await switchToMerchant(page);
  for (const branch of branches) {
    try {
      await selectBranch(page, branch);
      const res=await page.goto(PROVIDER_DATA_URL, { waitUntil:"domcontentloaded", timeout:30000 });
      await page.waitForTimeout(3500);
      const title=await page.title();
      if (/forbidden access/i.test(title)) throw new Error("Provider Data forbidden untuk role Merchant");
      const rows=await readProviderRows(page);
      results.push({
        cabang_id:branch.id,
        cabang:branch.nama_cabang,
        nama_minutes:branch.nama_minutes,
        provider_list_url:PROVIDER_DATA_URL,
        http_status:res?.status() || null,
        providers:rows
      });
      console.log(`✅ ${branch.nama_cabang}: ${rows.length} provider master terbaca`);
    } catch (err) {
      results.push({cabang_id:branch.id,cabang:branch.nama_cabang,nama_minutes:branch.nama_minutes,error:err.message,providers:[]});
      console.error(`❌ ${branch.nama_cabang}: ${err.message}`);
    }
  }
} finally {
  await browser.close();
}

const payload={
  audit_read_only:true,
  generated_at:new Date().toISOString(),
  source:"MINUTES_PROVIDER_MASTER_LIVE",
  branch_filter:FILTER,
  branches:results,
  summary:{
    branches:results.length,
    providers:results.reduce((n,r)=>n+(r.providers?.length||0),0),
    errors:results.filter(r=>r.error).length
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive:true });
fs.writeFileSync(OUT, JSON.stringify(payload,null,2));
console.log(`OUTPUT=${OUT}`);
console.log(JSON.stringify(payload.summary));
if (payload.summary.errors) process.exitCode=1;
