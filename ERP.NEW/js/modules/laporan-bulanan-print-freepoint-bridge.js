"use strict";

/*
VAX ERP — Laporan Bulanan Print Free Point Bridge
UI / PRINT PRESENTATION ONLY.

Tujuan:
- Tabel gaji Print/PDF menampilkan Free Point di kolom ADJ.
- Detail Cash Out Print/PDF menampilkan Free Point dan Protek sebagai pos gaji capster,
  bukan Operasional.
- Menghilangkan kebutuhan baris penyesuaian konsolidasi untuk nominal yang sebenarnya
  hanya beda klasifikasi presentasi.
- Tidak mengubah total gaji, biaya, laba, Cash Out source, Payroll source,
  LaporanBulananEngine, immutable snapshot, atau print engine yang LOCK.

Catatan:
- Print Enhancements mengganti event handler tombol Print/PDF langsung ke enhancedOpen.
- Karena itu bridge ini dipasang SETELAH enhancement dan mengganti handler tombol saja.
- Saat print berjalan, mapped capster sementara = mapped backup + Free Point.
- Kategori detail Cash Out sementara direklasifikasi hanya untuk HTML Print/PDF.
- Setelah HTML print selesai dibentuk, seluruh nilai dikembalikan persis seperti semula.
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

  function norm(v){
    return String(v||"")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function collect(report){
    if(report) reports.add(report);
  }

  function collectLastReport(){
    collect(window.LaporanBulananInvestorShareBridge?.lastReport);
  }

  function applyTemporaryPrintClassification(report,changedCashOut){
    const rows=Array.isArray(report?.pengeluaran?.detail)?report.pengeluaran.detail:[];
    for(const row of rows){
      const category=String(row?.category||"OPERASIONAL");
      if(!/^OPERASIONAL/.test(category)) continue;

      const label=norm(row?.label||row?.raw||"");
      let nextCategory="";

      if(/\bfree\s*point\b|\bfree\s*poin\b/.test(label)){
        nextCategory="Gaji Capster / Free Point";
      }else if(/\bprotek\b|\bproteck\b/.test(label)){
        nextCategory="GAJI_CAPSTER_PROTEK";
      }

      if(!nextCategory) continue;
      changedCashOut.push({row,category:row.category});
      row.category=nextCategory;
    }
  }

  async function runWithFreePoint(openFn,mode){
    collectLastReport();
    const changedSalary=[];
    const changedCashOut=[];

    for(const report of reports){
      const rows=Array.isArray(report?.gaji?.capsterDetail)?report.gaji.capsterDetail:[];
      for(const row of rows){
        const freePoint=number(row?.freePoint);
        if(freePoint<=0) continue;
        changedSalary.push({row,mapped:row.mapped});
        row.mapped=number(row.mapped)+freePoint;
      }

      applyTemporaryPrintClassification(report,changedCashOut);
    }

    try{
      return await openFn(mode);
    }finally{
      for(const item of changedSalary) item.row.mapped=item.mapped;
      for(const item of changedCashOut) item.row.category=item.category;
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
