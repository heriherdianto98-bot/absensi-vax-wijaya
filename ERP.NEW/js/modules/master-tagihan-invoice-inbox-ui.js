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
      /* Invoice card only: black surfaces, white text, neutral gray borders. */
      .page-master-tagihan #mtInvoiceCard{background:#080808!important;border-color:#383838!important;box-shadow:0 12px 28px rgba(0,0,0,.36),inset 0 1px 0 rgba(255,255,255,.04)!important}
      .page-master-tagihan #mtInvoiceCard::before,.page-master-tagihan #mtInvoiceCard::after{opacity:0!important;animation:none!important}
      .page-master-tagihan #mtInvoiceCard:hover{border-color:#737373!important;box-shadow:0 16px 32px rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.05)!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head{background:#101010!important;border-bottom-color:#393939!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head strong{color:#fff!important}
      .page-master-tagihan #mtInvoiceCard .mt-invoice-head small{color:#c9c9c9!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList{background:#080808!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-active{padding:12px;background:#0d0d0d!important;border-bottom:1px solid #383838!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-active > strong{display:block;margin:0 0 8px;color:#fff!important;font-size:12px;letter-spacing:.06em}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-active .mt-invoice-row{margin:6px 0}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-empty{padding:12px 16px;color:#d4d4d4!important;font-size:12px}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts{margin:5px 12px;border:1px solid #444!important;border-radius:9px!important;background:#111!important;overflow:hidden!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary{cursor:pointer;list-style:none;padding:14px 18px;background:#181818!important;border:0!important;border-radius:9px;color:#fff!important;font-size:14px!important;font-weight:900!important;display:flex;justify-content:space-between}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary:hover{background:#262626!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary:focus-visible{outline:2px solid #fff;outline-offset:-3px}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary::-webkit-details-marker{display:none}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts summary::after{content:'⌄';color:#fff!important;font-size:17px}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts[open] summary::after{content:'⌃'}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-active{padding:10px 12px 12px;background:#111!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row{margin-top:5px;background:#1c1c1c!important;border:1px solid #484848!important;border-radius:10px!important;opacity:1!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-empty{background:#1c1c1c!important;color:#f5f5f5!important;border-radius:9px;font-size:13px}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row small,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-row>div:nth-child(2){color:#dedede!important;font-size:13px!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-no,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-inbox-drafts .mt-invoice-total{color:#fff!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history{background:#080808!important;border-top-color:#393939!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-toggle{background:#141414!important;color:#fff!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-toggle:hover{background:#242424!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row{background:#161616!important;border-top-color:#393939!important;border-left-color:#666!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row:hover{background:#242424!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row small{color:#d3d3d3!important}
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row .mt-invoice-no,
      .page-master-tagihan #mtInvoiceCard #mtInvoiceList .mt-invoice-history-row .mt-invoice-total{color:#fff!important}
      /* Status badges keep their existing semantic colors; no action or workflow overrides. */
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