"use strict";

/*
VAX ERP — Laporan Bulanan Investor Share Bridge
CONSUMER ONLY / READ ONLY terhadap source.
OWNER RULE 13 Sep 2026:
- Modal Produk = 60% x Nett Produk.
- Laba Dasar Pembagian = Laba Bersih - Modal Produk.
- Porsi Investor = Master Investor cabang.
- Porsi Manajemen = 100% - Porsi Investor.
- Nilai Investor & Nilai Manajemen dihitung dari Laba Dasar Pembagian.
- Total Hak Investor = Nilai Investor + Sewa Dibayar.
Tidak mengubah Master Investor, DailyDataEngine, Payroll, Cash Out, atau engine LOCK.
*/
const LaporanBulananInvestorShareBridge = {
  PRODUCT_CAPITAL_RATE:60,
  _installed:false,
  _originalLoadMonth:null,
  lastReport:null,

  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },

  apply(report){
    if(!report?.investor) return report;

    const investorPct=Math.max(0,Math.min(100,this.number(report.investor.persentase)));
    const managementPct=Math.max(0,100-investorPct);
    const nettProduct=this.number(report?.pendapatan?.produkNett);
    const productCapital=Math.round(nettProduct*this.PRODUCT_CAPITAL_RATE/100);
    const netProfit=this.number(report?.laba?.labaBersih);
    const distributableProfit=netProfit-productCapital;
    const positiveBase=Math.max(0,distributableProfit);
    const investorValue=investorPct>0?Math.round(positiveBase*investorPct/100):0;
    const managementValue=managementPct>0?Math.round(positiveBase*managementPct/100):0;
    const rent=this.number(report.investor.sewaDibayar);

    report.investor.modalProdukRate=this.PRODUCT_CAPITAL_RATE;
    report.investor.nettProduk=nettProduct;
    report.investor.modalProduk=productCapital;
    report.investor.labaDasarPembagian=distributableProfit;
    report.investor.porsiInvestor=investorPct;
    report.investor.nilaiInvestor=investorValue;
    report.investor.porsiManajemen=managementPct;
    report.investor.nilaiManajemen=managementValue;
    report.investor.bagiHasil=investorValue;
    report.investor.totalHakBulanIni=investorValue+rent;

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.investorShareBasis={
      nettProduct,
      productCapitalRate:this.PRODUCT_CAPITAL_RATE,
      productCapital,
      netProfit,
      distributableProfit,
      investorPct,
      managementPct,
      investorValue,
      managementValue
    };

    this.lastReport=report;
    return report;
  },

  emit(report){
    if(typeof document==="undefined") return;
    setTimeout(()=>{
      document.dispatchEvent(new CustomEvent("laporan-bulanan:investor-share",{detail:report}));
    },0);
  },

  install(){
    if(this._installed) return;
    if(typeof LaporanBulananConsumer==="undefined"||typeof LaporanBulananConsumer.loadMonth!=="function") return;
    this._installed=true;
    this._originalLoadMonth=LaporanBulananConsumer.loadMonth.bind(LaporanBulananConsumer);
    LaporanBulananConsumer.loadMonth=async(args={})=>{
      const report=await this._originalLoadMonth(args);
      this.apply(report);
      this.emit(report);
      return report;
    };
  }
};

if(typeof window!=="undefined"){
  window.LaporanBulananInvestorShareBridge=LaporanBulananInvestorShareBridge;
  LaporanBulananInvestorShareBridge.install();
}
