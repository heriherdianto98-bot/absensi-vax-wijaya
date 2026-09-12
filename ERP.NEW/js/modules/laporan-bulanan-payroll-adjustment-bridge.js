/*
=========================================================
VAX ERP — LAPORAN BULANAN PAYROLL ADJUSTMENT BRIDGE V1
=========================================================
Consumer-only bridge.
- Reads Payroll with manual adjustments already applied.
- Reconciles report payroll amount to adjusted Payroll result.
- Does NOT modify Payroll engine or payroll tables.
=========================================================
*/
"use strict";

const LaporanBulananPayrollAdjustmentBridge = {
  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },

  payrollForBranch(payrollDataset,cabangId){
    const id=Number(cabangId);
    const rows=Array.isArray(payrollDataset?.payroll)?payrollDataset.payroll:[];
    let total=0;
    const detail=[];
    for(const employee of rows){
      if(employee?.isBackupCashoutFloating){
        const daily=(employee.daily||[]).filter(d=>Number(d?.cabangId)===id);
        const amount=daily.reduce((sum,d)=>sum+this.number(d?.gajiPokok)-this.number(d?.denda)-this.number(d?.kasbon)+this.number(d?.bonusProduk),0);
        if(amount){ total+=amount; detail.push({employeeId:employee.employeeId,nama:employee.namaKaryawan,jabatan:employee.jabatan,amount,source:"PAYROLL_FLOATING_BRANCH_DAILY"}); }
        continue;
      }
      if(Number(employee?.homeCabangId)!==id) continue;
      const amount=this.number(employee?.summary?.gajiBersih);
      total+=amount;
      detail.push({employeeId:employee.employeeId,nama:employee.namaKaryawan,jabatan:employee.jabatan,amount,source:"PAYROLL_HOME_BRANCH",isCapster:Boolean(employee?.isCapster)});
    }
    return {total,detail};
  },

  apply(report,payrollDataset){
    if(!report||!payrollDataset) return report;
    const branch=this.payrollForBranch(payrollDataset,report?.branch?.id);
    const oldPayroll=this.number(report?.gaji?.payroll);
    const delta=branch.total-oldPayroll;
    report.gaji=report.gaji||{};
    report.gaji.payroll=branch.total;
    report.gaji.payrollDetail=branch.detail;
    report.gaji.total=this.number(report.gaji.total)+delta;

    report.laba=report.laba||{};
    report.laba.totalBiaya=this.number(report.laba.totalBiaya)+delta;
    report.laba.labaBersih=this.number(report.laba.totalPendapatan)-this.number(report.laba.totalBiaya);

    if(report.investor){
      const pct=this.number(report.investor.persentase);
      const share=report.laba.labaBersih>0&&pct>0?Math.round(report.laba.labaBersih*pct/100):0;
      report.investor.bagiHasil=share;
      report.investor.totalHakBulanIni=share+this.number(report.investor.sewaDibayar);
    }

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.payrollAdjustmentBridge={previousPayroll:oldPayroll,adjustedPayroll:branch.total,delta};
    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananPayrollAdjustmentBridge=LaporanBulananPayrollAdjustmentBridge;
