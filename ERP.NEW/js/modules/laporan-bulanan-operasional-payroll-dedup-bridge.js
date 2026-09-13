"use strict";

/*
VAX ERP — Laporan Bulanan Operasional / Payroll Dedup Bridge
Consumer-only. Mengeluarkan Bonus Kasir / Bonus KPI dari Operasional
jika nominalnya sudah masuk sebagai Bonus KPI Payroll pada periode/cabang yang sama.
Tidak mengubah Cash Out atau Payroll source.
*/
const LaporanBulananOperasionalPayrollDedupBridge = {
  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },
  normalize(v){ return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); },

  cashOutBonusKpi(report){
    const rows=Array.isArray(report?.pengeluaran?.detail)?report.pengeluaran.detail:[];
    const matched=[];
    let total=0;
    for(const row of rows){
      if(!/^OPERASIONAL/.test(String(row?.category||""))) continue;
      const label=this.normalize(row?.label||row?.raw||"");
      if(!/\bbonus\s+(kasir|kpi)\b/.test(label)) continue;
      const amount=this.number(row?.nominal);
      if(amount<=0) continue;
      total+=amount;
      matched.push(row);
    }
    return {total,matched};
  },

  apply(report){
    if(!report) return report;
    const cashOut=this.cashOutBonusKpi(report);
    const payrollKpi=this.number(report?.gaji?.bonusKpi);
    const dedup=Math.min(cashOut.total,payrollKpi);

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.operasionalPayrollDedup={
      cashOutBonusKpi:cashOut.total,
      payrollBonusKpi:payrollKpi,
      deductedFromOperational:dedup,
      rows:cashOut.matched.length
    };

    if(dedup>0){
      report.pengeluaran=report.pengeluaran||{};
      report.pengeluaran.operasional=Math.max(0,this.number(report.pengeluaran.operasional)-dedup);
      report.pengeluaran.total=this.number(report.pengeluaran.operasional)+this.number(report.pengeluaran.sewa);

      report.laba=report.laba||{};
      report.laba.totalBiaya=Math.max(0,this.number(report.laba.totalBiaya)-dedup);
      report.laba.labaBersih=this.number(report.laba.totalPendapatan)-this.number(report.laba.totalBiaya);
    }

    if(report.investor){
      if(typeof LaporanBulananInvestorShareBridge!=="undefined"&&typeof LaporanBulananInvestorShareBridge.apply==="function"){
        LaporanBulananInvestorShareBridge.apply(report);
        LaporanBulananInvestorShareBridge.emit?.(report);
      }else{
        const pct=this.number(report.investor.persentase);
        const share=report.laba.labaBersih>0&&pct>0?Math.round(report.laba.labaBersih*pct/100):0;
        report.investor.bagiHasil=share;
        report.investor.totalHakBulanIni=share+this.number(report.investor.sewaDibayar);
      }
    }

    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananOperasionalPayrollDedupBridge=LaporanBulananOperasionalPayrollDedupBridge;
