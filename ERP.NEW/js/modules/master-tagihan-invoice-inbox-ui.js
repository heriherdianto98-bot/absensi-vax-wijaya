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
      #mtInvoiceList .mt-inbox-active{padding:12px;border-bottom:1px solid #424952}
      #mtInvoiceList .mt-inbox-active > strong{display:block;margin:0 0 8px;color:#f5f7fb;font-size:12px;letter-spacing:.06em}
      #mtInvoiceList .mt-inbox-active .mt-invoice-row{margin:6px 0}
      #mtInvoiceList .mt-inbox-drafts{border-top:1px solid #59616c;background:#20252c;border-radius:9px;overflow:hidden;margin:5px 12px}
      #mtInvoiceList .mt-inbox-drafts summary{cursor:pointer;list-style:none;padding:14px 18px;color:#f5f7fb;font-size:14px;font-weight:900;display:flex;justify-content:space-between;background:#303741;border:1px solid #626c78;border-radius:9px}
      #mtInvoiceList .mt-inbox-drafts summary:hover{background:#3b444f;border-color:#9ba5b2}
      #mtInvoiceList .mt-inbox-drafts summary:focus-visible{outline:2px solid #f4f6f9;outline-offset:-3px}
      #mtInvoiceList .mt-inbox-drafts summary::-webkit-details-marker{display:none}
      #mtInvoiceList .mt-inbox-drafts summary::after{content:'⌄';color:#f5f7fb;font-size:17px}
      #mtInvoiceList .mt-inbox-drafts[open] summary::after{content:'⌃'}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-active{padding:10px 12px 12px;background:#20252c}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-row{margin-top:5px;background:#2b323b;border:1px solid #606b78;border-radius:10px}
      #mtInvoiceList .mt-inbox-drafts .mt-invoice-empty{color:#ecf1f6;background:#2b323b;border-radius:9px;font-size:13px}
      #mtInvoiceList .mt-inbox-empty{padding:12px 16px;color:#c8d0d9;font-size:12px}
      #mtInvoiceList .mt-inbox-active .mt-invoice-status.sent{background:#173548;color:#84d8ff}

      /* Monochrome invoice panel only. Higher specificity overrides earlier draft UI.
         Do not change status badge semantics, action buttons, history data or PDF. */
      .page-master-tagihan #mtInvoiceCard{background:#171a1f!important;border-color:#414953!important;box-shadow:0 12px 28px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.04)!important}
      .page-master-tagihan #mtInvoiceCard::before,.page-master-tagihan #mtInvoiceCard::after{opacity:0!important;animation:none!important}
      .page-master-tagihan #mtInvoiceCard:hover{border-color:#818b98!important;box-shadow:0 16px 32px rgba(0,0,0,.30),0 0 0 1px rgba(218,225,232,.07)!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head{background:#222831!important;border-bottom-color:#454e59!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head strong{color:#f5f7fb!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head small{color:#c2cad4!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList{background:#1d2229!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-active{background:#252b33!important;border-bottom-color:#414953!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-active > strong{color:#f5f7fb!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-empty{color:#cbd3dc!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts{background:#252b33!important;border-color:#68727f!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary{background:#343c47!important;color:#f5f7fb!important;border-color:#68727f!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary:hover{background:#434c58!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary::after{color:#f5f7fb!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-active{background:#252b33!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-empty{background:#303741!important;border-color:#697582!important;color:#f5f7fb!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row small,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row>div:nth-child(2){color:#e4eaf0!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-no{color:#f5f7fb!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-total{color:#f5f7fb!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history{background:#1d2229!important;border-top-color:#424b56!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-toggle{background:#252c34!important;color:#f5f7fb!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-toggle:hover{background:#333c46!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row{background:#252b33!important;border-top-color:#424b56!important;border-left-color:#667381!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row:hover{background:#333b45!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row small{color:#c6cfd9!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row .mt-invoice-no,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row .mt-invoice-total{color:#f5f7fb!important}
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