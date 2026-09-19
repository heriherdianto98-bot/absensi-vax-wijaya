/* UI ONLY: label bulanan; tidak mengubah filter, data, atau mesin laporan. */
(function(){
  'use strict';
  function boot(){
    const host=document.getElementById('absensiMonthlyHost');
    if(!host)return;
    function syncTitle(){
      const title=host.querySelector('#ablPage .abl-page-title');
      if(title && title.textContent.trim()!=='RINGKASAN BULAN INI') title.textContent='RINGKASAN BULAN INI';
    }
    syncTitle();
    new MutationObserver(syncTitle).observe(host,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
