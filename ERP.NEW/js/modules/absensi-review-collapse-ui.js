/* UI ONLY: riwayat keputusan SVP tertutup awal, terbuka bila diklik. */
(function(){
  'use strict';
  function mount(){
    const panel=document.getElementById('ownerSpvReadonlyAudit');
    const head=panel?.querySelector('.owner-spv-audit-head');
    if(!head||head.dataset.vaxCollapseReady)return Boolean(head);
    head.dataset.vaxCollapseReady='1';
    panel.classList.remove('is-open');
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='owner-spv-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls','ownerSpvAuditList');
    toggle.textContent='Tampilkan riwayat ▾';
    const refresh=head.querySelector('#ownerSpvAuditRefresh');
    head.insertBefore(toggle,refresh||null);
    function setOpen(open){
      panel.classList.toggle('is-open',open);
      toggle.setAttribute('aria-expanded',String(open));
      toggle.textContent=open?'Tutup riwayat ▴':'Tampilkan riwayat ▾';
    }
    head.addEventListener('click',function(event){
      if(event.target.closest('#ownerSpvAuditRefresh'))return;
      if(event.target.closest('button') && !event.target.closest('.owner-spv-toggle'))return;
      setOpen(!panel.classList.contains('is-open'));
    });
    return true;
  }
  function boot(){
    if(mount())return;
    let tries=0;
    const timer=setInterval(function(){
      if(mount()||++tries>120)clearInterval(timer);
    },250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  document.addEventListener('erp:finance-ready',mount);
})();
