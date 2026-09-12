"use strict";

/*
VAX ERP — Laporan Bulanan Consumer Facade
Read-only facade that composes the monthly engine with consumer-only bridges.
Does not modify locked source engines.
*/
const LaporanBulananConsumer = {
  _masterBridgeInstalled:false,

  installMasterReadBridge(client){
    if(this._masterBridgeInstalled) return;
    if(typeof LaporanBulananEngine==="undefined") return;

    const supabase=client||(typeof db!=="undefined"?db:window.db);
    if(!supabase?.rpc) throw new Error("Supabase RPC untuk Master Finance tidak tersedia.");

    /*
      IMPORTANT:
      Master Sewa & Investor are LOCKED. Monthly consumer must not bypass or alter them.
      Read through the existing SECURITY DEFINER RPC erp_master_finance_get(),
      then resolve the row that was effective at the requested report date.
    */
    LaporanBulananEngine.loadMasters=async ({date,branchName}={})=>{
      const {data,error}=await supabase.rpc("erp_master_finance_get");
      if(error) throw error;
      const payload=data||{};
      const effectiveAt=(row)=>{
        const from=String(row?.effective_from||"").slice(0,10);
        const to=String(row?.effective_to||"").slice(0,10);
        return (!from||from<=date)&&(!to||to>=date);
      };
      const sewaRows=(Array.isArray(payload.sewa)?payload.sewa:[]).filter(effectiveAt);
      const investorRows=(Array.isArray(payload.investor)?payload.investor:[]).filter(effectiveAt);
      return {
        sewa:LaporanBulananEngine.pickBranchMaster(sewaRows,branchName),
        investor:LaporanBulananEngine.pickBranchMaster(investorRows,branchName)
      };
    };

    this._masterBridgeInstalled=true;
  },

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
    const client=args.client||(typeof db!=="undefined"?db:window.db);
    this.installMasterReadBridge(client);

    let insight=args.insight||null;
    if(!insight && typeof LaporanBulananAiInsightBridge!=="undefined"){
      try{
        insight=await LaporanBulananAiInsightBridge.load({
          year:args.year,
          month:args.month,
          cabangId:args.cabangId
        });
      }catch(err){
        // AI summary is presentation-only. Failure must never block finance report.
        console.warn("[Laporan Bulanan AI Insight]",err);
      }
    }

    const report=await LaporanBulananEngine.loadMonth({...args,insight});
    if(insight?.__monthlyInvestor){
      report.performance={
        ...(report.performance||{}),
        ...insight.__monthlyInvestor
      };
    }

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
