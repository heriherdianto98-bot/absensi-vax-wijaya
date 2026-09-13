"use strict";

/* Laporan Bulanan — Pembagian Investor presenter. UI ONLY. */
(() => {
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};
  const allReports=new Map();
  let allRenderTimer=null;
  let activePeriodKey="";

  function isAllBranches(){
    return String(document.getElementById("lbBranch")?.value||"")==="all";
  }

  function periodKey(report){
    return String(report?.range?.start||report?.range?.end||"");
  }

  function branchKey(report){
    const id=report?.branch?.id;
    return id!==null&&id!==undefined&&id!==""?`id:${id}`:`name:${String(report?.branch?.name||report?.branch?.nama_cabang||"").toLowerCase()}`;
  }

  function branchName(report){
    return String(report?.branch?.name||report?.branch?.nama_cabang||"Cabang");
  }

  function collect(report){
    if(!report) return;
    const key=periodKey(report);
    if(key&&key!==activePeriodKey){
      activePeriodKey=key;
      allReports.clear();
    }
    allReports.set(branchKey(report),report);
  }

  function renderSingle(report){
    const host=document.getElementById("lbInvestorLines");
    const inv=report?.investor;
    if(!host||!inv?.nama) return;

    const hakInvestor=num(inv.totalHakBulanIni);
    const hakManajemen=num(inv.nilaiManajemen);

    host.innerHTML=`
      <div class="lb-line"><span>Investor</span><strong>${esc(inv.nama)}</strong></div>
      <div class="lb-line"><span>Laba Bersih</span><strong>${money(report?.laba?.labaBersih)}</strong></div>
      <div class="lb-line"><span>Nett Produk</span><strong>${money(inv.nettProduk)}</strong></div>
      <div class="lb-line"><span>Modal Produk (${Number(inv.modalProdukRate||60)}% × Nett Produk)</span><strong>${money(inv.modalProduk)}</strong></div>
      <div class="lb-line total lb-investor-base-total"><span>Laba Dasar Pembagian</span><strong>${money(inv.labaDasarPembagian)}</strong></div>
      <div class="lb-line"><span>Porsi Investor</span><strong>${Number(inv.porsiInvestor||0)}%</strong></div>
      <div class="lb-line"><span>Nilai Investor</span><strong>${money(inv.nilaiInvestor)}</strong></div>
      <div class="lb-line"><span>Porsi Manajemen</span><strong>${Number(inv.porsiManajemen||0)}%</strong></div>
      <div class="lb-line"><span>Nilai Manajemen</span><strong>${money(inv.nilaiManajemen)}</strong></div>
      <div class="lb-line"><span>Sewa Dibayar</span><strong>${money(inv.sewaDibayar)}</strong></div>
      <div class="lb-investor-rights-title">Total Hak Pembagian</div>
      <div class="lb-investor-rights-grid">
        <div class="lb-investor-rights-card is-investor">
          <span>Hak Investor</span>
          <strong>${money(hakInvestor)}</strong>
          <small>Nilai Investor + Sewa</small>
        </div>
        <div class="lb-investor-rights-card is-management">
          <span>Hak Manajemen</span>
          <strong>${money(hakManajemen)}</strong>
          <small>Nilai Manajemen</small>
        </div>
      </div>`;
  }

  function renderAll(){
    if(!isAllBranches()) return;
    const host=document.getElementById("lbInvestorLines");
    if(!host) return;

    const rows=[...allReports.values()]
      .filter(report=>report?.branch && report?.branch?.name!=="Semua Cabang")
      .sort((a,b)=>branchName(a).localeCompare(branchName(b),"id"));
    if(!rows.length) return;

    let totalInvestor=0;
    let totalManagement=0;
    let totalRent=0;
    let investorBranchCount=0;

    const detail=rows.map(report=>{
      const inv=report?.investor||{};
      const hasInvestor=Boolean(inv?.nama);
      const hakInvestor=num(inv.totalHakBulanIni);
      const hakManajemen=num(inv.nilaiManajemen);
      const rent=num(inv.sewaDibayar);
      totalInvestor+=hakInvestor;
      totalManagement+=hakManajemen;
      totalRent+=rent;
      if(hasInvestor) investorBranchCount+=1;

      return `
        <div class="lb-line total"><span>${esc(branchName(report))}</span><strong>${hasInvestor?esc(inv.nama):"Manajemen"}</strong></div>
        <div class="lb-line"><span>Porsi Investor</span><strong>${Number(inv.porsiInvestor||0)}%</strong></div>
        <div class="lb-line"><span>Hak Investor</span><strong>${money(hakInvestor)}</strong></div>
        <div class="lb-line"><span>Porsi Manajemen</span><strong>${Number(inv.porsiManajemen||0)}%</strong></div>
        <div class="lb-line"><span>Hak Manajemen</span><strong>${money(hakManajemen)}</strong></div>
        ${rent?`<div class="lb-line"><span>Sewa Dibayar</span><strong>${money(rent)}</strong></div>`:""}`;
    }).join("");

    host.innerHTML=`
      <div class="lb-line"><span>Total Cabang</span><strong>${rows.length} cabang</strong></div>
      <div class="lb-line"><span>Cabang dengan Investor</span><strong>${investorBranchCount} cabang</strong></div>
      ${detail}
      <div class="lb-line"><span>Total Sewa Investor</span><strong>${money(totalRent)}</strong></div>
      <div class="lb-investor-rights-title">Total Hak Semua Cabang</div>
      <div class="lb-investor-rights-grid">
        <div class="lb-investor-rights-card is-investor">
          <span>Total Hak Investor</span>
          <strong>${money(totalInvestor)}</strong>
          <small>Nilai investor + sewa seluruh cabang</small>
        </div>
        <div class="lb-investor-rights-card is-management">
          <span>Total Hak Manajemen</span>
          <strong>${money(totalManagement)}</strong>
          <small>Nilai manajemen seluruh cabang</small>
        </div>
      </div>`;
  }

  function scheduleAllRender(){
    if(allRenderTimer) clearTimeout(allRenderTimer);
    allRenderTimer=setTimeout(renderAll,120);
  }

  function render(report){
    collect(report);
    if(isAllBranches()){
      scheduleAllRender();
      return;
    }
    renderSingle(report);
  }

  function boot(){
    document.addEventListener("laporan-bulanan:investor-share",e=>render(e.detail));
    document.getElementById("lbBranch")?.addEventListener("change",()=>{
      if(isAllBranches()) scheduleAllRender();
      else setTimeout(()=>renderSingle(window.LaporanBulananInvestorShareBridge?.lastReport),80);
    });
    document.getElementById("lbMonth")?.addEventListener("change",()=>{
      allReports.clear();
      activePeriodKey="";
    });
    setTimeout(()=>render(window.LaporanBulananInvestorShareBridge?.lastReport),300);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
