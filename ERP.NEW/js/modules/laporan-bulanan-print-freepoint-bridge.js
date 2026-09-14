"use strict";

/*
VAX ERP — Laporan Bulanan Print Free Point Bridge
UI / PRINT PRESENTATION ONLY.

Tujuan:
- Tabel gaji Print/PDF menampilkan Free Point di kolom ADJ.
- Tidak mengubah total gaji, biaya, laba, Cash Out source, Payroll source,
  LaporanBulananEngine, immutable snapshot, atau print engine yang LOCK.

Catatan:
- Print Enhancements mengganti event handler tombol Print/PDF langsung ke enhancedOpen.
- Karena itu bridge ini dipasang SETELAH enhancement dan mengganti handler tombol saja.
- Saat print berjalan, mapped capster sementara = mapped backup + Free Point.
- Setelah HTML print selesai dibentuk, mapped dikembalikan persis seperti semula.
*/
(() => {
  if(typeof window==="undefined" || window.__VAX_LB_PRINT_FREEPOINT_BRIDGE__) return;
  window.__VAX_LB_PRINT_FREEPOINT_BRIDGE__=true;

  const reports=new Set();
  let installed=false;

  function number(v){
    const n=Number(v||0);
    return Number.isFinite(n)?n:0;
  }

  function collect(report){
    if(report) reports.add(report);
  }

  function collectLastReport(){
    collect(window.LaporanBulananInvestorShareBridge?.lastReport);
  }

  async function runWithFreePoint(openFn,mode){
    collectLastReport();
    const changed=[];

    for(const report of reports){
      const rows=Array.isArray(report?.gaji?.capsterDetail)?report.gaji.capsterDetail:[];
      for(const row of rows){
        const freePoint=number(row?.freePoint);
        if(freePoint<=0) continue;
        changed.push({row,mapped:row.mapped});
        row.mapped=number(row.mapped)+freePoint;
      }
    }

    try{
      return await openFn(mode);
    }finally{
      for(const item of changed) item.row.mapped=item.mapped;
    }
  }

  function replaceAction(id,mode){
    const current=document.getElementById(id);
    if(!current) return false;
    if(current.dataset.freePointPrintBridge==="1") return true;

    const fresh=current.cloneNode(true);
    fresh.dataset.freePointPrintBridge="1";
    current.replaceWith(fresh);
    fresh.addEventListener("click",()=>{
      const api=window.LaporanBulananPrintUI;
      const openFn=api?.open;
      if(typeof openFn!=="function") return;
      runWithFreePoint(openFn,mode);
    });
    return true;
  }

  function install(){
    if(installed) return true;
    const api=window.LaporanBulananPrintUI;
    if(!api || typeof api.open!=="function") return false;

    const printOk=replaceAction("lbPrintMonthly","print");
    const pdfOk=replaceAction("lbPdfMonthly","pdf");
    installed=printOk&&pdfOk;
    return installed;
  }

  document.addEventListener("laporan-bulanan:investor-share",event=>{
    collect(event.detail);
    if(!installed) install();
  });

  let tries=0;
  const timer=setInterval(()=>{
    tries+=1;
    if(install()||tries>=50) clearInterval(timer);
  },100);
})();
