/* ERP VAX — Owner invoice inbox presentation only.
 * Keeps existing invoice status, send/paid actions, backend and finance untouched.
 * A sent invoice remains visible until the existing paid action succeeds.
 */
"use strict";
(() => {
  const STYLE_ID = 'mtInvoiceInboxUiStyle';
  const style = () => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
      #mtInvoiceList .mt-inbox-active{padding:12px;border-bottom:1px solid #273843}
      #mtInvoiceList .mt-inbox-active > strong{display:block;margin:0 0 8px;color:#e9f5fc;font-size:12px;letter-spacing:.06em}
      #mtInvoiceList .mt-inbox-active .mt-invoice-row{margin:6px 0}
      #mtInvoiceList .mt-inbox-drafts{border-top:1px solid #273843;background:#0e171e}
      #mtInvoiceList .mt-inbox-drafts summary{cursor:pointer;list-style:none;padding:12px 18px;color:#b9cbd6;font-size:12px;font-weight:800;display:flex;justify-content:space-between}
      #mtInvoiceList .mt-inbox-drafts summary::-webkit-details-marker{display:none}
      #mtInvoiceList .mt-inbox-drafts summary::after{content:'⌄';color:#f0c454}
      #mtInvoiceList .mt-inbox-drafts[open] summary::after{content:'⌃'}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-active{padding:0 12px 12px}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-row{margin-top:5px}
      #mtInvoiceList .mt-inbox-empty{padding:12px 16px;color:#8da6b5;font-size:12px}
      #mtInvoiceList .mt-inbox-active .mt-invoice-status.sent{background:#173548;color:#84d8ff}
    `;
    document.head.appendChild(el);
  };

  function arrange() {
    const inv = window.SvPInvoice;
    const list = document.getElementById('mtInvoiceList');
    if (!inv || inv.role !== 'owner' || !inv.__workflowV2 || !list || list.dataset.invoiceInboxReady === '1') return;
    const draft = list.querySelector(':scope > .mt-invoice-active');
    const history = list.querySelector(':scope > .mt-invoice-history');
    if (!draft || !history) return;
    const historyList = history.querySelector('.mt-invoice-history-list');
    if (!historyList) return;
    const byId = new Map((inv.rows || []).map(r => [String(r.id), r]));
    const sent = [];
    [...historyList.querySelectorAll(':scope > .mt-invoice-row')].forEach(el => {
      const id = el.querySelector('[data-id]')?.getAttribute('data-id');
      const row = byId.get(String(id || ''));
      if (!row) return;
      const status = String(row.status || '').toLowerCase();
      if (status === 'sent') {
        const badge = el.querySelector('.mt-invoice-status');
        if (badge) badge.textContent = 'TERKIRIM';
        sent.push(el);
      } else if (status === 'paid') {
        const badge = el.querySelector('.mt-invoice-status');
        if (badge) badge.textContent = 'DIBAYAR';
      }
    });
    style();
    const active = document.createElement('div');
    active.className = 'mt-inbox-active';
    active.innerHTML = '<strong>INVOICE AKTIF · MENUNGGU TINDAK LANJUT SVP</strong>';
    if (sent.length) sent.forEach(el => active.appendChild(el));
    else active.insertAdjacentHTML('beforeend', '<div class="mt-inbox-empty">Tidak ada invoice terkirim yang menunggu tindak lanjut.</div>');
    list.insertBefore(active, draft);
    const drafts = document.createElement('details');
    drafts.className = 'mt-inbox-drafts';
    drafts.innerHTML = '<summary><span>Draft invoice · belum dikirim</span></summary>';
    list.insertBefore(drafts, draft);
    drafts.appendChild(draft);
    const remaining = historyList.querySelectorAll(':scope > .mt-invoice-row').length;
    const counter = history.querySelector('[data-history-toggle] b');
    if (counter) counter.textContent = String(remaining);
    if (!remaining) history.hidden = true;
    list.dataset.invoiceInboxReady = '1';
  }

  let queued = false;
  function install() {
    const list = document.getElementById('mtInvoiceList');
    if (!list || list.dataset.invoiceInboxObserver === '1') return false;
    list.dataset.invoiceInboxObserver = '1';
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; arrange(); });
    }).observe(list, {childList:true, subtree:false});
    arrange();
    return true;
  }
  let tries = 0;
  const timer = setInterval(() => { if (install() || ++tries > 180) clearInterval(timer); }, 100);
  window.addEventListener('load', () => setTimeout(install, 500));
})();