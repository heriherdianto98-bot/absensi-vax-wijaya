/* ERP VAX — SVP invoice presentation only. Never mutate invoice records or send/payment workflows. */
"use strict";
(() => {
  /* MasterTagihan is declared with top-level const, not necessarily on window. */
  const masterRole = () => typeof MasterTagihan !== 'undefined'
    ? MasterTagihan?.role : window.MasterTagihan?.role;
  const isSvp = role => ['svp','spv'].includes(String(role || '').toLowerCase());
  const isOwnSvpInvoice = (row, userId) =>
    isSvp(row?.sender_role) && String(row?.created_by || '') === String(userId || '');

  function labels() {
    if (!isSvp(masterRole()) || !isSvp(window.SvPInvoice?.role)) return;
    const head = document.querySelector('#mtInvoiceCard .mt-invoice-head strong');
    if (head) head.textContent = 'INVOICE SVP → OWNER';
    document.querySelectorAll('#mtInvoiceList .mt-internal-active > strong, #mtInvoiceList .mt-inbox-active > strong')
      .forEach(el => { el.textContent = 'INVOICE AKTIF · SVP → OWNER'; });
    const button = document.querySelector('.mt-invoice-top-btn');
    if (button) {
      button.hidden = false;
      button.innerHTML = '<span aria-hidden="true">▤</span> Buat Invoice Owner';
    }
  }

  function install() {
    const invoice = window.SvPInvoice;
    if (!isSvp(masterRole()) || !invoice || !isSvp(invoice.role)
        || !invoice.user?.id || !invoice.__svpOwnerReturnInstalled || !invoice.__readCompleteInstalled) return false;
    if (invoice.__svpOnlyInvoiceUiInstalled) return true;
    invoice.__svpOnlyInvoiceUiInstalled = true;
    const render = invoice.render;
    invoice.render = function (...args) {
      if (!isSvp(this.role)) return render.apply(this, args);
      const originalRows = this.rows;
      this.rows = (Array.isArray(originalRows) ? originalRows : [])
        .filter(row => isOwnSvpInvoice(row, this.user?.id));
      try { return render.apply(this, args); }
      finally { this.rows = originalRows; labels(); }
    };
    invoice.render();
    labels();
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => { if (install() || ++attempts > 180) clearInterval(timer); }, 100);
  window.addEventListener('load', () => setTimeout(install, 500));
})();
