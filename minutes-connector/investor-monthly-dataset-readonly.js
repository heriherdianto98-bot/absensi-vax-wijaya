import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

/**
 * INVESTOR MONTHLY DATASET — READ ONLY
 * Purpose: supply revised Minutes data to Laporan Bulanan Investor only.
 * Safety: SELECT Supabase only for branch mapping. No INSERT/UPDATE/DELETE/UPSERT/RPC write.
 * Never imports/calls sync.js, scheduler.js, DailyDataEngine, payroll, or any LOCKED engine.
 */

const args={};
for(let i=2;i<process.argv.length;i++){
  if(!process.argv[i].startsWith("--")) continue;
  const k=process.argv[i].slice(2);
  args[k]=process.argv[i+1]&&!process.argv[i+1].startsWith("--")?process.argv[++i]:"true";
}

const email=process.env.MINUTES_EMAIL;
const password=process.env.MINUTES_PASSWORD;
const supabaseUrl=process.env.SUPABASE_URL;
const supabaseServiceKey=process.env.SUPABASE_SERVICE_KEY;
const HEADLESS=String(process.env.HEADLESS||"true").toLowerCase()!=="false";
if(!email||!password||!supabaseUrl||!supabaseServiceKey) throw new Error("ENV Minutes/Supabase belum lengkap.");

const sb=createClient(supabaseUrl,supabaseServiceKey);
const branchFilter=String(args.branch||"").trim();
const month=String(args.month||"").trim();
const BASE="https://minutesapps.com";
const LOGIN=`${BASE}/dashboard216a/user/login`;
const DASH=`${BASE}/dashboard216a/`;
const RECAP=`${BASE}/dashboard216a/report/recap/`;
const PROVIDER=`${BASE}/dashboard216a/report/providersales/`;
const PRODUCT=`${BASE}/dashboard216a/report/productsales/`;
const PROVIDER_PRODUCT=`${BASE}/dashboard216a/providerreport/product`;
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pad=n=>String(n).padStart(2,"0");
const norm=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();

function periodOf(v){
  if(!/^\d{4}-\d{2}$/.test(v)) throw new Error("--month harus YYYY-MM");
  const [y,m]=v.split("-").map(Number);
  if(m<1||m>12) throw new Error("Bulan tidak valid.");
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  const dates=Array.from({length:last},(_,i)=>`${y}-${pad(m)}-${pad(i+1)}`);
  return {y,m,last,dates,start:dates[0],end:dates[dates.length-1],range:`${pad(m)}/01/${y} - ${pad(m)}/${pad(last)}/${y}`,labelStart:`01 ${MONTHS[m-1]} ${y}`,labelEnd:`${pad(last)} ${MONTHS[m-1]} ${y}`};
}
const period=periodOf(month);
const minutesDate=ymd=>{const [y,m,d]=ymd.split("-");return `${d} ${MONTHS[Number(m)-1]} ${y}`;};

async function findBranch(){
  const {data,error}=await sb.from("cabang").select("id,kode_cabang,nama_cabang,nama_minutes,aktif,urutan").eq("aktif",true).not("nama_minutes","is",null).order("urutan");
  if(error) throw error;
  const t=norm(branchFilter);
  const found=(data||[]).filter(r=>[r.nama_cabang,r.nama_minutes,r.kode_cabang].map(norm).filter(Boolean).some(x=>x===t||x.includes(t)||t.includes(x)));
  if(found.length!==1) throw new Error(`Cabang harus cocok tepat 1. Filter=${branchFilter}, cocok=${found.length}`);
  return found[0];
}

async function loginSelect(page,branch){
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
  const value=await page.evaluate(name=>{const n=x=>String(x||"").trim().replace(/\s+/g," ").toLowerCase();const s=document.querySelector('select[name="merchant"]');return [...(s?.options||[])].find(o=>n(o.textContent)===n(name))?.value||null;},branch.nama_minutes);
  if(!value) throw new Error(`Merchant Minutes tidak ditemukan: ${branch.nama_minutes}`);
  await Promise.all([
    page.waitForNavigation({waitUntil:"domcontentloaded",timeout:30000}),
    page.evaluate(v=>{const s=document.querySelector('select[name="merchant"]');s.value=v;s.form.submit();},value)
  ]);
}

async function readDaily(page){
  const rows=[];const expenses=[];
  for(const ymd of period.dates){
    await page.goto(`${RECAP}?date=${encodeURIComponent(minutesDate(ymd))}`,{waitUntil:"domcontentloaded",timeout:30000});
    await page.waitForTimeout(250);
    const r=await page.evaluate(()=>{
      const clean=v=>String(v||"").replace(/\u00a0/g," ").trim().replace(/\s+/g," ");
      const upper=v=>clean(v).toUpperCase();
      const num=v=>{const x=String(v||"").replace(/[^\d-]/g,"");return x?Number(x):0;};
      const scope=document.querySelector("ul#sparks")||document.querySelector(".col-sm-10.on-mobile");
      const lines=String(scope?.innerText||"").split(/\n+/).map(clean).filter(Boolean);
      const kpi={};
      for(const label of ["TRANSACTION","CUSTOMER","SERVICES"]){const i=lines.findIndex(x=>upper(x)===label);kpi[label]=i>=0?Number(String(lines[i+1]||"").replace(/[^\d]/g,"")):0;}
      const bodyLines=String(document.querySelector("#content")?.innerText||document.body?.innerText||"").split(/\n+/).map(clean).filter(Boolean);
      const byLabel=label=>{const t=upper(label);for(let i=0;i<bodyLines.length;i++){const u=upper(bodyLines[i]);if(u===t||u.startsWith(t+" ")||u.startsWith(t+":")){const tail=clean(bodyLines[i].slice(label.length));const c=tail||bodyLines[i+1]||"";if(/\d/.test(c))return num(c);}}return 0;};
      const settlement={};
      for(const tr of document.querySelectorAll("#settlementrecap tbody tr")){const c=tr.querySelectorAll("td");const label=clean(c[0]?.textContent||"");if(label)settlement[label]=num(c[1]?.textContent||"");}
      const ex=[];
      const table=document.querySelector('table[data-dt-title="Expense Data"]');
      if(table)for(const tr of table.querySelectorAll("tbody tr")){const c=tr.querySelectorAll("td");const description=clean(c[0]?.textContent||"");const amount=num(c[1]?.textContent||"");const cashier=clean(c[2]?.textContent||"");if(description&&!description.toLowerCase().includes("opening cash")&&amount>0)ex.push({description,amount,cashier});}
      const nonCash=["Gopay","QRIS","QR / TF","Transfer","Visa"].reduce((s,k)=>s+Number(settlement[k]||0),0);
      return {transaction:kpi.TRANSACTION,customer:kpi.CUSTOMER,services:kpi.SERVICES,netServicesSales:byLabel("NET SERVICES SALES"),netProductsSales:byLabel("NET PRODUCTS SALES"),grossRevenue:Number(settlement["Gross Revenue"]||0),cashPayment:Number(settlement["Cash Payment"]||0),nonCash,cashOut:Number(settlement["Cash Out"]||0),productCost:Number(settlement["Product Cost"]||0),netRevenue:Number(settlement["Net Revenue"]||0),expenses:ex};
    });
    const ket=(r.expenses||[]).map(e=>`${e.description} Rp ${Number(e.amount||0).toLocaleString("id-ID")} - Kasir: ${e.cashier||"-"}`).join("; ");
    rows.push({tanggal:ymd,cash_out:r.cashOut,keterangan_cash_out:ket,...r});
    for(const e of r.expenses||[]) expenses.push({tanggal:ymd,...e});
  }
  const sum=k=>rows.reduce((s,r)=>s+Number(r[k]||0),0);
  return {days:rows.length,transaction:sum("transaction"),customer:sum("customer"),services:sum("services"),netServicesSales:sum("netServicesSales"),netProductsSales:sum("netProductsSales"),grossRevenue:sum("grossRevenue"),cashPayment:sum("cashPayment"),nonCash:sum("nonCash"),cashOut:sum("cashOut"),productCost:sum("productCost"),netRevenue:sum("netRevenue"),expenses,rows};
}

async function readProvider(page){
  await page.goto(`${PROVIDER}?range=${encodeURIComponent(period.range)}`,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForTimeout(700);
  const providers=await page.locator("table tbody tr").evaluateAll(rows=>{const out=[],seen=new Set();for(const tr of rows){const a=tr.querySelector('a[href*="providersalesdetail"]');if(!a)continue;const name=tr.querySelector("td")?.textContent?.trim()||a.textContent?.trim()||"";const href=a.getAttribute("href")||"";const k=`${name}|${href}`;if(name&&href&&!seen.has(k)){seen.add(k);out.push({name,href});}}return out;});
  const detail=[];
  for(const p of providers){
    const u=new URL(p.href,BASE);u.searchParams.set("range",period.range);
    await page.goto(u.toString(),{waitUntil:"domcontentloaded",timeout:30000});await page.waitForTimeout(300);
    const d=await page.evaluate(()=>{const n=v=>{const r=String(v||"").replace(/[^\d-]/g,"");return r?Number(r):0;};for(const table of document.querySelectorAll("table")){const rows=[...table.querySelectorAll("tbody tr")];if(!rows.length)continue;const h=[...table.querySelectorAll("thead th")].map(x=>x.textContent.trim().toLowerCase());let is=h.findIndex(x=>x==="service"),ir=h.findIndex(x=>x.includes("revenue share")),isu=h.findIndex(x=>x.includes("sub income")),it=h.findIndex(x=>x.includes("total income"));const first=[...rows[0].querySelectorAll("td")];if((is<0||ir<0)&&first.length>=9){is=3;ir=6;isu=7;it=8;}if(is<0||ir<0)continue;let totalService=0,providerShare=0,subIncome=0,totalIncome=0,valid=0;for(const tr of rows){const c=[...tr.querySelectorAll("td")].map(td=>td.textContent.trim());if(c.length<=Math.max(is,ir))continue;totalService+=n(c[is]);providerShare+=n(c[ir]);subIncome+=isu>=0&&c.length>isu?n(c[isu]):0;totalIncome+=it>=0&&c.length>it?n(c[it]):0;valid++;}if(valid)return{totalService,providerShare,subIncome,totalIncome};}return null;});
    if(!d)throw new Error(`Provider detail tidak terbaca: ${p.name}`);
    detail.push({provider:p.name,...d});
  }
  return {providers:detail.length,totalService:detail.reduce((s,r)=>s+r.totalService,0),providerShare:detail.reduce((s,r)=>s+r.providerShare,0),subIncome:detail.reduce((s,r)=>s+r.subIncome,0),totalIncome:detail.reduce((s,r)=>s+r.totalIncome,0),detail};
}

async function readProduct(page){
  await page.goto(`${PRODUCT}?range=${encodeURIComponent(period.range)}`,{waitUntil:"domcontentloaded",timeout:30000});await page.waitForTimeout(600);
  const detail=await page.locator("table").evaluateAll(tables=>{const n=v=>{const r=String(v||"").replace(/[^\d-]/g,"");return r?Number(r):0;};const out=[];for(const table of tables)for(const tr of table.querySelectorAll("tbody tr")){const c=[...tr.querySelectorAll("td")].map(td=>td.textContent.trim());if(c.length<5)continue;const name=c[0]||"",qty=n(c[3]),sales=n(c[4]);if(name&&qty>0&&sales>0)out.push({name,qty,sales});}return out;});
  return {rows:detail.length,qtySold:detail.reduce((s,r)=>s+r.qty,0),sales:detail.reduce((s,r)=>s+r.sales,0),detail};
}

async function readProviderProduct(page){
  await page.goto(`${PROVIDER_PRODUCT}?range=${encodeURIComponent(period.range)}`,{waitUntil:"domcontentloaded",timeout:30000});await page.waitForTimeout(650);
  const out=await page.evaluate(({startLabel,endLabel})=>{const clean=v=>String(v||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();const low=v=>clean(v).toLowerCase();const n=v=>{const r=String(v||"").replace(/[^\d-]/g,"");return r?Number(r):0;};const raw=String(document.body?.innerText||"");const lines=raw.split(/\n+/).map(clean).filter(Boolean);const body=clean(raw);const periodLine=lines.find(x=>/^report period\b/i.test(x))||"";if(!(low(periodLine).includes(low(startLabel))&&low(periodLine).includes(low(endLabel))))return{ok:false,reason:`period:${periodLine}`};let headerShare=null;for(let i=0;i<lines.length;i++){if(low(lines[i])==="total provider share"&&/\d/.test(lines[i+1]||"")){headerShare=n(lines[i+1]);break;}}if(headerShare==null){for(const el of document.querySelectorAll("li.sparks-info, ul#sparks li, h5")){const m=clean(el.textContent||"").match(/total provider share\s*(?:idr)?\s*([\d.,]+)/i);if(m){headerShare=n(m[1]);break;}}}if(headerShare==null)return{ok:false,reason:"header-share"};for(const table of document.querySelectorAll("table")){const h=[...table.querySelectorAll("thead th, thead td")].map(x=>low(x.textContent));const ip=h.findIndex(x=>x.includes("provider name")),iq=h.findIndex(x=>x==="total"||x.includes("total")),is=h.findIndex(x=>x.includes("revenue share")),ii=h.findIndex(x=>x==="income"||x.includes("income"));if(ip<0||iq<0||is<0||ii<0)continue;const detail=[];for(const tr of table.querySelectorAll("tbody tr")){const c=[...tr.querySelectorAll("td")];const provider=clean(c[ip]?.textContent||"");if(!provider||/no data available/i.test(provider))continue;const share=n(c[is]?.textContent||"");if(share<=0)continue;detail.push({provider,qty:n(c[iq]?.textContent||""),share,income:n(c[ii]?.textContent||"")});}const detailShare=detail.reduce((s,r)=>s+r.share,0);return{ok:detailShare===Number(headerShare||0),reason:detailShare===Number(headerShare||0)?"MATCH":"HEADER_DETAIL_MISMATCH",periodLine,providerShare:Number(headerShare||0),qty:detail.reduce((s,r)=>s+r.qty,0),income:detail.reduce((s,r)=>s+r.income,0),detail};}if(Number(headerShare||0)===0&&/no data available in table/i.test(body))return{ok:true,reason:"NO_DATA",periodLine,providerShare:0,qty:0,income:0,detail:[]};return{ok:false,reason:"table"};},{startLabel:period.labelStart,endLabel:period.labelEnd});
  if(!out.ok)throw new Error(`Provider Product monthly invalid: ${out.reason}`);
  return out;
}

const branch=await findBranch();
console.log("AUDIT_MODE=READ_ONLY");
console.log("MAIN_SYNC_TOUCHED=NO");
console.log("DATABASE_WRITE=NO");
console.log(`BRANCH=${branch.nama_cabang}`);
console.log(`PERIOD=${period.start}..${period.end}`);

const browser=await chromium.launch({headless:HEADLESS});
const page=await browser.newPage({viewport:{width:1500,height:900}});
try{
  await loginSelect(page,branch);
  const daily=await readDaily(page);
  const provider=await readProvider(page);
  const product=await readProduct(page);
  const providerProduct=await readProviderProduct(page);
  const result={schema:"INVESTOR_REVISED_DATASET_V1",mode:"READ_ONLY",mainSyncTouched:false,databaseWrite:false,branch:{id:branch.id,name:branch.nama_cabang,minutesName:branch.nama_minutes},period:{start:period.start,end:period.end,month},dailyRecap:daily,provider,product,providerProduct};
  console.log("AUDIT_RESULT_START");
  console.log(JSON.stringify(result));
  console.log("AUDIT_RESULT_END");
}finally{await browser.close();}
