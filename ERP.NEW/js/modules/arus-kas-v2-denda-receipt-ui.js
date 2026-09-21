/* Read-only Buku Arus Kas rendering: actual fines received in KAS_DENDA appear as income, without touching KAS_BESAR balance. */
(() => {
  'use strict';
  if (window.__vaxFineCashBookUiV1) return;
  window.__vaxFineCashBookUiV1 = true;
  function decorate() {
    const flow = window.ArusKasV2;
    const tbody = document.getElementById('ak2LedgerBody');
    if (!flow || !tbody) return;
    const byId = new Map((flow.ledger || []).map(row => [String(row.id),row]));
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      const row = byId.get(String(tr.dataset.id));
      if (!row || row.source_type !== 'ABSENSI_DENDA_V1' || row.category !== 'DENDA_DITERIMA' || row.to_wallet !== 'KAS_DENDA') return;
      if (tr.dataset.vaxDendaReceivedShown === '1') return;
      const shift = tr.cells.length === 9 ? 1 : 0;
      const income = tr.cells[1 + shift], desc = tr.cells[2 + shift];
      if (!income || !desc) return;
      income.textContent = flow.rupiah(row.amount);
      income.classList.add('ak2-money-in');
      desc.textContent = `${row.description || 'Penerimaan denda'} (Kas Denda; tidak menambah Saldo Kas Besar)`;
      tr.dataset.vaxDendaReceivedShown = '1';
    });
  }
  const watch = () => {
    const tbody = document.getElementById('ak2LedgerBody');
    if (!tbody || tbody.dataset.vaxDendaReceiptWatching === '1') return;
    tbody.dataset.vaxDendaReceiptWatching = '1';
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {queued = false;decorate();});
    }).observe(tbody,{childList:true,subtree:false});
    decorate();
  };
  document.addEventListener('erp:finance-ready',() => {watch();setTimeout(decorate,200);});
  if (document.readyState !== 'loading') watch();
  else document.addEventListener('DOMContentLoaded',watch,{once:true});
})();