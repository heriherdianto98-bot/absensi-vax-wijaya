/*
=========================================================
VAX ERP — LAPORAN BULANAN PAYROLL ADJUSTMENT BRIDGE V4
=========================================================
Consumer-only bridge.
- Reads Payroll with manual adjustments already applied.
- Monthly investor report uses GROSS payroll cost:
  Gaji Pokok + Bonus Insentif + Bonus KPI + Bonus Produk.
- Denda and Kasbon remain payroll/slip deductions only and MUST NOT
  reduce company payroll cost in Laporan Bulanan.
- Reconciles report payroll amount to adjusted Payroll result.
- Exposes per-employee MONTHLY COST components for Monthly display/print.
- Preserves original payroll deductions separately as payrollDenda/payrollKasbon
  for audit, without exposing them as monthly cost adjustments.
- For LOCKED historical periods, routes Monthly payroll reads through
  HistoricalOriginalRouter so audited Historical Payroll Corrections are read.
- Does NOT modify PayrollUnifiedEngine, LaporanBulananEngine, formulas,
  immutable snapshot rows, Arus Kas, Kasbon, print engine, or UI layout.
=========================================================
*/
"use strict";

const LaporanBulananPayrollAdjustmentBridge = {
  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },

  grossPayrollCost({gajiPokok=0,bonusInsentif=0,bonusKpi=0,bonusProduk=0}={}){
    return this.number(gajiPokok)
      +this.number(bonusInsentif)
      +this.number(bonusKpi)
      +this.number(bonusProduk);
  },

  monthlyCostDetail({employee,gajiPokok,denda,kasbon,bonusInsentif,bonusKpi,bonusProduk,amount,source}){
    return {
      employeeId:employee?.employeeId,
      nama:employee?.namaKaryawan,
      jabatan:employee?.jabatan,
      amount,
      gajiPokok,

      // Monthly investor cost basis: deductions are NOT cost reductions.
      denda:0,
      kasbon:0,

      // Preserve payroll/slip values for audit only.
      payrollDenda:this.number(denda),
      payrollKasbon:this.number(kasbon),

      bonusInsentif:this.number(bonusInsentif),
      bonusKpi:this.number(bonusKpi),
      bonusProduk:this.number(bonusProduk),
      source,
      payrollCostBasis:"GROSS_COMPENSATION_BEFORE_DEDUCTIONS",
      isCapster:Boolean(employee?.isCapster)
    };
  },

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
        const amount=this.grossPayrollCost({
          gajiPokok,
          bonusInsentif:employeeBonusInsentif,
          bonusKpi:employeeBonusKpi,
          bonusProduk:employeeBonusProduk
        });
        bonusInsentif+=employeeBonusInsentif;
        bonusKpi+=employeeBonusKpi;
        bonusProduk+=employeeBonusProduk;
        if(amount){
          total+=amount;
          detail.push(this.monthlyCostDetail({
            employee,gajiPokok,denda,kasbon,
            bonusInsentif:employeeBonusInsentif,
            bonusKpi:employeeBonusKpi,
            bonusProduk:employeeBonusProduk,
            amount,
            source:"PAYROLL_FLOATING_BRANCH_GROSS_COST"
          }));
        }
        continue;
      }

      if(Number(employee?.homeCabangId)!==id) continue;
      const summary=employee?.summary||{};
      const gajiPokok=this.number(summary.gajiPokok);
      const denda=this.number(summary.denda);
      const kasbon=this.number(summary.kasbon);
      const employeeBonusInsentif=this.number(summary.bonusInsentif);
      const employeeBonusKpi=this.number(summary.bonusKpi);
      const employeeBonusProduk=this.number(summary.bonusProduk);
      const amount=this.grossPayrollCost({
        gajiPokok,
        bonusInsentif:employeeBonusInsentif,
        bonusKpi:employeeBonusKpi,
        bonusProduk:employeeBonusProduk
      });

      total+=amount;
      bonusInsentif+=employeeBonusInsentif;
      bonusKpi+=employeeBonusKpi;
      bonusProduk+=employeeBonusProduk;
      detail.push(this.monthlyCostDetail({
        employee,gajiPokok,denda,kasbon,
        bonusInsentif:employeeBonusInsentif,
        bonusKpi:employeeBonusKpi,
        bonusProduk:employeeBonusProduk,
        amount,
        source:"PAYROLL_HOME_BRANCH_GROSS_COST"
      }));
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
      payrollCostBasis:"GROSS_COMPENSATION_BEFORE_DEDUCTIONS",
      deductionsExcludedFromMonthlyCost:["DENDA","KASBON"],
      bonusInsentif:report.gaji.bonusInsentif,
      bonusKpi:report.gaji.bonusKpi,
      bonusProduk:report.gaji.bonusProduk,
      historicalLocked:Boolean(payrollDataset?.historicalLocked),
      historicalCorrections:Number(payrollDataset?.snapshot?.correction_count||0)
    };
    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananPayrollAdjustmentBridge=LaporanBulananPayrollAdjustmentBridge;

/*
  Historical Monthly adapter installation.
  This file is already loaded BEFORE laporan-bulanan-consumer.js, so we install
  a one-time setter that patches the consumer as soon as it is exposed on window.
  LIVE months continue through the original loadAdjustedPayroll unchanged.
*/
(() => {
  if(typeof window==="undefined" || window.__VAX_MONTHLY_HISTORICAL_PAYROLL_ADAPTER_V1__) return;
  window.__VAX_MONTHLY_HISTORICAL_PAYROLL_ADAPTER_V1__=true;

  let routerPromise=null;
  function ensureHistoricalRouter(){
    if(window.HistoricalOriginalRouter?.loadPayrollPeriod) return Promise.resolve(window.HistoricalOriginalRouter);
    if(routerPromise) return routerPromise;
    routerPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-vax-historical-original-router="1"]');
      if(existing){
        existing.addEventListener('load',()=>resolve(window.HistoricalOriginalRouter),{once:true});
        existing.addEventListener('error',()=>reject(new Error('HistoricalOriginalRouter gagal dimuat.')),{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src='../js/modules/historical-original-router.js?v=20260914-monthly1';
      script.async=false;
      script.dataset.vaxHistoricalOriginalRouter='1';
      script.onload=()=>{
        if(window.HistoricalOriginalRouter?.loadPayrollPeriod) resolve(window.HistoricalOriginalRouter);
        else reject(new Error('HistoricalOriginalRouter tidak tersedia setelah script dimuat.'));
      };
      script.onerror=()=>reject(new Error('HistoricalOriginalRouter gagal dimuat.'));
      document.head.appendChild(script);
    }).catch(err=>{routerPromise=null;throw err;});
    return routerPromise;
  }

  function patchConsumer(consumer){
    if(!consumer || consumer.__monthlyHistoricalPayrollAdapterV1) return consumer;
    const liveLoad=consumer.loadAdjustedPayroll.bind(consumer);
    consumer.loadAdjustedPayroll=async function historicalAwareMonthlyPayroll(report){
      const start=String(report?.range?.start||'');
      const end=String(report?.range?.end||'');
      if(start&&end){
        const router=await ensureHistoricalRouter();
        const historical=await router.loadPayrollPeriod({start,end});
        if(historical){
          window.__VAX_LAPORAN_BULANAN_HISTORICAL_PAYROLL__={
            locked:true,
            source:historical.source||'SNAPSHOT_ORIGINAL',
            snapshot:historical.snapshot||null,
            corrections:Number(historical?.snapshot?.correction_count||0)
          };
          return historical;
        }
      }
      window.__VAX_LAPORAN_BULANAN_HISTORICAL_PAYROLL__={locked:false,source:'LIVE'};
      return liveLoad(report);
    };
    Object.defineProperty(consumer,'__monthlyHistoricalPayrollAdapterV1',{value:true,enumerable:false,writable:false});
    return consumer;
  }

  if(window.LaporanBulananConsumer){
    patchConsumer(window.LaporanBulananConsumer);
    return;
  }

  let stored;
  Object.defineProperty(window,'LaporanBulananConsumer',{
    configurable:true,
    enumerable:true,
    get(){return stored;},
    set(value){
      stored=value;
      patchConsumer(stored);
      Object.defineProperty(window,'LaporanBulananConsumer',{value:stored,writable:true,configurable:true,enumerable:true});
    }
  });
})();
