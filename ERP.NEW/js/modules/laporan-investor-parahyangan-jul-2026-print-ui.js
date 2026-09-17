/* Print presentation only — Parahyangan July 2026. No source/engine writes. */
'use strict';
(() => {
  const PREFIX = '[Parahyangan July print UI]';
  const money = v => new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v || 0));
  const clean = v => String(v || '').toLowerCase().replace(/\s+/g,' ').trim();
  const amount = v => Number(String(v || '').replace(/[^\d]/g,'') || 0);
  const reportForPrint = () => {
    const r = window.InvestorRevisedReport;
    return String(document.getElementById('lbBranch')?.value) === '8' &&
      document.getElementById('lbMonth')?.value === '2026-07' &&
      Number(r?.branch?.id) === 8 && r?.range?.start === '2026-07-01' &&
      r?.range?.end === '2026-07-31' &&
      r?.diagnostics?.investorRevised?.applied === true &&
      r?.diagnostics?.parahyanganJulyCashOut?.applied === true ? r : null;
  };

  function enhanceHtml(html, report) {
    const source = String(html || '');
    if (!source || !report || !source.includes('branch-report')) return html;
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const branches = [...doc.querySelectorAll('.branch-report')];
    if (branches.length !== 1 || !clean(branches[0].textContent).includes('parahyangan')) return html;
    const branch = branches[0];
    const salary = [...branch.querySelectorAll('table')].find(table => {
      const header = clean(table.querySelector('thead')?.textContent);
      return header.includes('dasar / share') && header.includes('protek') && header.includes('total');
    });
    const cash = branch.querySelector('table.cashout');
    const recon = branch.querySelector('.recon');
    if (!salary || !cash || !recon) return html;
    const uci = (report.gaji?.capsterDetail || []).find(row => clean(row.nama) === 'uci');
    if (!uci || Number(uci.serviceCashShare || 0) <= 0) return html;
    const salaryRows = [...salary.querySelectorAll('tbody tr')];
    const uciRow = salaryRows.find(row => clean(row.cells?.[0]?.textContent) === 'uci');
    if (!uciRow || uciRow.cells.length < 6) return html;

    // Check the actual printable columns. Existing Free Point stays in ADJ.;
    // July Share Service is the difference to the ALREADY CORRECT total.
    // Only the printed presentation changes; never increase salary totals.
    const freePoint = Number(uci.freePoint || 0);
    const service = Number(uci.serviceCashShare || 0);
    const printedBase = amount(uciRow.cells[2].textContent);
    const printedAdjustment = amount(uciRow.cells[3].textContent);
    const printedProtek = amount(uciRow.cells[4].textContent);
    const printedTotal = amount(uciRow.cells[5].textContent);
    if (printedAdjustment !== freePoint ||
        printedTotal !== Number(uci.total || 0) ||
        printedBase + printedAdjustment + printedProtek + service !== printedTotal) {
      console.warn(PREFIX, 'Uci printable row does not balance; print unchanged.', {
        printedBase, printedAdjustment, printedProtek, service, printedTotal
      });
      return html;
    }
    // Keep the name column exactly as compact as August. The full Free Point
    // and Share Service breakdown belongs to ADJ., not beneath the name.
    uciRow.cells[0].textContent = 'Uci';
    const adjCell = uciRow.cells[3];
    adjCell.textContent = money(printedAdjustment + service);
    adjCell.title = `Free Point ${money(freePoint)} + Share Service ${money(service)}`;
    salaryRows.filter(row => clean(row.cells?.[0]?.textContent) === 'protek belum terpetakan' &&
      amount(row.cells?.[5]?.textContent) === 0).forEach(row => row.remove());

    // Classify Cash Out directly from the rows already printed. This changes
    // only the PDF's descriptive reconciliation, not the report or source.
    const bucket = {payroll:0, rent:0, svp:0, capster:0, operational:0, other:0};
    cash.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length < 5) return;
      const category = clean(row.cells[2].textContent);
      const nominal = amount(row.cells[3].textContent);
      const ops = amount(row.cells[4].textContent);
      if (category.includes('payroll') && category.includes('tidak masuk')) bucket.payroll += nominal;
      else if (category.includes('sewa master')) bucket.rent += nominal;
      else if (category.includes('gaji svp')) bucket.svp += nominal;
      else if (category.includes('gaji capster') || category.includes('protek') || category.includes('free point') || category.includes('share_service')) {
        bucket.capster += nominal;
        if (category.includes('share_service')) row.cells[2].textContent = 'Gaji Capster / Share Service';
      } else if (category.startsWith('operasional')) bucket.operational += ops;
      else bucket.other += nominal;
    });
    const total = Number(report.pengeluaran?.cashOutOfficial || 0);
    const expectedCash = bucket.payroll + bucket.rent + bucket.svp + bucket.capster + bucket.operational;
    if (bucket.other || expectedCash !== total ||
        bucket.operational !== Number(report.pengeluaran?.operasional || 0)) {
      console.warn(PREFIX, 'Cash Out reconciliation mismatch; leave original HTML.', bucket);
      return html;
    }
    const setLine = (prefix, label, value) => {
      const row = [...recon.querySelectorAll('.line')].find(node =>
        clean(node.querySelector('span')?.textContent).startsWith(prefix));
      if (!row) return false;
      row.querySelector('span').textContent = label;
      row.querySelector('strong').textContent = money(value);
      return true;
    };
    const ok = [
      setLine('dikeluarkan karena payroll', 'Dikeluarkan karena Payroll (gaji kasir, backup & bensin Ryan)', bucket.payroll),
      setLine('dikeluarkan karena sewa master', 'Dikeluarkan karena Sewa Master', bucket.rent),
      setLine('dikeluarkan ke gaji svp', 'Dikeluarkan ke Gaji SVP', bucket.svp),
      setLine('dikeluarkan ke gaji capster', 'Dikeluarkan ke Gaji Capster (Protek, Free Point & Share Service)', bucket.capster)
    ];
    if (ok.some(value => !value)) {
      console.warn(PREFIX, 'Print reconciliation labels not found; leave original HTML.');
      return html;
    }
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }

  function install() {
    const api = window.LaporanBulananPrintUI;
    if (!api?.__investorSignatureAnchorPatched || !api?.open || api.__parahyanganJulyPrintUi) return false;
    const prior = api.open;
    api.open = async function parahyanganJulyPrintUi(mode) {
      const report = reportForPrint();
      if (!report) return prior.call(this, mode);
      const savedOpen = window.open;
      window.open = function(...args) {
        const popup = savedOpen.apply(this,args);
        if (!popup?.document) return popup;
        const previousWrite = popup.document.write.bind(popup.document);
        popup.document.write = function(html) {
          return previousWrite(enhanceHtml(html, report));
        };
        return popup;
      };
      try { return await prior.call(this, mode); }
      finally { window.open = savedOpen; }
    };
    api.__parahyanganJulyPrintUi = true;
    return true;
  }
  let attempt = 0;
  const timer = setInterval(() => {
    attempt++;
    if (install() || attempt >= 80) clearInterval(timer);
  }, 100);
})();
