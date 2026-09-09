/* ERP VAX — theme shell bootstrap, UI only */
(function(){
  if(document.querySelector('script[data-erp-header-sync-bootstrap]')) return;
  const s=document.createElement('script');
  s.src='../js/modules/erp-header-sync.js?v=20260909-1';
  s.async=false;
  s.dataset.erpHeaderSyncBootstrap='1';
  document.head.appendChild(s);
})();
