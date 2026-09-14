"use strict";

/*
VAX ERP — Laporan Bulanan Print Free Point Bridge
UI / PRINT PRESENTATION ONLY.

Tujuan:
- Tabel gaji Print/PDF menampilkan Free Point di kolom ADJ.
- Tidak mengubah total gaji, biaya, laba, Cash Out source, Payroll source,
  LaporanBulananEngine, immutable snapshot, atau print engine yang LOCK.

Cara kerja:
- Menyimpan referensi report consumer yang sudah final.
- Tepat sebelum presenter Print/PDF membaca report, nilai ADJ capster sementara
  = mapped backup + Free Point.
- Setelah HTML print selesai dibentuk, nilai mapped dikembalikan persis seperti semula.
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

  async function withPrintAdjustment(baseOpen,context,mode){
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
      return await baseOpen.call(context,mode);
    }finally{
      for(const item of changed) item.row.mapped=item.mapped;
    }
  }

  function install(){
    if(installed) return true;
    const api=window.LaporanBulananPrintUI;
    if(!api || typeof api.open!=="function") return false;
    const baseOpen=api.open;
    if(baseOpen.__freePointPrintBridge) { installed=true; return true; }

    const wrapped=async function(mode="print"){
      return withPrintAdjustment(baseOpen,api,mode);
    };
    Object.defineProperty(wrapped,"__freePointPrintBridge",{value:true});
    api.open=wrapped;
    installed=true;
    return true;
  }

  document.addEventListener("laporan-bulanan:investor-share",event=>{
    collect(event.detail);
    install();
  });

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(install()||tries>=30) clearInterval(timer);
    },100);
  }
})();
