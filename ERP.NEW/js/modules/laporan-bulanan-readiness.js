/*
=========================================================
VAX ERP — LAPORAN BULANAN READINESS VALIDATOR V1
=========================================================
Consumer-only validation for investor report readiness.
Does NOT modify Payroll, Cash Out, DailyDataEngine, or Master data.

Current owner rules:
- Fixed salary must come from Payroll Master, not Cash Out fallback.
- Bonus KPI/Insentif must come from Payroll manual adjustments.
- Cash Out salary/bonus rows can be used as evidence that data is still
  incomplete, but must not silently replace Payroll.
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

  validate({report,payrollDataset,cabangId}={}){
    const id=Number(cabangId||report?.branch?.id||0);
    const payrollRows=Array.isArray(payrollDataset?.payroll)?payrollDataset.payroll:[];
    const branchRows=payrollRows.filter(r=>Number(r?.homeCabangId)===id && !r?.isBackupCashoutFloating);
    const nonCapster=branchRows.filter(r=>!r?.isCapster);
    const missingFixedSalary=nonCapster.filter(r=>Boolean(r?.salaryMissing) || String(r?.salarySource||"").toUpperCase()==="MISSING");
    const signals=this.cashOutSignals(report?.pengeluaran?.detail||[]);

    const payrollBonusTotal=branchRows.reduce((sum,r)=>sum+this.number(r?.summary?.bonusInsentif)+this.number(r?.summary?.bonusKpi),0);
    const cashoutBonusTotal=signals.cashierBonus.reduce((sum,r)=>sum+this.number(r?.nominal),0);
    const missingCashierBonus = cashoutBonusTotal>0 && payrollBonusTotal<=0;

    const issues=[];
    for(const r of missingFixedSalary){
      issues.push({
        code:"MISSING_FIXED_SALARY",
        level:"BLOCKER",
        employeeId:r.employeeId,
        nama:r.namaKaryawan,
        jabatan:r.jabatan,
        message:`Master Gaji ${r.namaKaryawan} belum diisi di Payroll.`
      });
    }
    if(missingCashierBonus){
      issues.push({
        code:"PAYROLL_BONUS_NOT_ENTERED",
        level:"BLOCKER",
        amount:cashoutBonusTotal,
        message:"Cash Out menunjukkan bonus kasir/KPI, tetapi bonus Payroll periode ini belum diinput."
      });
    }

    // IMPORTANT: when provider mapping has already been evaluated for this report,
    // pendingRows=0 is a valid resolved state and must NOT fall back to stale diagnostics.
    const mappedPending=report?.providerMapping?.pendingRows;
    const pendingProvider=Number(
      mappedPending !== undefined && mappedPending !== null
        ? mappedPending
        : (report?.diagnostics?.payrollPendingMapping?.rows||0)
    );
    if(pendingProvider>0){
      issues.push({
        code:"PENDING_PROVIDER_MAPPING",
        level:"BLOCKER",
        rows:pendingProvider,
        amount:this.number(report?.providerMapping?.pendingShare ?? report?.diagnostics?.payrollPendingMapping?.providerShare),
        message:"Masih ada provider/capster backup yang belum dimapping."
      });
    }

    return {
      status: issues.some(x=>x.level==="BLOCKER") ? "BELUM_FINAL" : "FINAL_READY",
      finalReady: !issues.some(x=>x.level==="BLOCKER"),
      issues,
      evidence:{
        fixedSalaryMissingCount:missingFixedSalary.length,
        cashoutCashierSalary:signals.cashierSalary.reduce((s,r)=>s+this.number(r.nominal),0),
        cashoutCashierBonus:cashoutBonusTotal,
        payrollBonus:payrollBonusTotal
      }
    };
  }
};

if(typeof window!=="undefined") window.LaporanBulananReadiness=LaporanBulananReadiness;
