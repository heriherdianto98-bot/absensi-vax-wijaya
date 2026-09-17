/* ERP VAX — dashboard-only UI bootstrap; no configuration or engine changes. */
(() => {
  if (!/\/erp-dashboard\.html$/i.test(location.pathname)) return;
  const addons = [
    ['dashboard-invoice-shortcut-ui.js?v=20260917-1', 'vaxDashboardInvoiceShortcut'],
    ['dashboard-invoice-draft-notification-ui.js?v=20260917-1', 'vaxDashboardInvoiceDraftNotice']
  ];
  for (const [filename, key] of addons) {
    if (document.querySelector(`script[data-${key.replace(/[A-Z]/g, x => '-' + x.toLowerCase())}]`)) continue;
    const script = document.createElement('script');
    script.src = `../js/modules/${filename}`;
    script.dataset[key] = '1';
    script.async = false;
    document.head.appendChild(script);
  }
})();
