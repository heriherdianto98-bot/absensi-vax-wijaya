/*
 * Parahyangan JUL 2026 — Investor Revised consumer-only Ryan fuel allocation.
 * The old manual SVP override remains RETIRED. Never changes canonical monthly
 * consumer, Payroll, Cash Out, provider mapping, ORIGINAL/FROZEN or snapshots.
 * Runs only after the existing Revised classifier/total builder has finished.
 */
'use strict';
(() => {
  const BRANCH_ID = 8;
  const MONTH = '2026-07';
  const number = value => {
    const result = Number(value || 0);
    return Number.isFinite(result) ? result : 0;
  };
  const normalize = value => String(value || '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const isRyanFuel = item => /^(?:uang )?bensin (?:ryan|rian)$/.test(normalize(item?.label || item?.raw));
  const money = value => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(number(value));

  function apply(report, dataset) {
    if (Number(report?.branch?.id) !== BRANCH_ID ||
        String(report?.range?.start || '').slice(0, 7) !== MONTH ||
        String(report?.range?.end || '').slice(0, 10) !== '2026-07-31' ||
        report?.diagnostics?.investorRevised?.applied !== true ||
        String(dataset?.schema || '') !== 'INVESTOR_REVISED_DATASET_V1') return report;
    if (report?.diagnostics?.parahyanganJulyRyanFuel?.applied) return report;

    const details = Array.isArray(report?.pengeluaran?.detail) ? report.pengeluaran.detail : [];
    const fuels = details.filter(isRyanFuel);
    if (!fuels.length) return report;
    // The existing classifier removes named floating fuel from operational.
    // Only move recognized items; fail closed if another classification appears.
    if (fuels.some(item => !['EXCLUDE_PAYROLL_DUPLICATE', 'OPERASIONAL'].includes(String(item.category)))) {
      console.warn('[Parahyangan JUL Ryan fuel] Unrecognized Cash Out category; no allocation.');
      return report;
    }

    const existingBackup = Array.isArray(report?.gaji?.backupNamedDetail) ? report.gaji.backupNamedDetail : [];
    const existingPayroll = Array.isArray(report?.gaji?.payrollDetail) ? report.gaji.payrollDetail : [];
    const alreadyIncluded = existingBackup.some(row => isRyanFuel(row)) || existingPayroll.some(row =>
      (row?.cashOutSalaryItems || []).some(item => isRyanFuel(item)) ||
      (row?.daily || []).some(day => (day?.cashOutSalaryItems || []).some(item => isRyanFuel(item)))
    );
    if (alreadyIncluded) {
      console.info('[Parahyangan JUL Ryan fuel] Already included in payroll; skip duplicate.');
      return report;
    }

    const fuelTotal = fuels.reduce((sum, item) => sum + number(item.nominal), 0);
    if (fuelTotal <= 0) return report;
    const previouslyOperational = fuels
      .filter(item => item.category === 'OPERASIONAL')
      .reduce((sum, item) => sum + number(item.nominal), 0);

    report.gaji.backupFuelDetail = fuels.map(item => ({
      tanggal: item.tanggal, nama: 'Ryan', label: item.label,
      amount: number(item.nominal), source: 'MINUTES_REVISED_CASH_OUT',
      kind: 'NAMED_BACKUP_FUEL'
    }));
    report.gaji.backupNamedDetail = [...existingBackup, ...report.gaji.backupFuelDetail];
    report.gaji.backupNamedSupplement = number(report.gaji.backupNamedSupplement) + fuelTotal;
    report.gaji.total = number(report.gaji.total) + fuelTotal;

    report.pengeluaran.operasional = number(report.pengeluaran.operasional) - previouslyOperational;
    report.pengeluaran.total = number(report.pengeluaran.operasional) +
      number(report.pengeluaran.tunjanganMess) + number(report.pengeluaran.sewa);
    report.laba.totalBiaya = number(report.gaji.total) + number(report.pengeluaran.total);
    report.laba.labaBersih = number(report.laba.totalPendapatan) - number(report.laba.totalBiaya);
    report.diagnostics.parahyanganJulyRyanFuel = {
      applied: true, source: 'INVESTOR_REVISED_CASH_OUT',
      rows: fuels.length, fuelTotal, previouslyOperational,
      note: 'Bensin Ryan masuk biaya gaji backup/floating; tidak dihitung dua kali.'
    };

    window.LaporanBulananInvestorShareBridge?.apply?.(report);
    window.LaporanBulananInvestorShareBridge?.emit?.(report);

    // The Revised renderer ran before this scoped bridge; refresh its KPI
    // and report lines without changing the shared renderer/locked diagram.
    const salaryKpi = document.getElementById('lbPayroll');
    const opexKpi = document.getElementById('lbOpex');
    const profitKpi = document.getElementById('lbProfit');
    if (salaryKpi) salaryKpi.textContent = money(report.gaji.total);
    if (opexKpi) opexKpi.textContent = money(report.pengeluaran.operasional);
    if (profitKpi) profitKpi.textContent = money(report.laba.labaBersih);
    const salaryLines = document.getElementById('lbSalaryLines');
    if (salaryLines) {
      const backupLine = [...salaryLines.querySelectorAll('.lb-line')].find(line =>
        /^Gaji Backup Kasir$/.test(String(line.querySelector('span')?.textContent || '').trim())
      );
      if (backupLine) {
        const amount = backupLine.querySelector('strong');
        if (amount) amount.textContent = money(report.gaji.backupNamedSupplement);
        const note = document.createElement('div');
        note.className = 'lb-line';
        const label = document.createElement('span');
        label.textContent = 'Termasuk bensin Ryan (2 item Cash Out)';
        const value = document.createElement('strong');
        value.textContent = money(fuelTotal);
        note.append(label, value);
        backupLine.insertAdjacentElement('afterend', note);
      }
      const total = salaryLines.querySelector('.lb-line.total strong');
      if (total) total.textContent = money(report.gaji.total);
    }
    const expenseLines = document.getElementById('lbExpenseLines');
    if (expenseLines) {
      const lines = [...expenseLines.querySelectorAll('.lb-line')];
      for (const line of lines) {
        const title = String(line.querySelector('span')?.textContent || '').trim();
        const value = line.querySelector('strong');
        if (!value) continue;
        if (title === 'Biaya Operasional') value.textContent = money(report.pengeluaran.operasional);
        if (title === 'Total Pengeluaran Non-Gaji') value.textContent = money(report.pengeluaran.total);
      }
    }
    const resultLines = document.getElementById('lbResultLines');
    if (resultLines) {
      for (const line of resultLines.querySelectorAll('.lb-line')) {
        const title = String(line.querySelector('span')?.textContent || '').trim();
        const value = line.querySelector('strong');
        if (!value) continue;
        if (title === 'Total Biaya') value.textContent = money(report.laba.totalBiaya);
        if (title === 'Laba Bersih') value.textContent = money(report.laba.labaBersih);
      }
    }
    return report;
  }

  document.addEventListener('laporan-investor:revised-report-applied', event => {
    try { apply(event.detail?.report, event.detail?.dataset); }
    catch (error) { console.error('[Parahyangan JUL Ryan fuel]', error); }
  });
  window.LaporanInvestorParahyanganJulySvpBridge = Object.freeze({
    retired: true, source: 'CANONICAL_MONTHLY_CONSUMER',
    julyRyanFuel: 'REVISED_CASH_OUT_ONLY'
  });
})();
