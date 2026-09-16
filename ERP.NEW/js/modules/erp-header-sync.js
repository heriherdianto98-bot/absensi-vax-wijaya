/* ERP VAX — Global header UI bootstrap. UI/read-only only. */
"use strict";
(function(){
  const ensureNotificationModule=()=>{
    if(!window.ERPGlobalNotifications&&!document.querySelector('script[data-erp-global-notif-js]')){
      const s=document.createElement('script');
      s.src='../js/modules/erp-global-notifications.js?v=20260911-2';
      s.async=false;
      s.dataset.erpGlobalNotifJs='1';
      document.head.appendChild(s);
    }
    if(!document.querySelector('script[data-erp-global-notif-stability-js]')){
      const p=document.createElement('script');
      p.src='../js/modules/erp-global-notifications-stability-ui.js?v=20260911-2';
      p.async=false;
      p.dataset.erpGlobalNotifStabilityJs='1';
      document.head.appendChild(p);
    }
  };
  const ensureKasbonListReadFix=()=>{
    const path=String(window.location.pathname||'').toLowerCase();
    if(!path.endsWith('/finance.html'))return;
    if(document.querySelector('script[data-vax-kasbon-list-read-fix]'))return;
    const s=document.createElement('script');
    s.src='../js/modules/kasbon-list-read-fix.js?v=20260915-v1';
    s.async=false;
    s.dataset.vaxKasbonListReadFix='1';
    document.head.appendChild(s);
  };
  const ensureDashboardInvoiceShortcut=()=>{
    if(!/\/erp-dashboard\.html$/i.test(location.pathname))return;
    if(document.querySelector('script[data-vax-dashboard-invoice-shortcut]'))return;
    const s=document.createElement('script');
    s.src='../js/modules/dashboard-invoice-shortcut-ui.js?v=20260917-1';
    s.async=false;
    s.dataset.vaxDashboardInvoiceShortcut='1';
    document.head.appendChild(s);
  };
  const refresh=()=>{
    ensureNotificationModule();
    ensureKasbonListReadFix();
    ensureDashboardInvoiceShortcut();
    setTimeout(()=>window.ERPGlobalNotifications?.refresh?.(),180);
  };
  window.ErpHeaderSync=window.ErpHeaderSync||{};
  window.ErpHeaderSync.refresh=refresh;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureNotificationModule();ensureKasbonListReadFix();ensureDashboardInvoiceShortcut();},{once:true});
  else{ensureNotificationModule();ensureKasbonListReadFix();ensureDashboardInvoiceShortcut();}
})();