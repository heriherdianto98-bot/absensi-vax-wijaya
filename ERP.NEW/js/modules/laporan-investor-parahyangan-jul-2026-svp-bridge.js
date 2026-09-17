/*
 * Investor Revised / Parahyangan JUL 2026 — historical SVP reconciliation.
 * Only consumer report, never writes source, payroll, master, or ORIGINAL/FROZEN.
 * Reference: LABA RUGI PARAHYANGAN, tab 2026, column H (JULY).
 * https://docs.google.com/spreadsheets/d/1SXQ1_piBQLaqxoidtjqbbLFz9r32vW9FEBgyL6jcUlQ/edit
 * Month-specific bridge, NOT a Minutes Revised dataset or an approved final snapshot.
 */
"use strict";
(() => {
  const ID = 8;
  const MONTH = "2026-07";
  const SVP = Object.freeze({
    service: 29430000, product: 900000, customerManual: 340,
    albi: 4734000, uci: 4548000, aripin: 2881000,
    cashier: 1438462, accounting: 555555, backupCashier: 1300000,
    productCommission: 95000, operational: 3723000, rent: 7500000,
    totalSalary: 15552017, netProfit: 3554983,
    investorManual: 2132989, investorTransferManual: 9632989
  });
  const sum = values => values.reduce((total, value) => total + value, 0);
  const salaryRows = () => [
    {employeeId:null, nama:"Albi", payroll:SVP.albi, mapped:0, protek:0, freePoint:0, total:SVP.albi, isBackup:false},
    {employeeId:null, nama:"Uci", payroll:SVP.uci, mapped:0, protek:0, freePoint:0, total:SVP.uci, isBackup:false},
    {employeeId:null, nama:"Aripin", payroll:SVP.aripin, mapped:0, protek:0, freePoint:0, total:SVP.aripin, isBackup:false}
  ];
  const nonCapsterRows = () => [
    {employeeId:null, nama:"Irpan", jabatan:"Kasir", gajiPokok:SVP.cashier, amount:SVP.cashier, bonusProduk:0, bonusInsentif:0, bonusKpi:0, denda:0, kasbon:0},
    {employeeId:null, nama:"Tim Akunting", jabatan:"Akunting · alokasi", gajiPokok:SVP.accounting, amount:SVP.accounting, bonusProduk:0, bonusInsentif:0, bonusKpi:0, denda:0, kasbon:0},
    {employeeId:null, nama:"Komisi Produk (penerima belum dirinci)", jabatan:"Alokasi komisi produk", gajiPokok:0, amount:SVP.productCommission, bonusProduk:SVP.productCommission, bonusInsentif:0, bonusKpi:0, denda:0, kasbon:0}
  ];
  const applies = report => Number(report?.branch?.id) === ID
    && String(report?.range?.start || "").slice(0, 7) === MONTH
    && String(report?.range?.end || "").slice(0, 10) === "2026-07-31";
  const n = value => Number(value || 0);

  function apply(report) {
    if (!applies(report)) return report;
    // Do not alter the All Branches report or any other selected branch.
    if (typeof document !== "undefined" && String(document.getElementById("lbBranch")?.value || "") !== String(ID)) return report;
    const service = n(report?.pendapatan?.cukur);
    const product = n(report?.pendapatan?.produkGross);
    const rent = n(report?.pengeluaran?.sewa);
    if (service !== SVP.service || product !== SVP.product || rent !== SVP.rent) {
      throw new Error("Parahyangan Juli: sumber ERP/master berbeda dari rekonsiliasi SVP; tidak menerapkan fallback historis.");
    }
    if (sum([SVP.albi, SVP.uci, SVP.aripin, SVP.cashier, SVP.accounting, SVP.backupCashier, SVP.productCommission]) !== SVP.totalSalary) {
      throw new Error("Parahyangan Juli: rincian gaji SVP tidak cocok dengan total.");
    }
    const gross = service + product;
    const totalCost = SVP.totalSalary + SVP.operational + rent;
    if (gross - totalCost !== SVP.netProfit) {
      throw new Error("Parahyangan Juli: rumus laba tidak cocok dengan laporan SVP.");
    }

    // Preserve customer / transaction from canonical ERP (not manual 340).
    report.pendapatan = {
      ...report.pendapatan, cukur:service, produkGross:product,
      produkNett:product - SVP.productCommission, total:gross
    };
    const capsterDetail = salaryRows();
    const nonCapsterDetail = nonCapsterRows();
    report.gaji = {
      ...report.gaji,
      payroll:SVP.totalSalary - SVP.backupCashier,
      providerMapped:0, protek:0, svp:0, bonusKpi:0,
      backupNamedSupplement:SVP.backupCashier,
      capsterDetail, capsterDetailTotal:sum(capsterDetail.map(row=>row.total)),
      nonCapsterDetail, nonCapsterPayroll:sum(nonCapsterDetail.map(row=>row.amount)),
      total:SVP.totalSalary,
      // Historical source lacks itemized cash-out. Never classify its gross
      // amount as operational or let stale unparsed rows enter print/PDF.
      payrollDetail:[], providerMappedDetail:[], providerPendingDetail:[]
    };
    report.pengeluaran = {
      ...report.pengeluaran,
      operasional:SVP.operational, sewa:rent, tunjanganMess:0,
      total:SVP.operational + rent, detail:[],
      cashOutOfficial:n(report?.pengeluaran?.cashOutOfficial),
      excludedPayrollDuplicate:0, excludedRentDuplicate:0,
      unparsedOfficialRemainder:0
    };
    report.laba = {totalPendapatan:gross,totalBiaya:totalCost,labaBersih:SVP.netProfit};
    report.diagnostics = {
      ...report.diagnostics,
      parahyanganJulySvp: {
        applied:true, period:MONTH, branchId:ID,
        source:"LABA RUGI PARAHYANGAN!2026!H3:H34 (SVP manual Minutes)",
        customerSource:"ERP daily_recap_source", manualCustomer:SVP.customerManual,
        cashOutUndetailed:n(report.pengeluaran.cashOutOfficial),
        manualExpenseReconciliationGap:n(report.pengeluaran.cashOutOfficial) - (SVP.operational + rent),
        productNettAssumption:"Gross product - manual SVP komisi produk; verify against Minutes product share",
        manualInvestorShare:SVP.investorManual,
        manualInvestorTransfer:SVP.investorTransferManual
      }
    };
    report.readiness = {
      finalReady:false,
      issues:[
        {code:"SUMBER_SVP_MANUAL",message:"Juli 2026 memakai catatan manual SVP; belum ada snapshot Minutes Investor Revised Juli."},
        {code:"CASH_OUT_BELUM_TERURAI",message:"Cash Out ERP Rp11.438.117 tanpa rincian; klasifikasi operasional Rp3.723.000 dan gaji merujuk spreadsheet SVP."},
        {code:"KOMISI_PRODUK_PERLU_VERIFIKASI",message:"Nett produk dihitung Rp900.000 − komisi produk manual Rp95.000 untuk modal produk; cocokkan share pada detail Minutes sebelum final."}
      ]
    };
    report.review = {...report.review, status:"REKONSILIASI_SVP_BELUM_FINAL"};
    if (report.investor && window.LaporanBulananInvestorShareBridge?.apply) {
      window.LaporanBulananInvestorShareBridge.apply(report);
      window.LaporanBulananInvestorShareBridge.emit?.(report);
    }
    return report;
  }

  if (!window.LaporanBulananConsumer?.loadMonth) return;
  const original = window.LaporanBulananConsumer.loadMonth.bind(window.LaporanBulananConsumer);
  window.LaporanBulananConsumer.loadMonth = async function(args={}) {
    const report = await original(args);
    return apply(report);
  };
  window.LaporanInvestorParahyanganJulySvpBridge = {apply,applies,source:MONTH};
})();