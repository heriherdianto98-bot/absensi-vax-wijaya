/*
 * Parahyangan JUL 2026 — Investor Revised Cash Out classification adapter.
 * Former manual SVP override stays retired. Read only against Minutes source,
 * Payroll, canonical engine, immutable snapshots, and other branches/months.
 * Runs after the existing Revised classifier and total builder.
 */
'use strict';
(() => {
  const BRANCH_ID = 8;
  const MONTH = '2026-07';
  const number = v => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; };
  const normalize = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const money = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number(v));
  const isRyanFuel = item => /^(?:uang )?bensin (?:ryan|rian)$/.test(normalize(item?.label || item?.raw));
  const proteckName = item => {
    const match = normalize(item?.label || item?.raw).match(/^proteck (uci|albi|anwar)$/);
    return match ? match[1] : '';
  };
  const isUciServiceShare = item => normalize(item?.label || item?.raw) === 'share uci paket ganteng pa topan';
  const samePerson = (a, b) => normalize(a) === normalize(b);

  function findCapster(rows, name) {
    return rows.find(row => samePerson(row?.nama, name)) || null;
  }
  function ensureCapster(rows, name) {
    let row = findCapster(rows, name);
    if (!row) {
      // The label on Cash Out identifies a beneficiary, NOT a provider mapping.
      // No employee ID is fabricated or saved to provider mappings.
      row = { employeeId: null, nama: name, payroll: 0, mapped: 0, protek: 0,
        freePoint: 0, serviceCashShare: 0, total: 0, isBackup: false,
        cashOutBeneficiaryOnly: true };
      rows.push(row);
    }
    return row;
  }

  function updateDisplay(report, fuelTotal) {
    const $ = id => document.getElementById(id);
    const value = (id, amount) => { if ($(id)) $(id).textContent = money(amount); };
    value('lbPayroll', report.gaji.total);
    value('lbOpex', report.pengeluaran.operasional);
    value('lbProfit', report.laba.labaBersih);
    const salaryLines = $('lbSalaryLines');
    if (salaryLines) {
      const rows = [...salaryLines.querySelectorAll('.lb-line')];
      const backup = rows.find(line => String(line.querySelector('span')?.textContent || '').trim() === 'Gaji Backup Kasir');
      if (backup) {
        const amount = backup.querySelector('strong');
        if (amount) amount.textContent = money(report.gaji.backupNamedSupplement);
        if (fuelTotal > 0 && !salaryLines.querySelector('[data-july-ryan-fuel]')) {
          const line = document.createElement('div');
          line.className = 'lb-line';
          line.dataset.julyRyanFuel = '1';
          const label = document.createElement('span');
          label.textContent = 'Termasuk bensin Ryan (Cash Out)';
          const nominal = document.createElement('strong');
          nominal.textContent = money(fuelTotal);
          line.append(label, nominal);
          backup.insertAdjacentElement('afterend', line);
        }
      }
      // Existing Revised salary breakdown is already rendered. Update the
      // affected capster rows rather than replacing its shared/locked renderer.
      for (const name of ['Uci', 'Albi', 'Anwar']) {
        const cap = findCapster(report.gaji.capsterDetail || [], name);
        if (!cap) continue;
        const line = [...salaryLines.querySelectorAll('.lb-line')].find(row => {
          const text = String(row.querySelector('span')?.textContent || '');
          return normalize(text.split(' · ')[0]) === normalize(name);
        });
        if (!line) continue;
        const label = line.querySelector('span');
        const nominal = line.querySelector('strong');
        if (label) {
          const parts = [];
          if (number(cap.payroll)) parts.push(`Share Cukur ${money(cap.payroll)}`);
          if (number(cap.mapped)) parts.push(`Backup Capster ${money(cap.mapped)}`);
          if (number(cap.protek)) parts.push(`Protek ${money(cap.protek)}`);
          if (number(cap.freePoint)) parts.push(`Free Point ${money(cap.freePoint)}`);
          if (number(cap.serviceCashShare)) parts.push(`Share Service ${money(cap.serviceCashShare)}`);
          label.textContent = `${cap.nama}${parts.length ? ` · ${parts.join(' + ')}` : ''}`;
        }
        if (nominal) nominal.textContent = money(cap.total);
      }
      const unassigned = (report.gaji.capsterDetail || []).find(row => normalize(row.nama) === 'protek belum terpetakan');
      if (!unassigned || number(unassigned.total) === 0) {
        const line = [...salaryLines.querySelectorAll('.lb-line')].find(row =>
          normalize(String(row.querySelector('span')?.textContent || '').split(' · ')[0]) === 'protek belum terpetakan');
        line?.remove();
      }
      const anwar = findCapster(report.gaji.capsterDetail || [], 'Anwar');
      if (anwar && ![...salaryLines.querySelectorAll('.lb-line')].some(row =>
        normalize(String(row.querySelector('span')?.textContent || '').split(' · ')[0]) === 'anwar')) {
        const line = document.createElement('div');
        line.className = 'lb-line';
        const label = document.createElement('span');
        label.textContent = `Anwar · Protek ${money(anwar.protek)}`;
        const nominal = document.createElement('strong');
        nominal.textContent = money(anwar.total);
        line.append(label, nominal);
        salaryLines.querySelector('.lb-line.total')?.insertAdjacentElement('beforebegin', line);
      }
      const total = salaryLines.querySelector('.lb-line.total strong');
      if (total) total.textContent = money(report.gaji.total);
    }
    for (const line of $('lbExpenseLines')?.querySelectorAll('.lb-line') || []) {
      const label = String(line.querySelector('span')?.textContent || '').trim();
      const total = line.querySelector('strong');
      if (!total) continue;
      if (label === 'Biaya Operasional') total.textContent = money(report.pengeluaran.operasional);
      if (label === 'Total Pengeluaran Non-Gaji') total.textContent = money(report.pengeluaran.total);
    }
    for (const line of $('lbResultLines')?.querySelectorAll('.lb-line') || []) {
      const label = String(line.querySelector('span')?.textContent || '').trim();
      const total = line.querySelector('strong');
      if (!total) continue;
      if (label === 'Total Biaya') total.textContent = money(report.laba.totalBiaya);
      if (label === 'Laba Bersih') total.textContent = money(report.laba.labaBersih);
    }
  }

  function apply(report, dataset) {
    if (Number(report?.branch?.id) !== BRANCH_ID ||
      String(report?.range?.start || '') !== '2026-07-01' ||
      String(report?.range?.end || '') !== '2026-07-31' ||
      report?.diagnostics?.investorRevised?.applied !== true ||
      String(dataset?.schema || '') !== 'INVESTOR_REVISED_DATASET_V1') return report;
    if (report?.diagnostics?.parahyanganJulyCashOut?.applied) return report;

    const details = Array.isArray(report?.pengeluaran?.detail) ? report.pengeluaran.detail : [];
    const capsters = Array.isArray(report?.gaji?.capsterDetail) ? report.gaji.capsterDetail : [];
    const fuels = details.filter(isRyanFuel);
    const protecks = details.filter(item => proteckName(item));
    const serviceShares = details.filter(isUciServiceShare);
    // Reclassify ONLY raw items the existing classifier put into operational.
    // If already handled upstream, do not add them a second time.
    const pendingProtecks = protecks.filter(item => item.category === 'OPERASIONAL');
    const pendingShares = serviceShares.filter(item => item.category === 'OPERASIONAL');
    const excludedFuel = fuels.filter(item => item.category === 'EXCLUDE_PAYROLL_DUPLICATE');
    const operationalFuel = fuels.filter(item => item.category === 'OPERASIONAL');
    const permittedFuel = excludedFuel.length + operationalFuel.length === fuels.length;
    const existingBackup = Array.isArray(report?.gaji?.backupNamedDetail) ? report.gaji.backupNamedDetail : [];
    const existingPayroll = Array.isArray(report?.gaji?.payrollDetail) ? report.gaji.payrollDetail : [];
    const fuelAlreadyInPayroll = existingBackup.some(isRyanFuel) || existingPayroll.some(row =>
      (row?.cashOutSalaryItems || []).some(isRyanFuel) ||
      (row?.daily || []).some(day => (day?.cashOutSalaryItems || []).some(isRyanFuel))
    );
    const fuelItems = permittedFuel && !fuelAlreadyInPayroll ? fuels : [];
    const fuelTotal = fuelItems.reduce((sum, item) => sum + number(item.nominal), 0);
    const fuelInOperational = operationalFuel.reduce((sum, item) => sum + number(item.nominal), 0);
    const salaryTransfer = [...pendingProtecks, ...pendingShares].reduce((sum, item) => sum + number(item.nominal), 0);
    const beforeCost = number(report.gaji.total) + number(report.pengeluaran.operasional) +
      number(report.pengeluaran.tunjanganMess) + number(report.pengeluaran.sewa);
    const expectedCost = beforeCost + fuelTotal - (fuelItems.length ? fuelInOperational : 0);

    // Existing Protek Anwar was grouped as unassigned; the named Cash Out
    // amount may be moved to an Anwar-labelled display row, but never mapped
    // to an employee ID or written into provider_sales_daily_source.
    const knownAnwar = details.filter(item => item.category === 'GAJI_CAPSTER_PROTEK' &&
      /^(?:protek|proteksi|protect) anwar$/.test(normalize(item.label)));
    const knownAnwarTotal = knownAnwar.reduce((sum, item) => sum + number(item.nominal), 0);
    const unassigned = capsters.find(row => normalize(row?.nama) === 'protek belum terpetakan');
    const anwar = findCapster(capsters, 'Anwar');
    const canAttributeAnwar = knownAnwarTotal > 0 && unassigned &&
      number(unassigned.protek) === knownAnwarTotal && !anwar;

    if (fuelTotal > 0) {
      report.gaji.backupFuelDetail = fuelItems.map(item => ({
        tanggal: item.tanggal, nama: 'Ryan', label: item.label,
        amount: number(item.nominal), source: 'MINUTES_REVISED_CASH_OUT',
        kind: 'NAMED_BACKUP_FUEL'
      }));
      report.gaji.backupNamedDetail = [...existingBackup, ...report.gaji.backupFuelDetail];
      report.gaji.backupNamedSupplement = number(report.gaji.backupNamedSupplement) + fuelTotal;
    }
    if (canAttributeAnwar) {
      unassigned.protek -= knownAnwarTotal;
      unassigned.total -= knownAnwarTotal;
      const target = ensureCapster(capsters, 'Anwar');
      target.protek += knownAnwarTotal;
      target.total += knownAnwarTotal;
    }
    for (const item of pendingProtecks) {
      const who = proteckName(item);
      const name = who.charAt(0).toUpperCase() + who.slice(1);
      const target = ensureCapster(capsters, name);
      target.protek = number(target.protek) + number(item.nominal);
      target.total = number(target.total) + number(item.nominal);
      item.category = 'GAJI_CAPSTER_PROTEK';
    }
    for (const item of pendingShares) {
      const target = ensureCapster(capsters, 'Uci');
      target.serviceCashShare = number(target.serviceCashShare) + number(item.nominal);
      target.total = number(target.total) + number(item.nominal);
      item.category = 'GAJI_CAPSTER_SHARE_SERVICE';
    }
    report.gaji.protek = number(report.gaji.protek) + pendingProtecks.reduce((sum, item) => sum + number(item.nominal), 0);
    report.gaji.capsterDetailTotal = capsters.reduce((sum, row) => sum + number(row.total), 0);
    report.gaji.total = number(report.gaji.total) + fuelTotal + salaryTransfer;
    report.pengeluaran.operasional = number(report.pengeluaran.operasional) - salaryTransfer - (fuelItems.length ? fuelInOperational : 0);
    report.pengeluaran.total = number(report.pengeluaran.operasional) +
      number(report.pengeluaran.tunjanganMess) + number(report.pengeluaran.sewa);
    report.laba.totalBiaya = number(report.gaji.total) + number(report.pengeluaran.total);
    report.laba.labaBersih = number(report.laba.totalPendapatan) - number(report.laba.totalBiaya);
    if (report.pengeluaran.operasional < 0 || report.laba.totalBiaya !== expectedCost) {
      // Never publish an inconsistent reconstructed report.
      throw new Error('Rekonsiliasi Cash Out Juli tidak balance; periksa sumber dan kategori.');
    }
    report.diagnostics = report.diagnostics || {};
    report.diagnostics.parahyanganJulyCashOut = {
      applied: true, source: 'MINUTES_REVISED_CASH_OUT',
      ryanFuel: fuelTotal, proteck: pendingProtecks.reduce((s, x) => s + number(x.nominal), 0),
      uciShare: pendingShares.reduce((s, x) => s + number(x.nominal), 0),
      attributedAnwar: canAttributeAnwar ? knownAnwarTotal : 0,
      note: 'Scoped reclassification only; no provider mapping or source write.'
    };
    // Keep the legacy diagnostic for existing Ryan-only consumers.
    if (fuelTotal > 0) report.diagnostics.parahyanganJulyRyanFuel = {
      applied: true, source: 'INVESTOR_REVISED_CASH_OUT', rows: fuelItems.length,
      fuelTotal, previouslyOperational: fuelInOperational
    };
    window.LaporanBulananInvestorShareBridge?.apply?.(report);
    window.LaporanBulananInvestorShareBridge?.emit?.(report);
    updateDisplay(report, fuelTotal);
    return report;
  }

  document.addEventListener('laporan-investor:revised-report-applied', event => {
    try { apply(event.detail?.report, event.detail?.dataset); }
    catch (err) { console.error('[Parahyangan JUL Cash Out]', err); }
  });
  window.LaporanInvestorParahyanganJulySvpBridge = Object.freeze({
    retired: true, source: 'CANONICAL_MONTHLY_CONSUMER',
    julyCashOut: 'REVISED_CASH_OUT_ONLY'
  });
})();

/* UI ONLY: scope the locked salary diagram's presentation to Parahyangan JUL 2026. */
(() => {
  const normal = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const rupiah = value => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Number(value || 0));
  let observer;

  function paint() {
    const report = window.InvestorRevisedReport;
    const branch = document.getElementById('lbBranch');
    const period = document.getElementById('lbMonth');
    if (String(branch?.value) !== '8' || period?.value !== '2026-07' ||
        Number(report?.branch?.id) !== 8 ||
        report?.diagnostics?.investorRevised?.applied !== true ||
        report?.diagnostics?.parahyanganJulyCashOut?.applied !== true ||
        String(report?.range?.start) !== '2026-07-01' ||
        String(report?.range?.end) !== '2026-07-31') return;

    const diagram = document.getElementById('vax-salary-diagram');
    if (!diagram) return;
    const group = [...diagram.querySelectorAll('.vax-salary-group')].find(node =>
      normal(node.querySelector('.vax-salary-group-head h3')?.textContent) === 'gaji capster'
    );
    if (!group) return;
    const cards = [...group.querySelectorAll('.vax-salary-card')];
    const uci = cards.find(card => normal(card.querySelector('.vax-salary-identity h4')?.textContent) === 'uci');
    const service = Number((report.gaji?.capsterDetail || []).find(row => normal(row.nama) === 'uci')?.serviceCashShare || 0);
    const details = uci?.querySelector('.vax-salary-details');
    if (details && service > 0 && !details.querySelector('[data-july-uci-service]')) {
      const item = document.createElement('div');
      item.className = 'vax-salary-detail';
      item.dataset.julyUciService = '1';
      const title = document.createElement('span');
      title.textContent = 'Share Service';
      const amount = document.createElement('strong');
      amount.textContent = rupiah(service);
      item.append(title, amount);
      details.appendChild(item);
    }

    for (const card of cards) {
      if (normal(card.querySelector('.vax-salary-identity h4')?.textContent) !== 'protek belum terpetakan') continue;
      const source = (report.gaji?.capsterDetail || []).find(row => normal(row.nama) === 'protek belum terpetakan');
      if (!source || Number(source.total || 0) === 0) card.remove();
    }
    const count = group.querySelectorAll('.vax-salary-card').length;
    const badge = group.querySelector('.vax-salary-group-head span');
    if (badge && badge.textContent !== `${count} karyawan`) badge.textContent = `${count} karyawan`;
  }

  function boot() {
    const salaryCard = document.querySelector('[data-lb-view="salary"]');
    if (salaryCard) {
      observer = new MutationObserver(paint);
      observer.observe(salaryCard, { childList: true, subtree: true });
    }
    document.addEventListener('laporan-investor:revised-report-applied', () => requestAnimationFrame(paint));
    document.getElementById('lbSectionView')?.addEventListener('change', () => requestAnimationFrame(paint));
    document.getElementById('lbBranch')?.addEventListener('change', () => requestAnimationFrame(paint));
    document.getElementById('lbMonth')?.addEventListener('change', () => requestAnimationFrame(paint));
    requestAnimationFrame(paint);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();