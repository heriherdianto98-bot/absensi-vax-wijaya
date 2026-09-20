"use strict";
/* Monthly REPORT consumer rule: Soklat with no investor allocates net profit to management.
   This does not create a master investor, payment, ledger entry, or change locked engines. */
(() => {
  const bridge = window.LaporanBulananInvestorShareBridge;
  if (!bridge || typeof bridge.apply !== "function" || bridge.__soklatManagementRule) return;
  const baseApply = bridge.apply;
  const number = v => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
  bridge.apply = function(report) {
    const name = String(report?.branch?.name || report?.branch?.nama_cabang || "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const soklat = name === "soklat" || name === "vax wijaya soklat";
    const noMasterInvestor = !report?.master?.investor;
    if (!soklat || !noMasterInvestor || (report?.investor && !report.investor.managementOnly)) {
      return baseApply.call(this, report);
    }
    const profit = number(report?.laba?.labaBersih);
    const managementRight = Math.max(0, profit);
    report.investor = {
      nama: null, managementOnly: true, persentase: 0, porsiInvestor: 0,
      porsiManajemen: 100, bagiHasil: 0, nilaiInvestor: 0,
      nilaiManajemen: managementRight, totalHakBulanIni: 0,
      sewaDibayar: 0, sewaDibayarAktual: 0, sewaDitangguhkan: 0,
      nettProduk: number(report?.pendapatan?.produkNett), modalProduk: 0,
      modalProdukRate: 0, labaDasarPembagian: profit
    };
    report.diagnostics = report.diagnostics || {};
    report.diagnostics.managementOnlySoklat = {netProfit: profit, managementRight, investorRight: 0};
    this.lastReport = report;
    return report;
  };
  bridge.__soklatManagementRule = true;
})();
