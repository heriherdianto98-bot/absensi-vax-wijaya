/* VAX ERP — Laporan Bulanan Investor UI */
"use strict";

(() => {
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;","&gt;":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  let branches=[],employees=[],currentReport=null,booted=false,headerSyncTimer=null;

  function monthLabel(value){ const [y,m]=String(value||"").split("-").map(Number); return y&&m?`${MONTHS[m-1]} ${y}`:"—"; }
  function setText(id,value){ const node=el(id); if(node && node.textContent!==String(value)) node.textContent=value; }
  function setHtml(id,value){ const node=el(id); if(node) node.innerHTML=value; }
  function statusReady(report){ return report?.readiness?.finalReady===true; }

  function selectedBranchLabel(){
    const select=el("lbBranch");
    return select?.selectedOptions?.[0]?.textContent?.trim() || currentReport?.branch?.name || "Semua Cabang";
  }

  function syncHeaderContext(report=currentReport){
    const branch=report?.branch?.name || selectedBranchLabel();
    const period=monthLabel(el("lbMonth")?.value);
    setText("erpHeaderCabang",branch || "Semua Cabang");
    setText("erpHeaderPeriode",period || "—");
  }

  /*
    IMPORTANT: jangan pakai MutationObserver pada subtree header lalu menulis kembali
    ke header dari callback yang sama. Itu bisa membentuk mutation loop dan membuat
    tab browser hang. Header global dimuat async, jadi cukup retry terbatas.
  */
  function bindHeaderSync(){
    let tries=0;
    const tick=()=>{
      syncHeaderContext();
      tries+=1;
      if(tries>=12 && headerSyncTimer){
        clearInterval(headerSyncTimer);
        headerSyncTimer=null;
      }
    };
    tick();
    if(headerSyncTimer) clearInterval(headerSyncTimer);
    headerSyncTimer=setInterval(tick,250);
    window.addEventListener("load",()=>syncHeaderContext(),{once:true});
  }

  function withTimeout(promise,ms,label){
    return Promise.race([
      promise,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timeout`)),ms))
    ]);
  }

  async function loadBase(){
    if(typeof db==="undefined" || !db?.from) throw new Error("Supabase client belum siap.");
    const cabsReq=db.from("cabang").select("id,nama_cabang").order("id",{ascending:true});
    const empsReq=db.from("karyawan").select("id,nama_karyawan,cabang_id,jabatan,aktif").order("nama_karyawan",{ascending:true});
    const [cabsRes,empsRes]=await withTimeout(Promise.all([cabsReq,empsReq]),10000,"Master cabang/karyawan");
    if(cabsRes?.error) throw cabsRes.error;
    if(empsRes?.error) throw empsRes.error;
    branches=(cabsRes?.data||[]).filter(c=>!String(c.nama_cabang||"").toLowerCase().includes("floating"));
    employees=empsRes?.data||[];
    const select=el("lbBranch");
    if(!select) throw new Error("Filter cabang tidak ditemukan.");
    select.innerHTML=branches.map(c=>`<option value="${Number(c.id)}">${esc(c.nama_cabang)}</option>`).join("");
    if(branches.some(c=>Number(c.id)===5)) select.value="5";
    else if(branches[0]) select.value=String(branches[0].id);
    syncHeaderContext();
  }

  function renderStatus(report){
    const ready=statusReady(report), box=el("lbReportStatus");
    if(!box) return;
    box.classList.toggle("is-ready",ready); box.classList.toggle("is-review",!ready);
    setText("lbReportStatusText",ready?"FINAL READY":"BELUM FINAL / PERLU REVIEW");
  }

  function renderKpis(report){
    const p=report?.pendapatan||{},g=report?.gaji||{},x=report?.pengeluaran||{},l=report?.laba||{};
    setText("lbRevenue",money(p.total)); setText("lbPayroll",money(g.total)); setText("lbOpex",money(x.operasional)); setText("lbRent",money(x.sewa)); setText("lbProfit",money(l.labaBersih));
    const card=el("lbProfitCard");
    card?.classList.toggle("is-profit",Number(l.labaBersih||0)>=0); card?.classList.toggle("is-loss",Number(l.labaBersih||0)<0);
    setText("lbCustomer",`${Number(p.customer||0).toLocaleString("id-ID")} customer`); setText("lbTransactions",`${Number(p.transaction||0).toLocaleString("id-ID")} transaksi`);
  }

  function renderFinance(report){
    const p=report?.pendapatan||{},g=report?.gaji||{},x=report?.pengeluaran||{},l=report?.laba||{},inv=report?.investor||{};
    setHtml("lbIncomeLines",`<div class="lb-line"><span>Pendapatan Cukur</span><strong>${money(p.cukur)}</strong></div><div class="lb-line"><span>Pendapatan Produk (Nett)</span><strong>${money(p.produkNett)}</strong></div><div class="lb-line total"><span>Total Pendapatan</span><strong>${money(p.total)}</strong></div>`);
    setHtml("lbSalaryLines",`<div class="lb-line"><span>Payroll Karyawan</span><strong>${money(g.payroll)}</strong></div><div class="lb-line"><span>Capster Backup Mapped</span><strong>${money(g.providerMapped)}</strong></div><div class="lb-line"><span>Protek Capster</span><strong>${money(g.protek)}</strong></div><div class="lb-line"><span>Gaji SVP</span><strong>${money(g.svp)}</strong></div><div class="lb-line"><span>Backup Kasir Bernama</span><strong>${money(g.backupNamedSupplement)}</strong></div><div class="lb-line total"><span>Total Biaya Gaji</span><strong>${money(g.total)}</strong></div>`);
    setHtml("lbExpenseLines",`<div class="lb-line"><span>Biaya Operasional</span><strong>${money(x.operasional)}</strong></div><div class="lb-line"><span>Sewa Tempat</span><strong>${money(x.sewa)}</strong></div><div class="lb-line total"><span>Total Pengeluaran Non-Gaji</span><strong>${money(x.total)}</strong></div>`);
    setHtml("lbInvestorLines",inv?.nama?`<div class="lb-line"><span>Investor</span><strong>${esc(inv.nama)}</strong></div><div class="lb-line"><span>Persentase</span><strong>${Number(inv.persentase||0)}%</strong></div><div class="lb-line"><span>Bagi Hasil</span><strong>${money(inv.bagiHasil)}</strong></div><div class="lb-line"><span>Sewa Dibayar</span><strong>${money(inv.sewaDibayar)}</strong></div><div class="lb-line total"><span>Total Hak Bulan Ini</span><strong>${money(inv.totalHakBulanIni)}</strong></div>`:'<div class="lb-ok">Cabang ini tidak memiliki investor aktif.</div>');
    setHtml("lbResultLines",`<div class="lb-line"><span>Total Pendapatan</span><strong>${money(l.totalPendapatan)}</strong></div><div class="lb-line"><span>Total Biaya</span><strong>${money(l.totalBiaya)}</strong></div><div class="lb-line total"><span>Laba Bersih</span><strong>${money(l.labaBersih)}</strong></div>`);
  }

  function renderReadiness(report){
    const r=report?.readiness;
    if(!r){ setHtml("lbIssues",'<div class="lb-issue"><strong>VALIDASI BELUM TERSEDIA</strong><span>Readiness validator belum memberi hasil.</span></div>'); return; }
    if(r.finalReady){ setHtml("lbIssues",'<div class="lb-ok">Data laporan sudah lengkap dan siap direview sebagai laporan investor.</div>'); return; }
    setHtml("lbIssues",(r.issues||[]).map(i=>`<div class="lb-issue"><strong>${esc(i.code||"PERLU REVIEW")}</strong><span>${esc(i.message||"")}${i.amount?` · ${money(i.amount)}`:""}</span></div>`).join(""));
  }

  function renderPerformance(report){
    const perf=report?.performance||{};
    const status=perf.status||"—";
    const title=perf.title||"Belum ada ringkasan AI untuk periode ini";
    const finding=perf.finding||"AI Insight akan ditampilkan sebagai ringkasan sederhana untuk investor setelah object insight periode aktif tersedia.";
    const growth=Number(perf.growthPct);
    const hasGrowth=perf.growthPct!==null&&perf.growthPct!==undefined&&Number.isFinite(growth);
    const toneClass=!hasGrowth?"perf-flat":growth>0?"perf-up":growth<0?"perf-down":"perf-flat";
    const arrow=!hasGrowth?"—":growth>0?"▲":growth<0?"▼":"●";
    const growthText=!hasGrowth?"—":`${arrow} ${growth>0?"+":""}${growth}%`;
    const statusTone=/turun|menurun|lemah|perlu perhatian|underperform/i.test(String(status))?"perf-down":/naik|meningkat|baik|stabil/i.test(String(status))?"perf-up":"perf-flat";
    setHtml("lbPerformance",`<div class="${statusTone}"><span>Status</span><strong>${esc(status)}</strong></div><div><span>Omzet</span><strong>${money(perf.omzet)}</strong></div><div class="${toneClass}"><span>Growth</span><strong>${esc(growthText)}</strong></div><div><span>Customer</span><strong>${Number(perf.customer||0).toLocaleString("id-ID")}</strong></div><div><span>Avg Ticket</span><strong>${money(perf.avgTicket)}</strong></div><div><span>Periode</span><strong>${esc(monthLabel(el("lbMonth")?.value))}</strong></div>`);
    setText("lbPerformanceNote",finding);
  }

  async function renderMapping(report){
    const box=el("lbProviderMapping"); if(!box) return;
    const pending=report?.gaji?.providerPendingDetail||[];
    if(!pending.length){ box.innerHTML='<div class="lb-ok">Tidak ada provider/capster backup yang perlu dimapping untuk cabang ini.</div>'; return; }
    try{
      const mappings=await LaporanBulananProviderMapping.loadMonth({client:db,month:report.range.start});
      const review=LaporanBulananProviderMapping.buildReview({pendingRows:pending,mappings,branches,employees});
      LaporanBulananProviderMappingUI.render(box,{review,month:report.range.start,client:db,onSaved:async()=>{await loadReport(false);}});
    }catch(err){ console.warn("[Laporan Bulanan Mapping]",err); box.innerHTML=`<div class="lb-issue"><strong>MAPPING BELUM TERSEDIA</strong><span>${esc(err?.message||"Gagal membaca mapping provider.")}</span></div>`; }
  }

  async function loadReport(showLoading=true){
    const branchId=Number(el("lbBranch")?.value||0),month=el("lbMonth")?.value;
    if(!branchId||!month){ setText("lbLoadState","Pilih cabang dan periode."); return; }
    syncHeaderContext(); if(showLoading) setText("lbLoadState","Memuat laporan...");
    try{
      if(typeof LaporanBulananConsumer==="undefined") throw new Error("Consumer Bulanan belum termuat.");
      const [year,mon]=month.split("-").map(Number);
      const report=await withTimeout(LaporanBulananConsumer.loadMonth({client:db,year,month:mon,cabangId:branchId}),30000,"Engine Laporan Bulanan");
      currentReport=report; renderStatus(report); renderKpis(report); renderFinance(report); renderReadiness(report); renderPerformance(report); syncHeaderContext(report);
      setText("lbLoadState",`${report.branch.name} · ${monthLabel(month)} · consumer read only`);
      await renderMapping(report);
    }catch(err){ console.error(err); syncHeaderContext(); setText("lbLoadState",`Gagal memuat: ${err?.message||"unknown error"}`); setText("lbReportStatusText","GAGAL MEMUAT"); }
  }

  async function init(){
    if(booted||!el("lbBranch")) return; booted=true;
    bindHeaderSync();
    try{
      setText("lbLoadState","Memuat master cabang...");
      await loadBase();
      el("lbMonth").value="2026-08"; syncHeaderContext();
      await loadReport();
    }catch(err){ console.error(err); syncHeaderContext(); setText("lbLoadState",`Gagal memuat modul: ${err?.message||"unknown error"}`); setText("lbReportStatusText","GAGAL MEMUAT"); }
    el("lbRefresh")?.addEventListener("click",()=>loadReport());
    el("lbBranch")?.addEventListener("change",()=>{syncHeaderContext();loadReport();});
    el("lbMonth")?.addEventListener("change",()=>{syncHeaderContext();loadReport();});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
  window.LaporanBulananUI={init,loadReport,syncHeaderContext};
})();
