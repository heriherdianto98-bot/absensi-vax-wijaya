/*
=========================================================
VAX ERP — LAPORAN BULANAN HISTORICAL PAYROLL ADAPTER V1
=========================================================
Consumer adapter only.
- For periods with an immutable LOCKED snapshot, reads payroll through
  HistoricalOriginalRouter, including audited historical payroll corrections.
- For periods without a locked snapshot, falls back to the existing
  LaporanBulananConsumer.loadAdjustedPayroll implementation unchanged.
- Does NOT modify PayrollUnifiedEngine, LaporanBulananEngine, formulas,
  snapshot rows, or historical source data.
=========================================================
*/
"use strict";

(() => {
  const consumer=window.LaporanBulananConsumer;
  const router=window.HistoricalOriginalRouter;
  if(!consumer || !router || consumer.__historicalPayrollAdapterV1) return;

  const liveLoadAdjustedPayroll=consumer.loadAdjustedPayroll.bind(consumer);

  consumer.loadAdjustedPayroll=async function historicalPayrollAware(report){
    const start=String(report?.range?.start||"");
    const end=String(report?.range?.end||"");

    if(start && end){
      const historical=await router.loadPayrollPeriod({start,end});
      if(historical){
        historical.monthlyHistoricalAdapter=true;
        historical.monthlyHistoricalSource="SNAPSHOT_ORIGINAL_WITH_CORRECTIONS";
        window.__VAX_LAPORAN_BULANAN_HISTORICAL_PAYROLL__={
          locked:true,
          source:historical.source||"SNAPSHOT_ORIGINAL",
          snapshot:historical.snapshot||null,
          corrections:Number(historical?.snapshot?.correction_count||0)
        };
        return historical;
      }
    }

    window.__VAX_LAPORAN_BULANAN_HISTORICAL_PAYROLL__={locked:false,source:"LIVE"};
    return liveLoadAdjustedPayroll(report);
  };

  Object.defineProperty(consumer,"__historicalPayrollAdapterV1",{
    value:true,enumerable:false,writable:false
  });
})();
