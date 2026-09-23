/* Employee Dashboard UI entry: keep existing attendance, notification and inbox engines untouched. */
(() => {
  'use strict';
  function loadOnce(src,marker){
    if(document.querySelector(`script[data-vax-ui="${marker}"]`)) return;
    const script=document.createElement('script');
    script.src=src;
    script.dataset.vaxUi=marker;
    document.head.appendChild(script);
  }
  function mount(){
    document.getElementById('vaxLateNoticeEntry')?.remove();
    document.getElementById('btnAbsen')?.remove();
    loadOnce('dashboard-karyawan-notifikasi-ui.js?v=20260923-1','notification');
    loadOnce('dashboard-karyawan-inbox-ui.js?v=20260923-1','inbox');
    loadOnce('dashboard-karyawan-sp-banner-ui.js?v=20260923-1','sp-banner');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
