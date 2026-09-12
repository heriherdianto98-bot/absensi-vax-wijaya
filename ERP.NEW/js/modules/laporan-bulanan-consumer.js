"use strict";

/*
VAX ERP — Laporan Bulanan Consumer Facade
Read-only facade that composes the monthly engine with consumer-only bridges.
Does not modify locked source engines.
*/
const LaporanBulananConsumer = {
  async loadMonth(args={}){
    if(typeof LaporanBulananEngine==="undefined"||typeof LaporanBulananEngine.loadMonth!=="function"){
      throw new Error("Laporan Bulanan Engine tidak tersedia.");
    }
    const report=await LaporanBulananEngine.loadMonth(args);
    const client=args.client||(typeof db!=="undefined"?db:window.db);
    let payrollDataset=null;

    if(typeof LaporanBulananBackupCashoutBridge!=="undefined"){
      const cashOutRows=await LaporanBulananEngine.fetchDailyCashOut({
        client,
        start:report.range.start,
        end:report.range.end,
        cabangId:report.branch.id
      });
      payrollDataset=await PayrollUnifiedEngine.loadPeriod({start:report.range.start,end:report.range.end});
      const supplement=LaporanBulananBackupCashoutBridge.extract({
        cashOutRows,
        payrollRows:payrollDataset.payroll||[],
        cabangId:report.branch.id
      });
      LaporanBulananBackupCashoutBridge.apply(report,supplement);
    }

    if(typeof LaporanBulananReadiness!=="undefined"){
      if(!payrollDataset){
        payrollDataset=await PayrollUnifiedEngine.loadPeriod({start:report.range.start,end:report.range.end});
      }
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
