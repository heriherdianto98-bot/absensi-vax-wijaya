import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

/**
 * INVESTOR REVISED YEAR TREND — READ ONLY
 * Wraps the proven monthly investor collector, then adds Jan–Dec Minutes LIVE
 * monthly omzet summaries for performance cards/chart.
 *
 * SAFETY:
 * - no INSERT / UPDATE / DELETE / UPSERT / RPC write
 * - never imports/calls sync.js or scheduler
 * - never writes canonical/frozen ERP tables
 */

const args={};
for(let i=2;i<process.argv.length;i++){
  if(!process.argv[i].startsWith("--")) continue;
  const k=process.argv[i].slice(2);
  args[k]=process.argv[i+1]&&!process.argv[i+1].startsWith("--")?process.argv[++i]:"true";
}

const branch=String(args.branch||"").trim();
const month=String(args.month||"").trim();
if(!branch) throw new Error("--branch wajib diisi");
if(!/^\d{4}-\d{2}$/.test(month)) throw new Error("--month harus YYYY-MM");

const email=process.env.MINUTES_EMAIL;
const password=process.env.MINUTES_PASSWORD;
const HEADLESS=String(process.env.HEADLESS||"true").toLowerCase()!=="false";
if(!email||!password) throw new Error("ENV Minutes belum lengkap.");

const BASE="https://minutesapps.com";
const LOGIN=`${BASE}/dashboard216a/user/login`;
const DASH=`${BASE}/dashboard216a/`;
const PROVIDER=`${BASE}/dashboard216a/report/providersales/`;
const PRODUCT=`${BASE}/dashboard216a/report/productsales/`;
const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const pad=n=>String(n).padStart(2,"0");
const norm=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const baseRunner=path.join(__dirname,"investor-monthly-dataset-readonly.js");

function rangeOf(year,m){
  const last=new Date(Date.UTC(year,m,0)).getUTCDate();
  return `${pad(m)}/01/${year} - ${pad(m)}/${pad(last)}/${year}`;
}

function runBase(){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[baseRunner,"--branch",branch,"--month",month],{
      cwd:__dirname,env:process.env,stdio:["ignore","pipe","pipe"]
    });
    let out="",err="";
    child.stdout.on("data",d=>out+=d.toString());
    child.stderr.on("data",d=>err+=d.toString());
    child.on("error",reject);
    child.on("close",code=>{
      if(code!==0) return reject(new Error(`Monthly collector gagal (${code}) · ${err||out}`));
      const s=out.indexOf("AUDIT_RESULT_START");
      const e=out.indexOf("AUDIT_RESULT_END");
      if(s<0||e<0||e<=s) return reject(new Error("Monthly collector tidak menghasilkan marker JSON."));
      const raw=out.slice(s+"AUDIT_RESULT_START".length,e).trim();
      try{ resolve(JSON.parse(raw)); }
      catch(parseErr){ reject(new Error(`JSON monthly collector invalid · ${parseErr.message}`)); }
    });
  });
}

async function loginSelect(page,minutesName){
  await page.goto(LOGIN,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button",{name:/sign in/i}).click();
  await page.waitForTimeout(2200);
  if(page.url().includes("/user/login")) throw new Error("Login Minutes gagal.");

  await page.locator('select[name="switchrole"]').waitFor({state:"attached",timeout:20000});
  await Promise.all([
    page.waitForNavigation({waitUntil:"domcontentloaded",timeout:30000}),
    page.evaluate(()=>{const s=document.querySelector('select[name="switchrole"]');if(!s?.form)throw new Error("Role dropdown tidak ditemukan");s.value="3";s.form.submit();})
  ]);
  await page.goto(DASH,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator('select[name="merchant"]').waitFor({state:"attached",timeout:20000});
  const value=await page.evaluate(name=>{
    const n=x=>String(x||"").trim().replace(/\s+/g," ").toLowerCase();
    const s=document.querySelector('select[name="merchant"]');
    return [...(s?.options||[])].find(o=>n(o.textContent)===n(name))?.value||null;
  },minutesName);
  if(!value) throw new Error(`Merchant Minutes tidak ditemukan: ${minutesName}`);
  await Promise.all([
    page.waitForNavigation({waitUntil:"domcontentloaded",timeout:30000}),
    page.evaluate(v=>{const s=document.querySelector('select[name="merchant"]');s.value=v;s.form.submit();},value)
  ]);
}

async function providerSummary(page,range){
  await page.goto(`${PROVIDER}?range=${encodeURIComponent(range)}`,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForTimeout(450);

  const direct=await page.evaluate(()=>{
    const n=v=>{const x=String(v||"").replace(/[^\d-]/g,"");return x?Number(x):0;};
    for(const table of document.querySelectorAll("table")){
      const headers=[...table.querySelectorAll("thead th,thead td")].map(x=>String(x.textContent||"").trim().toLowerCase());
      const idx=headers.findIndex(x=>x.includes("total income"));
      if(idx<0) continue;
      let total=0,rows=0;
      for(const tr of table.querySelectorAll("tbody tr")){
        const cells=[...tr.querySelectorAll("td")];
        if(cells.length<=idx) continue;
        const v=n(cells[idx]?.textContent||"");
        if(v>0){total+=v;rows++;}
      }
      if(rows>0) return {ok:true,total};
    }
    return {ok:false,total:0};
  });
  if(direct.ok) return Number(direct.total||0);

  // Fallback READ ONLY: sum provider detail Total Income exactly like monthly collector.
  const providers=await page.locator("table tbody tr").evaluateAll(rows=>{
    const out=[],seen=new Set();
    for(const tr of rows){
      const a=tr.querySelector('a[href*="providersalesdetail"]');
      if(!a) continue;
      const href=a.getAttribute("href")||"";
      if(href&&!seen.has(href)){seen.add(href);out.push(href);}
    }
    return out;
  });
  let total=0;
  for(const href of providers){
    const u=new URL(href,BASE);u.searchParams.set("range",range);
    await page.goto(u.toString(),{waitUntil:"domcontentloaded",timeout:30000});
    await page.waitForTimeout(220);
    total+=await page.evaluate(()=>{
      const n=v=>{const x=String(v||"").replace(/[^\d-]/g,"");return x?Number(x):0;};
      for(const table of document.querySelectorAll("table")){
        const headers=[...table.querySelectorAll("thead th")].map(x=>String(x.textContent||"").trim().toLowerCase());
        let idx=headers.findIndex(x=>x.includes("total income"));
        const rows=[...table.querySelectorAll("tbody tr")];
        if(idx<0&&rows[0]?.querySelectorAll("td")?.length>=9) idx=8;
        if(idx<0) continue;
        return rows.reduce((s,tr)=>s+n([...tr.querySelectorAll("td")][idx]?.textContent||""),0);
      }
      return 0;
    });
  }
  return total;
}

async function productSummary(page,range){
  await page.goto(`${PRODUCT}?range=${encodeURIComponent(range)}`,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForTimeout(420);
  return page.locator("table").evaluateAll(tables=>{
    const n=v=>{const x=String(v||"").replace(/[^\d-]/g,"");return x?Number(x):0;};
    let total=0;
    for(const table of tables){
      const headers=[...table.querySelectorAll("thead th,thead td")].map(x=>String(x.textContent||"").trim().toLowerCase());
      let idx=headers.findIndex(x=>x==="sales"||x.includes("sales"));
      if(idx<0) idx=4;
      for(const tr of table.querySelectorAll("tbody tr")){
        const c=[...tr.querySelectorAll("td")];
        if(c.length<=idx) continue;
        const name=String(c[0]?.textContent||"").trim();
        const value=n(c[idx]?.textContent||"");
        if(name&&value>0) total+=value;
      }
    }
    return total;
  });
}

async function readYearTrend(base){
  const [year,activeMonth]=month.split("-").map(Number);
  const browser=await chromium.launch({headless:HEADLESS});
  const page=await browser.newPage({viewport:{width:1450,height:900}});
  try{
    await loginSelect(page,base?.branch?.minutesName||branch);
    const months=[];
    for(let m=1;m<=12;m++){
      if(m===activeMonth){
        const service=Number(base?.provider?.totalIncome||base?.dailyRecap?.netServicesSales||0);
        const product=Number(base?.product?.sales||0);
        months.push({month:m,label:MONTHS[m-1],service,product,omzet:service+product,source:"ACTIVE_MONTH_DATASET"});
        continue;
      }
      const range=rangeOf(year,m);
      const service=await providerSummary(page,range);
      const product=await productSummary(page,range);
      months.push({month:m,label:MONTHS[m-1],service,product,omzet:service+product,source:"MINUTES_MONTHLY_REPORT"});
    }
    const values=months.map(r=>Number(r.omzet||0));
    const total=values.reduce((a,b)=>a+b,0);
    const peak=Math.max(...values,0);
    const peakIndex=values.findIndex(v=>v===peak);
    const current=values[activeMonth-1]||0;
    const previous=activeMonth>1?(values[activeMonth-2]||0):0;
    const growthPct=previous>0?((current-previous)/previous)*100:null;
    return {year,activeMonth,months,total,peak,peakMonth:peakIndex>=0?peakIndex+1:null,previous,current,growthPct,source:"MINUTES_LIVE_READ_ONLY_YEARLY"};
  }finally{
    await browser.close();
  }
}

console.log("AUDIT_MODE=READ_ONLY");
console.log("MAIN_SYNC_TOUCHED=NO");
console.log("DATABASE_WRITE=NO");
console.log("YEAR_TREND_SOURCE=MINUTES_LIVE_READ_ONLY");

const base=await runBase();
const yearTrend=await readYearTrend(base);
const result={...base,schema:"INVESTOR_REVISED_DATASET_V2",yearTrend,mode:"READ_ONLY",mainSyncTouched:false,databaseWrite:false};
console.log("AUDIT_RESULT_START");
console.log(JSON.stringify(result));
console.log("AUDIT_RESULT_END");
