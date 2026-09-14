"use strict";

/*
VAX ERP — Cinangsi August 2026 Historical Payroll Bridge
CONSUMER-ONLY / HISTORICAL CORRECTION ADAPTER.

Scope locked sangat sempit:
- Cabang Cinangsi (cabang_id = 9)
- Periode 2026-08-01 s.d. 2026-08-31

Source audit:
- Minutes historical 30 Aug 2026 mencatat Gaji Kasir Rp1.246.154,
  Bonus Kasir Rp150.000, dan Gaji Kasir Rp553.846.
- Hairi adalah kasir Cinangsi pada bagian periode tersebut lalu pindah menjadi
  Kasir Backup / Floating.
- Rafikri adalah kasir pengganti dan memiliki gaji pokok historis Rp553.846.
- Historical correction lama menempelkan Bonus KPI Rp150.000 ke Hairi dan juga
  ke Rafikri dengan catatan "Bonus kpi hairi". Bridge ini memindahkan ownership
  bonus tersebut ke Hairi agar tidak double count.

PENTING:
- Tidak mengubah PayrollUnifiedEngine.
- Tidak mengubah LaporanBulananEngine.
- Tidak mengubah immutable snapshot / Supabase / Arus Kas / Cash Out.
- Tidak mengubah canonical Bonus Produk. Bonus Produk tetap mengikuti bridge
  historis existing (daily Provider Product Recap).
*/
(() => {
  if(typeof window==="undefined" || window.__VAX_CINANGSI_AUG2026_PAYROLL_BRIDGE__) return;
  window.__VAX_CINANGSI_AUG2026_PAYROLL_BRIDGE__=true;

  const api=window.LaporanBulananPayrollAdjustmentBridge;
  if(!api || typeof api.apply!=="function") return;
  if(api.apply.__cinangsiAug2026HistoricalFix) return;

  const baseApply=api.apply.bind(api);
  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};
  const norm=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();

  function isTarget(report,payrollDataset){
    const branchId=Number(report?.branch?.id||0);
    const start=String(report?.range?.start||"").slice(0,10);
    const end=String(report?.range?.end||"").slice(0,10);
    return branchId===9
      && start==="2026-08-01"
      && end==="2026-08-31"
      && Boolean(payrollDataset?.historicalLocked);
  }

  function recalc(report,delta){
    report.gaji=report.gaji||{};
    report.gaji.payroll=num(report.gaji.payroll)+delta;
    report.gaji.total=num(report.gaji.total)+delta;

    report.laba=report.laba||{};
    report.laba.totalBiaya=num(report.laba.totalBiaya)+delta;
    report.laba.labaBersih=num(report.laba.totalPendapatan)-num(report.laba.totalBiaya);

    if(report.investor){
      const pct=num(report.investor.persentase);
      const share=report.laba.labaBersih>0&&pct>0?Math.round(report.laba.labaBersih*pct/100):0;
      report.investor.bagiHasil=share;
      report.investor.totalHakBulanIni=share+num(report.investor.sewaDibayar);
    }
  }

  function makeHairiRow(template={}){
    return {
      employeeId:32,
      nama:"Hairi",
      jabatan:"Kasir (historis Cinangsi)",
      amount:1396154,
      gajiPokok:1246154,
      denda:0,
      kasbon:0,
      payrollDenda:0,
      payrollKasbon:0,
      bonusInsentif:0,
      bonusKpi:150000,
      bonusProduk:0,
      source:"HISTORICAL_CINANGSI_AUG2026_CASHOUT_OWNER_CONFIRMED",
      payrollCostBasis:"GROSS_COMPENSATION_BEFORE_DEDUCTIONS",
      isCapster:false,
      ...template
    };
  }

  const wrapped=function(report,payrollDataset){
    const out=baseApply(report,payrollDataset);
    if(!isTarget(out,payrollDataset)) return out;

    out.gaji=out.gaji||{};
    const detail=Array.isArray(out.gaji.payrollDetail)?out.gaji.payrollDetail:[];
    let delta=0;

    // 1) Bonus Rp150.000 yang salah melekat ke Rafikri dipindah ke Hairi.
    const rafikri=detail.find(row=>norm(row?.nama)==="rafikri");
    if(rafikri && num(rafikri.bonusKpi)===150000){
      rafikri.bonusKpi=0;
      rafikri.amount=num(rafikri.amount)-150000;
      rafikri.source="HISTORICAL_CINANGSI_AUG2026_RAFIKRI_OWNER_FIX";
      out.gaji.bonusKpi=Math.max(0,num(out.gaji.bonusKpi)-150000);
      delta-=150000;
    }

    // 2) Hairi kasir historis Cinangsi: gaji pokok Rp1.246.154 + bonus Rp150.000.
    let hairi=detail.find(row=>norm(row?.nama)==="hairi");
    if(!hairi){
      hairi=makeHairiRow();
      detail.push(hairi);
      out.gaji.bonusKpi=num(out.gaji.bonusKpi)+150000;
      delta+=1396154;
    }else{
      const before=num(hairi.amount);
      const productBonus=num(hairi.bonusProduk); // canonical existing tetap dipertahankan bila ada
      hairi.gajiPokok=1246154;
      hairi.bonusKpi=150000;
      hairi.amount=1246154+150000+productBonus;
      hairi.source="HISTORICAL_CINANGSI_AUG2026_CASHOUT_OWNER_CONFIRMED";
      out.gaji.bonusKpi=num(out.gaji.bonusKpi)+Math.max(0,150000-num(hairi.bonusKpi||0));
      delta+=hairi.amount-before;
    }

    out.gaji.payrollDetail=detail;
    recalc(out,delta);

    out.diagnostics=out.diagnostics||{};
    out.diagnostics.cinangsiAug2026PayrollBridge={
      applied:true,
      branchId:9,
      period:"2026-08",
      hairiGajiPokok:1246154,
      hairiBonusKpi:150000,
      rafikriBonusKpiMovedToHairi:true,
      deltaPayroll:delta,
      productBonusUntouched:true,
      source:"MINUTES_HISTORICAL_CASHOUT_2026-08-30"
    };
    return out;
  };

  Object.defineProperty(wrapped,"__cinangsiAug2026HistoricalFix",{value:true});
  api.apply=wrapped;
})();
