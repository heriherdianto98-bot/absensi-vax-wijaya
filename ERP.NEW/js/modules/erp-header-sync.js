/* ERP VAX — Global header UI bootstrap. UI/read-only only. */
"use strict";
(function(){
  const ensureNotificationModule=()=>{
    if(window.ERPGlobalNotifications) return;
    if(document.querySelector('script[data-erp-global-notif-js]')) return;
    const s=document.createElement('script');
    s.src='../js/modules/erp-global-notifications.js?v=20260909-1';
    s.async=false;
    s.dataset.erpGlobalNotifJs='1';
    document.head.appendChild(s);
  };
  const refresh=()=>{
    ensureNotificationModule();
    setTimeout(()=>window.ERPGlobalNotifications?.refresh?.(),120);
  };
  window.ErpHeaderSync=window.ErpHeaderSync||{};
  window.ErpHeaderSync.refresh=refresh;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureNotificationModule,{once:true});
  else ensureNotificationModule();
})();
