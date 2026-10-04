/* Dashboard Kasir Consumer · LOCAL ONLY
   Consumer dari source canonical ERP Owner. Tidak membuat engine baru dan tidak menulis ke Supabase. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const rp=v=>"Rp"+Math.round(Number(v)||0).toLocaleString("id-ID");
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const localHost=()=>/^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const isoToday=()=>{
    const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const x=t=>p.find(a=>a.type===t)?.value||"";
    return `${x("year")}-${x("month")}-${x("day")}`;
  };
  const selectedDate=()=>document.getElementById("employeeDatePicker")?.value||isoToday();
  const isUltimate=s=>/\b(enakin\s*kepala|enakinkepala|max|relax|reguler|regular|plus)\b/i.test(String(s||"").replace(/\s+/g," ").trim());

  // Fixture lokal read-only 3 Okt 2026, hanya untuk uji UI saat RLS employee menolak source Owner.
  const localFixture={
    date:"2026-10-03",
    "1":{ultimateTarget:8557500,ultimateCount:2,ultimateReal:190000,omzetTarget:46299750,omzetReal:3900000,customerToday:4,produkMonth:170000,produkToday:0,trxToday:2},
    "2":{ultimateTarget:8515500,ultimateCount:6,ultimateReal:490000,omzetTarget:28820000,omzetReal:2735000,customerToday:7,produkMonth:15000,produkToday:0,trxToday:7},
    "3":{ultimateTarget:4740000,ultimateCount:6,ultimateReal:510000,omzetTarget:23805000,omzetReal:1930000,customerToday:3,produkMonth:10000,produkToday:0,trxToday:3},
    "4":{ultimateTarget:5000000,ultimateCount:9,ultimateReal:730000,omzetTarget:27801250,omzetReal:1990000,customerToday:2,produkMonth:0,produkToday:0,trxToday:3},
    "5":{ultimateTarget:10494000,ultimateCount:16,ultimateReal:1235000,omzetTarget:33465000,omzetReal:3080000,customerToday:7,produkMonth:125000,produkToday:0,trxToday:7,kasbonMonth:0,productRows:[]},
    "6":{ultimateTarget:4000000,ultimateCount:2,ultimateReal:195000,omzetTarget:18370000,omzetReal:1695000,customerToday:1,produkMonth:10000,produkToday:0,trxToday:1},
    "7":{ultimateTarget:11340000,ultimateCount:8,ultimateReal:695000,omzetTarget:28770000,omzetReal:1760000,customerToday:3,produkMonth:25000,produkToday:10000,trxToday:3},
    "8":{ultimateTarget:11688000,ultimateCount:5,ultimateReal:590000,omzetTarget:37610750,omzetReal:2625000,customerToday:5,produkMonth:0,produkToday:0,trxToday:6},
    "9":{ultimateTarget:11748000,ultimateCount:19,ultimateReal:1560000,omzetTarget:38111000,omzetReal:3790000,customerToday:5,produkMonth:210000,produkToday:0,trxToday:6},
    "10":{ultimateTarget:7095500,ultimateCount:5,ultimateReal:640000,omzetTarget:31141000,omzetReal:2190000,customerToday:2,produkMonth:0,produkToday:0,trxToday:2}
  };

  function pct(real,target){
    const raw=target>0?Math.max(0,real/target*100):0;
    return {raw,ui:Math.min(100,raw)};
  }
  function setRing(prefix,real,target){
    const p=pct(real,target);
    const progress=$(prefix+"Progress");
    const bar=$(prefix+"ProgressBar");
    const ring=$(prefix+"ProgressRing");
    if(progress)progress.textContent=(prefix==="kasirUltimate"?p.raw.toLocaleString("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1}):Math.round(p.raw))+"%";
    if(bar){
      bar.style.width=p.ui+"%";
      const track=bar.closest('[role="progressbar"]');
      if(track){
        track.setAttribute("aria-valuenow",String(Math.round(p.ui)));
        track.setAttribute("aria-valuetext",Math.round(p.raw)+"%");
      }
    }
    const marker=$(prefix+"Marker");
    if(marker){
      const safe=Math.max(2,Math.min(98,p.ui));
      marker.style.left=safe+"%";
      marker.classList.toggle("is-achieved",p.raw>=100);
    }
    if(ring)ring.style.setProperty("--p",p.ui+"%");
  }
  function setState(text,kind=""){
    const el=$("kasirConsumerState"); if(!el)return;
    el.textContent=text; el.className="kasir-consumer-state"+(kind?" is-"+kind:"");
  }
  function productLabel(row){
    const raw=String(row?.product_name||"").trim();
    if(!raw||/^provider product recap$/i.test(raw)) return "Detail nama produk belum tersedia";
    return raw;
  }
  function renderProducts(rows){
    const host=$("kasirProdukHariIniList");
    const list=Array.isArray(rows)?rows:[];
    const totalShare=list.reduce((s,r)=>s+num(r.revenue_share),0);
    $("kasirProdukShareHariIni").textContent=rp(totalShare);
    if(!list.length){
      host.innerHTML='<div class="kasir-product-empty">Belum ada produk terjual hari ini.</div>';
      return;
    }
    host.innerHTML=list.map(r=>`<div class="kasir-product-row"><div><b>${productLabel(r)}</b><small>${num(r.qty)} item</small></div><strong>Share ${rp(r.revenue_share)}</strong></div>`).join("");
  }
  function render(data,date,source){
    const ut=num(data.ultimateTarget),ur=num(data.ultimateReal);
    $("kasirUltimateTarget").textContent=rp(ut);
    $("kasirUltimateRealisasi").textContent=rp(ur);
    $("kasirUltimateCount").textContent=Math.round(num(data.ultimateCount))+" paket";
    $("kasirUltimateSisa").textContent=rp(Math.max(0,ut-ur));
    setRing("kasirUltimate",ur,ut);

    const ot=num(data.omzetTarget),orr=num(data.omzetReal);
    const branchSource=document.querySelector(".profile-branch-name")||document.getElementById("cabangKaryawan");
    const branchName=String(branchSource?.textContent||employee?.cabang_nama||employee?.nama_cabang||"CABANG")
      .trim().replace(/^vax\s+wijaya\s+/i,"");
    if($("kasirOmzetBranch"))$("kasirOmzetBranch").textContent=(branchName||"CABANG").toLocaleUpperCase("id-ID");
    $("kasirOmzetTarget").textContent=rp(ot);
    $("kasirOmzetRealisasi").textContent=rp(orr);
    $("kasirOmzetSisa").textContent=rp(Math.max(0,ot-orr));
    setRing("kasirOmzet",orr,ot);
    const omzetAchieved=ot>0&&orr>=ot;
    const omzetCard=$("kasirOmzetProgress")?.closest(".kasir-monthly-kpi-card");
    const omzetBonus=$("kasirOmzetBonus");
    if(omzetCard)omzetCard.classList.toggle("is-achieved",omzetAchieved);
    if(omzetBonus){
      omzetBonus.hidden=!omzetAchieved;
      omzetBonus.setAttribute("aria-hidden",omzetAchieved?"false":"true");
    }

    $("kasirCustomerHariIni").textContent=String(Math.round(num(data.customerToday)));
    $("kasirTransaksiHariIni").textContent=String(Math.round(num(data.trxToday)));
    $("kasirServicesHariIni").textContent=String(Math.round(num(data.servicesToday)));
    $("kasirCustomerDate").textContent=new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"));
    $("kasirProdukHariIni").textContent=rp(data.produkToday);
    $("kasirProdukBulanIni").textContent=rp(data.produkMonth);
    $("kasirKasbonBulanIni").textContent=rp(data.kasbonMonth);
    $("kasirConsumerPeriod").textContent=new Intl.DateTimeFormat("id-ID",{month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"));
    renderProducts(data.productRows);
    setState(source==="LOCAL_FIXTURE"
      ?"LOCAL TEST · consumer read-only dari snapshot source ERP Owner. Tidak ada write."
      :"LIVE READ-ONLY · consumer dari source canonical ERP Owner.");
  }

  async function readKasbonMonth(date){
    const token=KaryawanSession.getToken?.();
    if(!token)return 0;
    const month=date.slice(0,7);
    const {data,error}=await db.rpc("employee_cash_advance_request_list",{p_session_token:token});
    if(error)throw error;
    return (Array.isArray(data)?data:[]).reduce((sum,r)=>{
      const d=String(r.disbursement_date||"").slice(0,7);
      if(d!==month)return sum;
      return sum+num(r.approved_amount||r.requested_amount);
    },0);
  }

  async function readDirectCanonical(branchId,employeeId,date){
    const [y,m]=date.split("-").map(Number),monthStart=date.slice(0,7)+"-01";
    const [omzetTargetRes,ultimateTargetRes,ultimateRes,recapRes,productRes,kasbonMonth]=await Promise.all([
      db.from("target_bulanan").select("target").eq("cabang_id",branchId).eq("tahun",y).eq("bulan",m).maybeSingle(),
      db.from("kpi_ultimate_monthly_target").select("target_amount,active").eq("cabang_id",branchId).eq("year",y).eq("month",m).eq("active",true).maybeSingle(),
      db.from("kpi_ultimate_sales_source").select("service_package,price_with_discount").eq("cabang_id",branchId).gte("activity_date",monthStart).lte("activity_date",date),
      db.from("daily_recap_source").select("tanggal,service,produk,customer_minutes,transaction_minutes,services_minutes").eq("cabang_id",branchId).gte("tanggal",monthStart).lte("tanggal",date),
      db.from("product_sales_source").select("product_name,provider_name_raw,employee_id,mapping_status,qty,revenue_share,period_start,period_end").eq("cabang_id",branchId).eq("employee_id",employeeId).eq("mapping_status","MATCHED").eq("period_start",date).eq("period_end",date),
      readKasbonMonth(date)
    ]);
    const error=omzetTargetRes.error||ultimateTargetRes.error||ultimateRes.error||recapRes.error||productRes.error;
    if(error)throw error;
    const ult=(ultimateRes.data||[]).filter(r=>isUltimate(r.service_package));
    const recap=recapRes.data||[];
    const todayRow=recap.find(r=>String(r.tanggal).slice(0,10)===date)||{};
    return {
      omzetTarget:num(omzetTargetRes.data?.target),
      omzetReal:recap.reduce((s,r)=>s+num(r.service)+num(r.produk),0),
      ultimateTarget:num(ultimateTargetRes.data?.target_amount),
      ultimateCount:ult.length,
      ultimateReal:ult.reduce((s,r)=>s+num(r.price_with_discount),0),
      customerToday:num(todayRow.customer_minutes),
      trxToday:num(todayRow.transaction_minutes),
      servicesToday:num(todayRow.services_minutes),
      produkToday:num(todayRow.produk),
      produkMonth:recap.reduce((s,r)=>s+num(r.produk),0),
      kasbonMonth:num(kasbonMonth),
      productRows:productRes.data||[]
    };
  }

  async function readCanonical(branchId,employeeId,date){
    const token=KaryawanSession.getToken?.();
    if(!token)throw new Error("SESSION_TOKEN_UNAVAILABLE");
    const {data,error}=await db.rpc("karyawan_kasir_dashboard_self",{p_token:token,p_date:date});
    if(error)throw error;
    const payload=Array.isArray(data)?data[0]:data;
    if(!payload||payload.ok===false)throw new Error(payload?.reason||"KASIR_SELF_READ_UNAVAILABLE");
    if(Number(payload.cabang_id)!==Number(branchId)||Number(payload.employee_id)!==Number(employeeId)){
      throw new Error("KASIR_SELF_READ_IDENTITY_MISMATCH");
    }
    return {
      omzetTarget:num(payload.omzet_target),
      omzetReal:num(payload.omzet_real),
      ultimateTarget:num(payload.ultimate_target),
      ultimateCount:num(payload.ultimate_count),
      ultimateReal:num(payload.ultimate_real),
      customerToday:num(payload.customer_today),
      trxToday:num(payload.transaction_today),
      servicesToday:num(payload.services_today),
      produkToday:num(payload.product_today),
      produkMonth:num(payload.product_month),
      kasbonMonth:num(payload.kasbon_month),
      productRows:Array.isArray(payload.employee_product_detail)?payload.employee_product_detail:[],
      canonicalLastSync:payload.last_sync||null
    };
  }

  let employee=null,run=0;
  async function loadFor(date){
    if(document.documentElement.dataset.homeKpi!=="kasir")return;
    const current=++run;
    const branchId=Number(employee?.cabang_id||0),employeeId=Number(employee?.id||0);
    if(!branchId||!employeeId){setState("Data akun Kasir belum terbaca.","error");return;}
    setState("Membaca source ERP Owner...");
    try{
      const data=await readCanonical(branchId,employeeId,date);
      if(current!==run)return;
      render(data,date,"LIVE");
    }catch(err){
      if(current!==run)return;
      const fixture=localFixture[String(branchId)];
      if(localHost()&&fixture&&date===localFixture.date){
        render({...fixture,kasbonMonth:num(fixture.kasbonMonth),productRows:fixture.productRows||[]},date,"LOCAL_FIXTURE");
        console.info("[Kasir Consumer] Source Owner ditolak RLS employee; memakai fixture lokal read-only.",err);
      }else{
        setState("Consumer Kasir belum punya akses read-only ke source ERP untuk tanggal ini.","error");
        console.error("[Kasir Consumer] read-only source gagal:",err);
      }
    }
  }

  async function boot(){
    const kpi=$("kpiKasir"); if(!kpi)return;
    let tries=0;
    while(document.documentElement.dataset.homeKpi==="pending"&&tries++<50)await new Promise(r=>setTimeout(r,50));
    if(document.documentElement.dataset.homeKpi!=="kasir")return;
    try{employee=await KaryawanSession.requirePage();}catch(_e){}
    await loadFor(selectedDate());
    let wait=0;
    const bind=()=>{
      const picker=$("employeeDatePicker");
      if(picker){picker.addEventListener("change",()=>picker.value&&loadFor(picker.value));return;}
      if(wait++<30)setTimeout(bind,100);
    };
    bind();
  }
  window.addEventListener("load",()=>setTimeout(boot,0),{once:true});
})();