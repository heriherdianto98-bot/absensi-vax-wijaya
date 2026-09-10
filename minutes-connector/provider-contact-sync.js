import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// ERP VAX — ISOLATED Minutes Contact Sync
// NEW FLOW. Does not modify or import locked provider-master sync code.
// Default DRY RUN. Write only with --apply.
// Scope: cashier employees only; fill karyawan.no_hp_wa only when currently blank.
// Never changes employee id, name, branch, role, active flag, address, or any sales/attendance/payroll data.

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!email || !password || !supabaseUrl || !serviceKey) throw new Error("ENV Minutes/Supabase belum lengkap.");

const APPLY = process.argv.includes("--apply");
const input = process.argv.find(v=>v.startsWith("--input="))?.slice(8) || "/tmp/provider-contact-master-live.json";
const output = process.argv.find(v=>v.startsWith("--out="))?.slice(6) || "/tmp/provider-contact-sync-result.json";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";
const LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";
const GENERIC = new Set(["capster","backup"]);

const norm = (v="") => String(v).trim().replace(/\s+/g," ").toLowerCase();
const cleanPhone = (v="") => String(v || "").replace(/\u00a0/g," ").trim().replace(/\s+/g," ");
const isCashier = (role="") => /kasir/i.test(String(role || ""));

const live = JSON.parse(fs.readFileSync(input,"utf8"));
if (!live?.audit_read_only || !Array.isArray(live.branches) || !live.branches.length) {
  throw new Error("Input provider master live tidak valid/read-only marker hilang.");
}
if (Number(live.summary?.errors || 0) !== 0) throw new Error(`Input provider audit punya error=${live.summary?.errors}`);

const supabase = createClient(supabaseUrl, serviceKey);
const { data:karyawan, error:kErr } = await supabase.from("karyawan")
  .select("id,nama_karyawan,cabang_id,jabatan,aktif,no_hp_wa");
if (kErr) throw kErr;
const { data:identityMap, error:mErr } = await supabase.from("provider_master_identity_map")
  .select("provider_minutes_id,employee_id,provider_name_alias,confirmed_by_owner");
if (mErr) throw mErr;
const { data:history, error:hErr } = await supabase.from("provider_sales_daily_source")
  .select("provider_minutes_id,employee_id,activity_date")
  .not("provider_minutes_id","is",null)
  .not("employee_id","is",null)
  .order("activity_date",{ascending:false});
if (hErr) throw hErr;

const empById = new Map((karyawan||[]).map(e=>[Number(e.id),e]));
const explicitByProvider = new Map((identityMap||[]).map(x=>[String(x.provider_minutes_id),x]));
const historyByProvider = new Map();
for (const r of history || []) {
  const pid=String(r.provider_minutes_id||"");
  if (pid && r.employee_id && !historyByProvider.has(pid)) historyByProvider.set(pid,Number(r.employee_id));
}
const employeesByName = new Map();
for (const e of karyawan || []) {
  const n=norm(e.nama_karyawan);
  if (!n) continue;
  if (!employeesByName.has(n)) employeesByName.set(n,[]);
  employeesByName.get(n).push(e);
}

function resolveEmployee(provider, branchId){
  const pid=String(provider.provider_minutes_id||"");
  const name=norm(provider.provider_name_raw);
  if (!pid || !name || GENERIC.has(name)) return {status:"IGNORED_GENERIC",employee:null};

  const explicit=explicitByProvider.get(pid);
  if (explicit) {
    const e=empById.get(Number(explicit.employee_id)) || null;
    return e ? {status:"MATCHED_EXPLICIT",employee:e} : {status:"BROKEN_EXPLICIT",employee:null};
  }

  const histId=historyByProvider.get(pid);
  if (histId && empById.has(histId)) return {status:"MATCHED_HISTORY",employee:empById.get(histId)};

  const sameBranch=(karyawan||[]).filter(e=>Number(e.cabang_id)===Number(branchId) && norm(e.nama_karyawan)===name);
  if (sameBranch.length===1) return {status:"MATCHED_NAME_BRANCH",employee:sameBranch[0]};

  const globals=employeesByName.get(name)||[];
  if (globals.length===1) return {status:"MATCHED_NAME_GLOBAL",employee:globals[0]};
  if (globals.length>1) return {status:"AMBIGUOUS_NAME",employee:null};
  return {status:"UNMAPPED",employee:null};
}

async function login(page){
  await page.goto(LOGIN_URL,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button",{name:/sign in/i}).click();
  await page.waitForTimeout(3500);
  if (page.url().includes("/user/login")) throw new Error("Login Minutes gagal.");
}

async function switchToMerchant(page){
  const s=page.locator('select[name="switchrole"]');
  await s.waitFor({state:"attached",timeout:20000});
  await Promise.all([
    page.waitForNavigation({waitUntil:"domcontentloaded",timeout:30000}),
    page.evaluate(()=>{
      const el=document.querySelector('select[name="switchrole"]');
      if (!el?.form) throw new Error("switchrole tidak ditemukan");
      el.value="3"; el.form.submit();
    })
  ]);
  await page.waitForTimeout(2200);
}

async function selectBranch(page,namaMinutes){
  await page.goto(DASHBOARD_URL,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForTimeout(900);
  const value=await page.evaluate((target)=>{
    const n=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();
    const s=document.querySelector('select[name="merchant"]');
    if (!s) return null;
    const o=[...s.options].find(x=>n(x.textContent)===n(target));
    return o?.value || null;
  },namaMinutes);
  if (!value) throw new Error(`Merchant tidak ditemukan: ${namaMinutes}`);
  await Promise.all([
    page.waitForNavigation({waitUntil:"domcontentloaded",timeout:30000}),
    page.evaluate((v)=>{
      const s=document.querySelector('select[name="merchant"]');
      if (!s?.form) throw new Error("merchant tidak ditemukan");
      s.value=v; s.form.submit();
    },value)
  ]);
  await page.waitForTimeout(1300);
}

async function readPhone(page,detailUrl){
  const res=await page.goto(detailUrl,{waitUntil:"domcontentloaded",timeout:30000});
  if ((res?.status() || 200) >= 400) throw new Error(`detail HTTP ${res?.status()}`);
  await page.waitForTimeout(500);
  const phone=await page.evaluate(()=>{
    const el=document.querySelector('#prov_phone, input[name="prov_phone"]');
    return String(el?.value || el?.getAttribute('value') || '').trim();
  });
  return cleanPhone(phone);
}

const browser=await chromium.launch({headless:HEADLESS});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const rows=[];
try {
  await login(page);
  await switchToMerchant(page);

  for (const b of live.branches || []) {
    await selectBranch(page,b.nama_minutes);
    for (const p of b.providers || []) {
      const r=resolveEmployee(p,b.cabang_id);
      const e=r.employee;
      if (!e || !isCashier(e.jabatan)) {
        rows.push({cabang_id:b.cabang_id,provider_minutes_id:p.provider_minutes_id,nama_minutes:p.provider_name_raw,mapping_status:r.status,employee_id:e?.id??null,jabatan_erp:e?.jabatan??null,status:"SKIP_NOT_CASHIER_OR_UNMAPPED"});
        continue;
      }
      if (!p.detail_url) {
        rows.push({cabang_id:b.cabang_id,provider_minutes_id:p.provider_minutes_id,nama_minutes:p.provider_name_raw,mapping_status:r.status,employee_id:e.id,jabatan_erp:e.jabatan,status:"SKIP_NO_DETAIL_URL"});
        continue;
      }

      let minutesPhone="";
      let detailError=null;
      try { minutesPhone=await readPhone(page,p.detail_url); }
      catch(err){ detailError=err.message; }

      const current=cleanPhone(e.no_hp_wa || "");
      let status="NO_CHANGE";
      if (detailError) status="DETAIL_ERROR";
      else if (!minutesPhone) status="MINUTES_PHONE_EMPTY";
      else if (current) status="ERP_PHONE_PRESERVED";
      else status="READY_TO_FILL";

      rows.push({
        cabang_id:b.cabang_id,
        provider_minutes_id:p.provider_minutes_id,
        nama_minutes:p.provider_name_raw,
        mapping_status:r.status,
        employee_id:e.id,
        nama_erp:e.nama_karyawan,
        jabatan_erp:e.jabatan,
        phone_minutes:minutesPhone || null,
        phone_erp_before:current || null,
        status,
        detail_error:detailError
      });
    }
  }
} finally {
  await browser.close();
}

const blockers=rows.filter(r=>["AMBIGUOUS_NAME","BROKEN_EXPLICIT"].includes(r.mapping_status));
const detailErrors=rows.filter(r=>r.status==="DETAIL_ERROR");
const ready=rows.filter(r=>r.status==="READY_TO_FILL");
const applied=[];

if (APPLY) {
  if (blockers.length) throw new Error(`CONTACT SYNC BLOCKED identity blockers=${blockers.length}`);
  if (detailErrors.length) throw new Error(`CONTACT SYNC BLOCKED detail errors=${detailErrors.length}`);

  for (const r of ready) {
    const { data:updated, error:uErr }=await supabase.from("karyawan")
      .update({no_hp_wa:r.phone_minutes})
      .eq("id",r.employee_id)
      .is("no_hp_wa",null)
      .select("id,nama_karyawan,no_hp_wa")
      .maybeSingle();
    if (uErr) throw new Error(`Update contact employee ${r.employee_id} gagal: ${uErr.message}`);
    if (updated) applied.push({employee_id:r.employee_id,nama_karyawan:updated.nama_karyawan,no_hp_wa:updated.no_hp_wa});
  }
}

const summary={
  mode:APPLY?"APPLY":"DRY_RUN",
  cashier_rows:rows.filter(r=>r.employee_id && isCashier(r.jabatan_erp)).length,
  ready_to_fill:ready.length,
  erp_phone_preserved:rows.filter(r=>r.status==="ERP_PHONE_PRESERVED").length,
  minutes_phone_empty:rows.filter(r=>r.status==="MINUTES_PHONE_EMPTY").length,
  detail_errors:detailErrors.length,
  identity_blockers:blockers.length,
  applied:applied.length
};

const payload={
  generated_at:new Date().toISOString(),
  source:"MINUTES_PROVIDER_DETAIL_PROV_PHONE",
  isolated_contact_sync:true,
  write_scope:["karyawan.no_hp_wa"],
  policy:{target_role:"Kasir",fill_blank_only:true,preserve_existing_erp_phone:true},
  summary,
  rows,
  applied
};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(payload,null,2));
console.log(JSON.stringify(summary,null,2));
console.log(`OUTPUT=${output}`);
console.log(`WRITE_MODE=${APPLY?"TRUE":"FALSE"}`);
