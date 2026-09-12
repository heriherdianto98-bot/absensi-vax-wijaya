"use strict";

/*
VAX ERP — Laporan Bulanan Consumer Facade
Read-only facade that composes the monthly engine with consumer-only bridges.
Does not modify locked source engines.
*/
const LaporanBulananConsumer = {
  async loadAdjustedPayroll(report){
    let adjustments={};
    if(typeof PayrollManualAdjustmentStore!=="undefined"&&typeof PayrollManualAdjustmentStore.loadMonth==="function"){
      const month=report.range.start.slice(0,7);
      const manual=await PayrollManualAdjustmentStore.loadMonth(month);
      if(typeof PayrollManualAdjustmentStore.toEngineAdjustments==="function"){
        adjustments=PayrollManualAdjustmentStore.toEngineAdjustments(manual);
      }
    }
    return PayrollUnifiedEngine.loadPeriod({
      start:report.range.start,
      end:report.range.end,
      adjustments
    });
  },

  async loadMonth(args={}){
    if(typeof LaporanBulananEngine==="undefined"||typeof LaporanBulananEngine.loadMonth!=="function"){
      throw new Error("Laporan Bulanan Engine tidak tersedia.");
    }
    const report=await LaporanBulananEngine.loadMonth(args);
    const client=args.client||(typeof db!=="undefined"?db:window.db);
    let payrollDataset=null;

    if(typeof PayrollUnifiedEngine!=="undefined"){
      payrollDataset=await this.loadAdjustedPayroll(report);
      if(typeof LaporanBulananPayrollAdjustmentBridge!=="undefined"){
        LaporanBulananPayrollAdjustmentBridge.apply(report,payrollDataset);
      }
    }

    if(typeof LaporanBulananBackupCashoutBridge!=="undefined"){
      const cashOutRows=await LaporanBulananEngine.fetchDailyCashOut({
        client,
        start:report.range.start,
        end:report.range.end,
        cabangId:report.branch.id
      });
      if(!payrollDataset) payrollDataset=await this.loadAdjustedPayroll(report);
      const supplement=LaporanBulananBackupCashoutBridge.extract({
        cashOutRows,
        payrollRows:payrollDataset.payroll||[],
        cabangId:report.branch.id
      });
      LaporanBulananBackupCashoutBridge.apply(report,supplement);
    }

    if(typeof LaporanBulananReadiness!=="undefined"){
      if(!payrollDataset) payrollDataset=await this.loadAdjustedPayroll(report);
      report.readiness=LaporanBulananReadiness.validate({
        report,
        payrollDataset,
        cabangId:report.branch.id
      });
    }

    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananConsumer=LaporanBulananConsumer;
