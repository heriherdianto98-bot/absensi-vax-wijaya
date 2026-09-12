"use strict";

/*
VAX ERP — Laporan Bulanan Consumer Facade
Read-only facade that composes the monthly engine with consumer-only bridges.
Does not modify locked source engines.

OWNER correction 13 Sep 2026:
- Pendapatan Produk Bulanan = GROSS PRODUCT dari Tabel Harian Semua Cabang.
- Protek / Proteksi / Protect yang menyebut nama capster = tambahan gaji capster tersebut.
- Gaji capster ditampilkan per nama: Payroll/share + mapped backup + protek = total.
*/
const LaporanBulananConsumer = {
  _masterBridgeInstalled:false,

  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },
  normalize(v){ return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); },

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

  recalcInvestor(report){
    if(!report?.investor) return;
    const pct=this.number(report.investor.persentase);
    const laba=this.number(report?.laba?.labaBersih);
    const share=laba>0&&pct>0?Math.round(laba*pct/100):0;
    report.investor.bagiHasil=share;
    report.investor.totalHakBulanIni=share+this.number(report.investor.sewaDibayar);
  },

  async applyGrossProduct(report,client){
    if(typeof DailyDataEngine==="undefined"||typeof DailyDataEngine.load!=="function") return report;
    const daily=await DailyDataEngine.load({
      client,
      start:report.range.start,
      end:report.range.end,
      cabangId:report.branch.id
    });
    const grossProduct=this.number(daily?.summary?.product);
    const oldTotal=this.number(report?.pendapatan?.total);
    const newTotal=this.number(report?.pendapatan?.cukur)+grossProduct;
    const delta=newTotal-oldTotal;

    report.pendapatan=report.pendapatan||{};
    report.pendapatan.produkGross=grossProduct;
    report.pendapatan.total=newTotal;

    report.laba=report.laba||{};
    report.laba.totalPendapatan=newTotal;
    report.laba.labaBersih=this.number(report.laba.labaBersih)+delta;
    this.recalcInvestor(report);

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.grossProductCorrection={
      source:"DailyDataEngine.summary.product",
      previousProductNett:this.number(report.pendapatan.produkNett),
      grossProduct,
      revenueDelta:delta
    };
    return report;
  },

  protectionName(label){
    const clean=String(label||"").trim();
    const m=clean.match(/^\s*(?:protek(?:si)?|protect|protection|proteck)\s+(.+?)\s*$/i);
    return String(m?.[1]||"").trim();
  },

  extractProtectionDetail(cashOutRows=[]){
    const detail=[];
    for(const row of cashOutRows){
      const items=typeof LaporanBulananEngine!=="undefined"&&typeof LaporanBulananEngine.parseCashOutItems==="function"
        ?LaporanBulananEngine.parseCashOutItems(row?.keterangan_cash_out)
        :[];
      for(const item of items){
        const label=String(item?.label||"").trim();
        if(!/^\s*(?:protek(?:si)?|protect|protection|proteck)\b/i.test(label)) continue;
        const amount=this.number(item?.nominal);
        if(amount<=0) continue;
        detail.push({
          tanggal:String(row?.tanggal||"").slice(0,10),
          cabangId:Number(row?.cabang_id||0)||null,
          nama:this.protectionName(label)||"Capster",
          amount,
          label,
          raw:item?.raw||label
        });
      }
    }
    return detail;
  },

  applyProtectionReclassification(report,protectionDetail=[]){
    const actual=protectionDetail.reduce((sum,row)=>sum+this.number(row.amount),0);
    const current=this.number(report?.gaji?.protek);
    const delta=actual-current;

    report.gaji=report.gaji||{};
    report.gaji.protek=actual;
    report.gaji.protekDetail=protectionDetail;

    if(delta!==0){
      /*
        Protek yang sebelumnya gagal dikenali berada di Operasional.
        Pindahkan hanya klasifikasinya: total biaya/laba tidak berubah.
      */
      report.gaji.total=this.number(report.gaji.total)+delta;
      report.pengeluaran=report.pengeluaran||{};
      report.pengeluaran.operasional=Math.max(0,this.number(report.pengeluaran.operasional)-delta);
      report.pengeluaran.total=this.number(report.pengeluaran.operasional)+this.number(report.pengeluaran.sewa);
    }

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.protectionReclassification={previous:current,actual,delta,rows:protectionDetail.length};
    return report;
  },

  buildCapsterBreakdown(report){
    const map=new Map();
    const ensure=(key,name)=>{
      const k=String(key||this.normalize(name)||name||"capster");
      if(!map.has(k)) map.set(k,{employeeId:null,nama:String(name||"Capster"),payroll:0,mapped:0,protek:0,total:0,isBackup:false});
      return map.get(k);
    };

    let capsterPayrollBaseTotal=0;
    for(const row of (report?.gaji?.payrollDetail||[])){
      if(!row?.isCapster) continue;
      const amount=this.number(row?.amount);
      capsterPayrollBaseTotal+=amount;
      const key=row?.employeeId?`id:${row.employeeId}`:`name:${this.normalize(row?.nama)}`;
      const target=ensure(key,row?.nama);
      target.employeeId=row?.employeeId||target.employeeId;
      target.payroll+=amount;
    }

    for(const row of (report?.gaji?.providerMappedDetail||[])){
      const key=row?.employeeId?`id:${row.employeeId}`:`name:${this.normalize(row?.employeeName)}`;
      const target=ensure(key,row?.employeeName||row?.provider||"Backup Capster");
      target.employeeId=row?.employeeId||target.employeeId;
      target.mapped+=this.number(row?.amount);
      target.isBackup=true;
    }

    for(const row of (report?.gaji?.protekDetail||[])){
      const wanted=this.normalize(row?.nama);
      let target=[...map.values()].find(x=>this.normalize(x.nama)===wanted);
      if(!target){
        const partial=[...map.values()].filter(x=>{
          const a=this.normalize(x.nama),b=wanted;
          return a&&b&&(a===b||a.startsWith(b+" ")||b.startsWith(a+" "));
        });
        if(partial.length===1) target=partial[0];
      }
      if(!target) target=ensure(`name:${wanted}`,row?.nama||"Capster");
      target.protek+=this.number(row?.amount);
    }

    const detail=[...map.values()].map(row=>({
      ...row,
      total:this.number(row.payroll)+this.number(row.mapped)+this.number(row.protek)
    })).filter(row=>row.total!==0).sort((a,b)=>String(a.nama).localeCompare(String(b.nama),"id"));

    report.gaji=report.gaji||{};
    report.gaji.capsterDetail=detail;
    report.gaji.capsterDetailTotal=detail.reduce((sum,row)=>sum+this.number(row.total),0);
    report.gaji.capsterPayrollBaseTotal=capsterPayrollBaseTotal;
    report.gaji.nonCapsterPayroll=Math.max(0,this.number(report.gaji.payroll)-capsterPayrollBaseTotal);
    return report;
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
    await this.applyGrossProduct(report,client);

    if(insight?.__monthlyInvestor){
      report.performance={
        ...(report.performance||{}),
        ...insight.__monthlyInvestor
      };
    }

    let payrollDataset=null;
    let cashOutRows=null;

    if(typeof PayrollUnifiedEngine!=="undefined"){
      payrollDataset=await this.loadAdjustedPayroll(report);
      if(typeof LaporanBulananPayrollAdjustmentBridge!=="undefined"){
        LaporanBulananPayrollAdjustmentBridge.apply(report,payrollDataset);
      }
    }

    cashOutRows=await LaporanBulananEngine.fetchDailyCashOut({
      client,
      start:report.range.start,
      end:report.range.end,
      cabangId:report.branch.id
    });

    if(typeof LaporanBulananBackupCashoutBridge!=="undefined"){
      if(!payrollDataset) payrollDataset=await this.loadAdjustedPayroll(report);
      const supplement=LaporanBulananBackupCashoutBridge.extract({
        cashOutRows,
        payrollRows:payrollDataset.payroll||[],
        cabangId:report.branch.id
      });
      LaporanBulananBackupCashoutBridge.apply(report,supplement);
    }

    const protectionDetail=this.extractProtectionDetail(cashOutRows);
    this.applyProtectionReclassification(report,protectionDetail);
    this.buildCapsterBreakdown(report);

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