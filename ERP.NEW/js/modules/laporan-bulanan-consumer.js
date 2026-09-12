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

    if(typeof LaporanBulananBackupCashoutBridge!=="undefined"){
      const client=args.client||(typeof db!=="undefined"?db:window.db);
      const cashOutRows=await LaporanBulananEngine.fetchDailyCashOut({
        client,
        start:report.range.start,
        end:report.range.end,
        cabangId:report.branch.id
      });
      const payroll=await PayrollUnifiedEngine.loadPeriod({start:report.range.start,end:report.range.end});
      const supplement=LaporanBulananBackupCashoutBridge.extract({
        cashOutRows,
        payrollRows:payroll.payroll||[],
        cabangId:report.branch.id
      });
      LaporanBulananBackupCashoutBridge.apply(report,supplement);
    }

    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananConsumer=LaporanBulananConsumer;
