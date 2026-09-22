/* UI ONLY: riwayat keputusan SVP tertutup awal, terbuka bila diklik. */
(function(){
  'use strict';
  // Owner uses the dedicated read-only SPV history. Keep the legacy queue DOM
  // intact for its existing engine and for SPV; hide only its Owner presentation.
  const style=document.createElement('style');
  style.id='vax-owner-hide-legacy-izin-review';
  style.textContent=`
    #izinSpvEmbed.is-owner > .izin-spv-head,
    #izinSpvEmbed.is-owner > .izin-spv-summary,
    #izinSpvEmbed.is-owner > .izin-spv-toolbar,
    #izinSpvEmbed.is-owner > #izinSpvLoading,
    #izinSpvEmbed.is-owner > #izinSpvEmpty,
    #izinSpvEmbed.is-owner > #izinSpvList { display:none!important; }
    #izinSpvEmbed.is-owner {
      padding:0!important;
      border:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
  `;
  document.head.appendChild(style);
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
