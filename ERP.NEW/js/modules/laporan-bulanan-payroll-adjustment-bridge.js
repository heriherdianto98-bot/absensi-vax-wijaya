/*
=========================================================
VAX ERP — LAPORAN BULANAN PAYROLL ADJUSTMENT BRIDGE V1
=========================================================
Consumer-only bridge.
- Reads Payroll with manual adjustments already applied.
- Reconciles report payroll amount to adjusted Payroll result.
- Exposes per-employee payroll components for Monthly display.
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
    let bonusInsentif=0;
    let bonusKpi=0;
    let bonusProduk=0;
    const detail=[];

    for(const employee of rows){
      if(employee?.isBackupCashoutFloating){
        const daily=(employee.daily||[]).filter(d=>Number(d?.cabangId)===id);
        const gajiPokok=daily.reduce((sum,d)=>sum+this.number(d?.gajiPokok),0);
        const denda=daily.reduce((sum,d)=>sum+this.number(d?.denda),0);
        const kasbon=daily.reduce((sum,d)=>sum+this.number(d?.kasbon),0);
        const employeeBonusInsentif=daily.reduce((sum,d)=>sum+this.number(d?.bonusInsentif),0);
        const employeeBonusKpi=daily.reduce((sum,d)=>sum+this.number(d?.bonusKpi),0);
        const employeeBonusProduk=daily.reduce((sum,d)=>sum+this.number(d?.bonusProduk),0);
        const amount=gajiPokok-denda-kasbon+employeeBonusInsentif+employeeBonusKpi+employeeBonusProduk;
        bonusInsentif+=employeeBonusInsentif;
        bonusKpi+=employeeBonusKpi;
        bonusProduk+=employeeBonusProduk;
        if(amount){
          total+=amount;
          detail.push({
            employeeId:employee.employeeId,
            nama:employee.namaKaryawan,
            jabatan:employee.jabatan,
            amount,
            gajiPokok,denda,kasbon,
            bonusInsentif:employeeBonusInsentif,
            bonusKpi:employeeBonusKpi,
            bonusProduk:employeeBonusProduk,
            source:"PAYROLL_FLOATING_BRANCH_DAILY",
            isCapster:Boolean(employee?.isCapster)
          });
        }
        continue;
      }

      if(Number(employee?.homeCabangId)!==id) continue;
      const summary=employee?.summary||{};
      const amount=this.number(summary.gajiBersih);
      const employeeBonusInsentif=this.number(summary.bonusInsentif);
      const employeeBonusKpi=this.number(summary.bonusKpi);
      const employeeBonusProduk=this.number(summary.bonusProduk);

      total+=amount;
      bonusInsentif+=employeeBonusInsentif;
      bonusKpi+=employeeBonusKpi;
      bonusProduk+=employeeBonusProduk;
      detail.push({
        employeeId:employee.employeeId,
        nama:employee.namaKaryawan,
        jabatan:employee.jabatan,
        amount,
        gajiPokok:this.number(summary.gajiPokok),
        denda:this.number(summary.denda),
        kasbon:this.number(summary.kasbon),
        bonusInsentif:employeeBonusInsentif,
        bonusKpi:employeeBonusKpi,
        bonusProduk:employeeBonusProduk,
        source:"PAYROLL_HOME_BRANCH",
        isCapster:Boolean(employee?.isCapster)
      });
    }

    return {total,detail,bonusInsentif,bonusKpi,bonusProduk};
  },

  apply(report,payrollDataset){
    if(!report||!payrollDataset) return report;
    const branch=this.payrollForBranch(payrollDataset,report?.branch?.id);
    const oldPayroll=this.number(report?.gaji?.payroll);
    const delta=branch.total-oldPayroll;
    report.gaji=report.gaji||{};
    report.gaji.payroll=branch.total;
    report.gaji.payrollDetail=branch.detail;
    report.gaji.bonusInsentif=this.number(branch.bonusInsentif);
    report.gaji.bonusKpi=this.number(branch.bonusKpi);
    report.gaji.bonusProduk=this.number(branch.bonusProduk);
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
    report.diagnostics.payrollAdjustmentBridge={
      previousPayroll:oldPayroll,
      adjustedPayroll:branch.total,
      delta,
      bonusInsentif:report.gaji.bonusInsentif,
      bonusKpi:report.gaji.bonusKpi,
      bonusProduk:report.gaji.bonusProduk
    };
    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananPayrollAdjustmentBridge=LaporanBulananPayrollAdjustmentBridge;
