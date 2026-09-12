/* VAX ERP — Laporan Bulanan Investor UI */
"use strict";

(() => {
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  let branches=[],employees=[],currentReport=null;

  function monthLabel(value){ const [y,m]=String(value||"").split("-").map(Number); return y&&m?`${MONTHS[m-1]} ${y}`:"—"; }
  function setText(id,value){ const node=el(id); if(node) node.textContent=value; }
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

  function bindHeaderSync(){
    const host=el("header");
    if(host){
      const observer=new MutationObserver(()=>syncHeaderContext());
      observer.observe(host,{childList:true,subtree:true});
    }
    window.addEventListener("load",()=>syncHeaderContext());
    setTimeout(()=>syncHeaderContext(),150);
    setTimeout(()=>syncHeaderContext(),700);
  }

  async function loadBase(){
    const [cabs,emps]=await Promise.all([PayrollUnifiedEngine.fetchCabang(),PayrollUnifiedEngine.fetchKaryawan()]);
    branches=(cabs||[]).filter(c=>!String(c.nama_cabang||"").toLowerCase().includes("floating"));
    employees=emps||[];
    const select=el("lbBranch");
    select.innerHTML=branches.map(c=>`<option value="${Number(c.id)}">${esc(c.nama_cabang)}</option>`).join("");
    if(branches.some(c=>Number(c.id)===5)) select.value="5";
    syncHeaderContext();
  }

  function renderStatus(report){
    const ready=statusReady(report), box=el("lbReportStatus");
    box.classList.toggle("is-ready",ready); box.classList.toggle("is-review",!ready);
    setText("lbReportStatusText",ready?"FINAL READY":"BELUM FINAL / PERLU REVIEW");
  }

  function renderKpis(report){
    const p=report?.pendapatan||{},g=report?.gaji||{},x=report?.pengeluaran||{},l=report?.laba||{};
    setText("lbRevenue",money(p.total));
    setText("lbPayroll",money(g.total));
    setText("lbOpex",money(x.operasional));
    setText("lbRent",money(x.sewa));
    setText("lbProfit",money(l.labaBersih));
    const card=el("lbProfitCard");
    card.classList.toggle("is-profit",Number(l.labaBersih||0)>=0); card.classList.toggle("is-loss",Number(l.labaBersih||0)<0);
    setText("lbCustomer",`${Number(p.customer||0).toLocaleString("id-ID")} customer`);
    setText("lbTransactions",`${Number(p.transaction||0).toLocaleString("id-ID")} transaksi`);
  }

  function renderFinance(report){
    const p=report?.pendapatan||{},g=report?.gaji||{},x=report?.pengeluaran||{},l=report?.laba||{},inv=report?.investor||{};
    setHtml("lbIncomeLines",`
      <div class="lb-line"><span>Pendapatan Cukur</span><strong>${money(p.cukur)}</strong></div>
      <div class="lb-line"><span>Pendapatan Produk (Nett)</span><strong>${money(p.produkNett)}</strong></div>
      <div class="lb-line total"><span>Total Pendapatan</span><strong>${money(p.total)}</strong></div>`);
    setHtml("lbSalaryLines",`
      <div class="lb-line"><span>Payroll Karyawan</span><strong>${money(g.payroll)}</strong></div>
      <div class="lb-line"><span>Capster Backup Mapped</span><strong>${money(g.providerMapped)}</strong></div>
      <div class="lb-line"><span>Protek Capster</span><strong>${money(g.protek)}</strong></div>
      <div class="lb-line"><span>Gaji SVP</span><strong>${money(g.svp)}</strong></div>
      <div class="lb-line"><span>Backup Kasir Bernama</span><strong>${money(g.backupNamedSupplement)}</strong></div>
      <div class="lb-line total"><span>Total Biaya Gaji</span><strong>${money(g.total)}</strong></div>`);
    setHtml("lbExpenseLines",`
      <div class="lb-line"><span>Biaya Operasional</span><strong>${money(x.operasional)}</strong></div>
      <div class="lb-line"><span>Sewa Tempat</span><strong>${money(x.sewa)}</strong></div>
      <div class="lb-line total"><span>Total Pengeluaran Non-Gaji</span><strong>${money(x.total)}</strong></div>`);
    setHtml("lbInvestorLines",inv?.nama?`
      <div class="lb-line"><span>Investor</span><strong>${esc(inv.nama)}</strong></div>
      <div class="lb-line"><span>Persentase</span><strong>${Number(inv.persentase||0)}%</strong></div>
      <div class="lb-line"><span>Bagi Hasil</span><strong>${money(inv.bagiHasil)}</strong></div>
      <div class="lb-line"><span>Sewa Dibayar</span><strong>${money(inv.sewaDibayar)}</strong></div>
      <div class="lb-line total"><span>Total Hak Bulan Ini</span><strong>${money(inv.totalHakBulanIni)}</strong></div>`:'<div class="lb-ok">Cabang ini tidak memiliki investor aktif.</div>');
    setHtml("lbResultLines",`
      <div class="lb-line"><span>Total Pendapatan</span><strong>${money(l.totalPendapatan)}</strong></div>
      <div class="lb-line"><span>Total Biaya</span><strong>${money(l.totalBiaya)}</strong></div>
      <div class="lb-line total"><span>Laba Bersih</span><strong>${money(l.labaBersih)}</strong></div>`);
  }

  function renderReadiness(report){
    const r=report?.readiness;
    if(!r){ setHtml("lbIssues",'<div class="lb-issue"><strong>VALIDASI BELUM TERSEDIA</strong><span>Readiness validator belum memberi hasil.</span></div>'); return; }
    if(r.finalReady){ setHtml("lbIssues",'<div class="lb-ok">Data laporan sudah lengkap dan siap direview sebagai laporan investor.</div>'); return; }
    setHtml("lbIssues",(r.issues||[]).map(i=>`<div class="lb-issue"><strong>${esc(i.code||"PERLU REVIEW")}</strong><span>${esc(i.message||"")}${i.amount?` · ${money(i.amount)}`:""}</span></div>`).join(""));
  }

  function renderPerformance(report){
    const perf=report?.performance||{};
    const status=perf.status||"—",title=perf.title||"Belum ada ringkasan AI untuk periode ini",finding=perf.finding||"AI Insight akan ditampilkan sebagai ringkasan sederhana untuk investor setelah object insight periode aktif tersedia.";
    setHtml("lbPerformance",`
      <div><span>Status</span><strong>${esc(status)}</strong></div>
      <div><span>Ringkasan</span><strong>${esc(title)}</strong></div>
      <div><span>Periode</span><strong>${esc(monthLabel(el("lbMonth").value))}</strong></div>`);
    setText("lbPerformanceNote",finding);
  }

  async function renderMapping(report){
    const box=el("lbProviderMapping");
    const pending=report?.gaji?.providerPendingDetail||[];
    if(!pending.length){ box.innerHTML='<div class="lb-ok">Tidak ada provider/capster backup yang perlu dimapping untuk cabang ini.</div>'; return; }
    try{
      const mappings=await LaporanBulananProviderMapping.loadMonth({client:db,month:report.range.start});
      const review=LaporanBulananProviderMapping.buildReview({pendingRows:pending,mappings,branches,employees});
      LaporanBulananProviderMappingUI.render(box,{review,month:report.range.start,client:db,onSaved:async()=>{await loadReport(false);}});
    }catch(err){
      console.warn("[Laporan Bulanan Mapping]",err);
      box.innerHTML=`<div class="lb-issue"><strong>MAPPING BELUM TERSEDIA</strong><span>${esc(err?.message||"Gagal membaca mapping provider.")}</span></div>`;
    }
  }

  async function loadReport(showLoading=true){
    const branchId=Number(el("lbBranch").value||0),month=el("lbMonth").value;
    if(!branchId||!month) return;
    syncHeaderContext();
    if(showLoading) setText("lbLoadState","Memuat laporan...");
    try{
      const [year,mon]=month.split("-").map(Number);
      const report=await LaporanBulananConsumer.loadMonth({client:db,year,month:mon,cabangId:branchId});
      currentReport=report;
      renderStatus(report);
      renderKpis(report);
      renderFinance(report);
      renderReadiness(report);
      renderPerformance(report);
      syncHeaderContext(report);
      setText("lbLoadState",`${report.branch.name} · ${monthLabel(month)} · consumer read only`);
      await renderMapping(report);
    }catch(err){
      console.error(err);
      syncHeaderContext();
      setText("lbLoadState",err?.message||"Gagal memuat laporan.");
    }
  }

  async function init(){
    if(!el("lbBranch")) return;
    bindHeaderSync();
    try{
      await loadBase();
      el("lbMonth").value="2026-08";
      syncHeaderContext();
      await loadReport();
    }catch(err){
      console.error(err);
      syncHeaderContext();
      setText("lbLoadState",err?.message||"Gagal memuat modul.");
    }
    el("lbRefresh")?.addEventListener("click",()=>loadReport());
    el("lbBranch")?.addEventListener("change",()=>{syncHeaderContext();loadReport();});
    el("lbMonth")?.addEventListener("change",()=>{syncHeaderContext();loadReport();});
  }

  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();
