(() => {
'use strict';
async function init(){
  const ok=await OwnerAuth.requireOwnerOnly(); if(!ok)return;
  await Promise.all([loadComponent('sidebar','../components/sidebar.html'),loadComponent('header','../components/header.html')]).catch(()=>{});
  OwnerAuth.bindUi?.();OwnerAuth.syncHeader?.();OwnerAuth.applyAccessControl?.();initErpShellChrome?.();
  document.querySelectorAll('.sidebar .menu-item').forEach(el=>el.classList.remove('active'));
  document.querySelector('.sidebar [data-erp-nav="settings"]')?.classList.add('active');
  const hc=document.getElementById('erpHeaderCabang');if(hc)hc.textContent='Pengaturan ERP';
  const hp=document.getElementById('erpHeaderPeriode');if(hp)hp.textContent='Owner';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();