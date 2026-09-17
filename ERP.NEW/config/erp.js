/* ERP VAX — dashboard-only UI bootstrap; no configuration or engine changes. */
(() => {
  if (!/\/erp-dashboard\.html$/i.test(location.pathname)) return;
  if (document.querySelector('script[data-vax-dashboard-invoice-shortcut]')) return;
  const script = document.createElement('script');
  script.src = '../js/modules/dashboard-invoice-shortcut-ui.js?v=20260917-1';
  script.dataset.vaxDashboardInvoiceShortcut = '1';
  script.async = false;
  document.head.appendChild(script);
})();
