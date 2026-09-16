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
      #mtInvoiceList .mt-inbox-active{padding:12px;border-bottom:1px solid #6c5032}
      #mtInvoiceList .mt-inbox-active > strong{display:block;margin:0 0 8px;color:#fff0d7;font-size:12px;letter-spacing:.06em}
      #mtInvoiceList .mt-inbox-active .mt-invoice-row{margin:6px 0}
      #mtInvoiceList .mt-inbox-drafts{border-top:1px solid #9a754a;background:#372b21;border-radius:9px;overflow:hidden;margin:5px 12px}
      #mtInvoiceList .mt-inbox-drafts summary{cursor:pointer;list-style:none;padding:14px 18px;color:#fff5e6;font-size:14px;font-weight:900;display:flex;justify-content:space-between;background:#61452c;border:1px solid #b18b52;border-radius:9px}
      #mtInvoiceList .mt-inbox-drafts summary:hover{background:#745336;border-color:#d8b675}
      #mtInvoiceList .mt-inbox-drafts summary:focus-visible{outline:2px solid #ffe0a1;outline-offset:-3px}
      #mtInvoiceList .mt-inbox-drafts summary::-webkit-details-marker{display:none}
      #mtInvoiceList .mt-inbox-drafts summary::after{content:'⌄';color:#ffdf9b;font-size:17px}
      #mtInvoiceList .mt-inbox-drafts[open] summary::after{content:'⌃'}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-active{padding:10px 12px 12px;background:#372b21}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-row{margin-top:5px;background:#493728;border:1px solid #98764e;border-radius:10px}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-empty{color:#fff1dc;background:#493728;border-radius:9px;font-size:13px}
      #mtInvoiceList .mt-inbox-empty{padding:12px 16px;color:#e6d6c0;font-size:12px}
      #mtInvoiceList .mt-inbox-active .mt-invoice-status.sent{background:#173548;color:#84d8ff}

      /* Invoice panel only: warm charcoal/copper instead of the previous blue card. */
      .page-master-tagihan #mtInvoiceCard{background:#29231d!important;border-color:#927247!important;box-shadow:0 12px 28px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,238,208,.05)}
      .page-master-tagihan #mtInvoiceCard::before,.page-master-tagihan #mtInvoiceCard::after{opacity:0!important;animation:none!important}
      .page-master-tagihan #mtInvoiceCard:hover{border-color:#c29a5d!important;box-shadow:0 16px 32px rgba(0,0,0,.3),0 0 0 1px rgba(230,182,101,.12)!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head{background:#35291f!important;border-bottom-color:#80603e!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head strong{color:#fff0d5!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head small{color:#e0cdb3!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList{background:#30261e!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-active{background:#392d22!important;border-bottom-color:#80603e!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-active > strong{color:#ffe2a4!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-empty{color:#eadbc7!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts{background:#3b2e22!important;border-color:#aa8250!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary{background:#62472d!important;color:#fff3db!important;border-color:#bc9258!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary:hover{background:#795638!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-active{background:#3b2e22!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-empty{background:#4d3928!important;border-color:#aa8250!important;color:#fff1d9!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row small,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row>div:nth-child(2){color:#fff0db!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-no{color:#ffe0a1!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-total{color:#fff0cc!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history{background:#30261e!important;border-top-color:#785a37!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-toggle{background:#392d22!important;color:#f4e3ca!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-toggle:hover{background:#483626!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row{background:#35291f!important;border-top-color:#6e5436!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row:hover{background:#433323!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row small{color:#e4cfb0!important}
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