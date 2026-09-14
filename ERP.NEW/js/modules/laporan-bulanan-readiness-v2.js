/*
=========================================================
VAX ERP — LAPORAN BULANAN READINESS VALIDATOR V2
=========================================================
Consumer-only validation for investor report readiness.
Does NOT modify Payroll, Cash Out, DailyDataEngine, Monthly engine, or Master data.

Historical-period rule:
- Only non-capster employees with actual payroll evidence inside the selected
  month may produce MISSING_FIXED_SALARY.
- Product-only evidence is not enough to prove a fixed-salary employee belonged
  to that historical payroll period (training/backfill rows can exist).
=========================================================
*/
"use strict";

const LaporanBulananReadiness = {
  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },
  normalize(v){ return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); },

  cashOutSignals(detail=[]){
    const out={cashierSalary:[],cashierBonus:[]};
    for(const row of detail||[]){
      const s=this.normalize(row?.label||row?.raw||"");
      if(/^gaji kasir\b/.test(s)) out.cashierSalary.push(row);
      if(/^(bonus kasir|bonus kpi|bonus ultimate)\b/.test(s)) out.cashierBonus.push(row);
    }
    return out;
  },

  rowInRange(row,start,end){
    const d=String(row?.tanggal||row?.date||row?.activity_date||"").slice(0,10);
    return Boolean(d && (!start||d>=start) && (!end||d<=end));
  },

  hasPeriodPayrollEvidence(row,start,end){
    if(!row)return false;

    // Product-only/training/backfill rows must not make a fixed-salary employee
    // historical-period relevant by themselves.
    const daily=Array.isArray(row.daily)?row.daily.filter(d=>this.rowInRange(d,start,end)):[];
    if(daily.some(d=>[
      d?.gajiPokok,
      d?.denda,
      d?.kasbon,
      d?.service
    ].some(v=>Math.abs(this.number(v))>0))) return true;

    const s=row.summary||{};
    return [
      s.gajiPokok,
      s.gajiKotor,
      s.denda,
      s.kasbon,
      s.bonusInsentif,
      s.bonusKpi,
      s.totalService
    ].some(v=>Math.abs(this.number(v))>0);
  },

  validate({report,payrollDataset,cabangId}={}){
    const id=Number(cabangId||report?.branch?.id||0);
    const start=String(report?.range?.start||"").slice(0,10);
    const end=String(report?.range?.end||"").slice(0,10);
    const payrollRows=Array.isArray(payrollDataset?.payroll)?payrollDataset.payroll:[];
    const branchRows=payrollRows.filter(r=>Number(r?.homeCabangId)===id && !r?.isBackupCashoutFloating);
    const nonCapster=branchRows.filter(r=>!r?.isCapster);
    const periodRelevantNonCapster=nonCapster.filter(r=>this.hasPeriodPayrollEvidence(r,start,end));
    const missingFixedSalary=periodRelevantNonCapster.filter(r=>Boolean(r?.salaryMissing) || String(r?.salarySource||"").toUpperCase()==="MISSING");
    const signals=this.cashOutSignals(report?.pengeluaran?.detail||[]);

    const payrollBonusTotal=branchRows.reduce((sum,r)=>sum+this.number(r?.summary?.bonusInsentif)+this.number(r?.summary?.bonusKpi),0);
    const cashoutBonusTotal=signals.cashierBonus.reduce((sum,r)=>sum+this.number(r?.nominal),0);
    const missingCashierBonus = cashoutBonusTotal>0 && payrollBonusTotal<=0;

    const issues=[];
    for(const r of missingFixedSalary){
      issues.push({code:"MISSING_FIXED_SALARY",level:"BLOCKER",employeeId:r.employeeId,nama:r.namaKaryawan,jabatan:r.jabatan,message:`Master Gaji ${r.namaKaryawan} belum diisi di Payroll.`});
    }
    if(missingCashierBonus){
      issues.push({code:"PAYROLL_BONUS_NOT_ENTERED",level:"BLOCKER",amount:cashoutBonusTotal,message:"Cash Out menunjukkan bonus kasir/KPI, tetapi bonus Payroll periode ini belum diinput."});
    }

    const monthlyProvider=report?.diagnostics?.providerMapping;
    const monthlyPendingRows=monthlyProvider?.pendingRows;
    const rawPayrollPending=report?.diagnostics?.payrollPendingMapping;
    const pendingProvider=Number(monthlyPendingRows!==undefined&&monthlyPendingRows!==null?monthlyPendingRows:(rawPayrollPending?.rows||0));
    const pendingProviderAmount=this.number(monthlyProvider?.pendingAmount!==undefined&&monthlyProvider?.pendingAmount!==null?monthlyProvider.pendingAmount:rawPayrollPending?.providerShare);
    if(pendingProvider>0){
      issues.push({code:"PENDING_PROVIDER_MAPPING",level:"BLOCKER",rows:pendingProvider,amount:pendingProviderAmount,message:"Masih ada provider/capster backup yang belum dimapping."});
    }

    return {
      status:issues.some(x=>x.level==="BLOCKER")?"BELUM_FINAL":"FINAL_READY",
      finalReady:!issues.some(x=>x.level==="BLOCKER"),
      issues,
      evidence:{
        fixedSalaryMissingCount:missingFixedSalary.length,
        fixedSalaryPeriodRelevantCount:periodRelevantNonCapster.length,
        cashoutCashierSalary:signals.cashierSalary.reduce((s,r)=>s+this.number(r.nominal),0),
        cashoutCashierBonus:cashoutBonusTotal,
        payrollBonus:payrollBonusTotal,
        providerPendingRows:pendingProvider,
        providerPendingAmount:pendingProviderAmount
      }
    };
  }
};

if(typeof window!=="undefined"){
  window.LaporanBulananReadiness=LaporanBulananReadiness;

  // Load the isolated Mekarwangi Aug-2026 historical payroll adapter only after
  // all synchronous monthly consumer scripts are available. This remains
  // consumer-only and does not touch locked engines or source data.
  const loadMekarwangiHistoricalBridge=()=>{
    if(window.__VAX_MEKARWANGI_AUG2026_BRIDGE_SCRIPT__) return;
    window.__VAX_MEKARWANGI_AUG2026_BRIDGE_SCRIPT__=true;
    const s=document.createElement("script");
    s.src="../js/modules/laporan-bulanan-mekarwangi-aug-2026-payroll-bridge.js?v=20260914-v1";
    s.async=false;
    document.head.appendChild(s);
  };
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",loadMekarwangiHistoricalBridge,{once:true});
  else loadMekarwangiHistoricalBridge();
}
