"use strict";

/*
VAX ERP — Mekarwangi August 2026 Historical Payroll Bridge
CONSUMER-ONLY / HISTORICAL CORRECTION ADAPTER.

Scope sangat sempit:
- Cabang Mekarwangi (cabang_id = 10)
- Periode 2026-08-01 s.d. 2026-08-31

Owner-confirmed historical payroll (manual August 2026 sheet):
- Anugrah       Rp   600.000  (Tukang Cukur; resign setelah periode ini)
- Anwar         Rp 3.750.000  (Tukang Cukur)
- Tian          Rp 4.200.000  (Tukang Cukur)
- Irpan         Rp 4.350.000  (Tukang Cukur)
- Buton         Rp 4.650.000  (Tukang Cukur)
- Tim Akunting  Rp   500.000  (SVP)
- Arya          Rp 2.350.000  (Kasir; Gaji Pokok 2.200.000 + Bonus KPI 150.000)
- Backup Kasir  Rp   300.000
- Komisi Produk Rp    45.000
TOTAL           Rp20.745.000

Owner-confirmed historical non-payroll operational cost:
- Operasional   Rp 4.915.500
- Sewa tetap mengikuti Master Sewa ERP aktif.

PENTING:
- Agustus Mekarwangi masih memakai gaji bulanan untuk tukang cukur.
- Anugrah tetap masuk sebagai biaya gaji capster Agustus walau kemudian resign.
- Tim Akunting Rp500.000 diklasifikasikan sebagai Gaji SVP, bukan payroll kasir/capster.
- Fariz baru mulai September; row product-only training/backfill Agustus tidak
  boleh mengubah historical payroll ownership Agustus.
- Mulai September Mekarwangi kembali mengikuti engine payroll/provider normal.
- Tidak mengubah PayrollUnifiedEngine, LaporanBulananEngine, DailyDataEngine,
  Supabase source, Cash Out, Arus Kas, maupun snapshot immutable.
*/
(() => {
  if(typeof window==="undefined" || window.__VAX_MEKARWANGI_AUG2026_PAYROLL_BRIDGE__) return;
  window.__VAX_MEKARWANGI_AUG2026_PAYROLL_BRIDGE__=true;

  const api=window.LaporanBulananConsumer;
  if(!api || typeof api.loadMonth!=="function" || api.loadMonth.__mekarwangiAug2026HistoricalFix) return;

  const baseLoad=api.loadMonth.bind(api);
  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};
  const CAPSTERS=[
    {nama:"Anugrah",amount:600000,statusHistoris:"RESIGN_AFTER_AUGUST_2026"},
    {nama:"Anwar",amount:3750000},
    {nama:"Tian",amount:4200000},
    {nama:"Irpan",amount:4350000},
    {nama:"Buton",amount:4650000}
  ];
  const CAPSTER_TOTAL=CAPSTERS.reduce((s,r)=>s+r.amount,0); // 17.550.000
  const ARYA_TOTAL=2350000;
  const SVP=500000; // Tim Akunting = SVP
  const BACKUP_KASIR=300000;
  const PRODUCT_COMMISSION=45000;
  const TOTAL=20745000;
  const OPERATIONAL=4915500;

  function isTarget(report){
    return Number(report?.branch?.id||0)===10
      && String(report?.range?.start||"").slice(0,10)==="2026-08-01"
      && String(report?.range?.end||"").slice(0,10)==="2026-08-31";
  }

  function recalc(report){
    report.pengeluaran=report.pengeluaran||{};
    report.pengeluaran.operasional=OPERATIONAL;
    report.pengeluaran.total=OPERATIONAL+num(report.pengeluaran.sewa);

    report.laba=report.laba||{};
    report.laba.totalBiaya=TOTAL+report.pengeluaran.total;
    report.laba.totalPendapatan=num(report?.pendapatan?.total);
    report.laba.labaBersih=report.laba.totalPendapatan-report.laba.totalBiaya;

    if(report.investor){
      const pct=num(report.investor.persentase);
      const share=report.laba.labaBersih>0&&pct>0?Math.round(report.laba.labaBersih*pct/100):0;
      report.investor.bagiHasil=share;
      report.investor.totalHakBulanIni=share+num(report.investor.sewaDibayar);
    }
  }

  const wrapped=async function(args={}){
    const report=await baseLoad(args);
    if(!isTarget(report)) return report;

    report.gaji=report.gaji||{};
    report.gaji.payroll=CAPSTER_TOTAL+ARYA_TOTAL;
    report.gaji.protek=0;
    report.gaji.providerMapped=0;
    report.gaji.svp=SVP;
    report.gaji.backupNamedSupplement=BACKUP_KASIR;
    report.gaji.productCommission=PRODUCT_COMMISSION;
    report.gaji.total=TOTAL;

    report.gaji.capsterDetail=CAPSTERS.map(row=>({
      employeeId:null,
      nama:row.nama,
      payroll:row.amount,
      mapped:0,
      protek:0,
      total:row.amount,
      isBackup:false,
      statusHistoris:row.statusHistoris||null,
      source:"OWNER_CONFIRMED_MONTHLY_SALARY_MEKARWANGI_AUG2026"
    }));
    report.gaji.capsterDetailTotal=CAPSTER_TOTAL;

    report.gaji.nonCapsterDetail=[{
      employeeId:37,
      nama:"Arya",
      jabatan:"Kasir",
      amount:ARYA_TOTAL,
      gajiPokok:2200000,
      denda:0,
      kasbon:0,
      bonusInsentif:0,
      bonusKpi:150000,
      bonusProduk:0,
      source:"OWNER_CONFIRMED_MONTHLY_SALARY_MEKARWANGI_AUG2026"
    }];
    report.gaji.nonCapsterPayroll=ARYA_TOTAL;

    // Historical August product commission is kept as branch payroll cost,
    // but is not attributed to Fariz because he starts in September.
    report.gaji.payrollDetail=(report.gaji.payrollDetail||[]).filter(row=>Number(row?.employeeId)!==48);

    recalc(report);

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.mekarwangiAug2026PayrollBridge={
      applied:true,
      branchId:10,
      period:"2026-08",
      model:"MONTHLY_SALARY_ALL_STAFF",
      temporaryHistoricalOnly:true,
      septemberAndLaterUseNormalEngine:true,
      capsterMonthlySalary:CAPSTER_TOTAL,
      anugrah:{amount:600000,role:"CAPSTER",status:"RESIGN_AFTER_AUGUST_2026"},
      aryaSalary:ARYA_TOTAL,
      svp:{label:"Tim Akunting",amount:SVP,role:"SVP"},
      backupKasir:BACKUP_KASIR,
      productCommission:PRODUCT_COMMISSION,
      totalPayroll:TOTAL,
      historicalOperational:OPERATIONAL,
      rentSource:"MASTER_SEWA_ERP_ACTIVE",
      farizAugustProductOnlyExcludedFromEmployeePayroll:true,
      source:"OWNER_CONFIRMED_LABA_RUGI_MEKARWANGI_AUG2026"
    };

    return report;
  };

  Object.defineProperty(wrapped,"__mekarwangiAug2026HistoricalFix",{value:true});
  api.loadMonth=wrapped;
})();
