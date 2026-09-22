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
    /* SPV proof gallery: cover an encoding-damaged glyph with a CSS-drawn X.
       Only presentation changes; the existing close button and handler remain. */
    .izin-spv-gallery .izin-spv-gallery-close {
      display:grid!important;
      place-items:center!important;
      width:44px!important;
      height:44px!important;
      padding:0!important;
      right:12px!important;
      top:17px!important;
      border:1px solid #e5ba46!important;
      border-radius:12px!important;
      background:linear-gradient(145deg,#393327,#111820)!important;
      box-shadow:inset 1px 1px 0 rgba(255,255,255,.22),0 3px 0 #07090c,0 7px 18px rgba(0,0,0,.55)!important;
      color:transparent!important;
      font-size:0!important;
      line-height:0!important;
      cursor:pointer;
      overflow:hidden;
    }
    .izin-spv-gallery .izin-spv-gallery-close::before,
    .izin-spv-gallery .izin-spv-gallery-close::after {
      content:'';
      position:absolute;
      width:21px;
      height:3px;
      left:50%;
      top:50%;
      border-radius:3px;
      background:#ffe29a;
      box-shadow:0 0 6px rgba(249,197,71,.35);
      pointer-events:none;
    }
    .izin-spv-gallery .izin-spv-gallery-close::before { transform:translate(-50%,-50%) rotate(45deg); }
    .izin-spv-gallery .izin-spv-gallery-close::after { transform:translate(-50%,-50%) rotate(-45deg); }
    .izin-spv-gallery .izin-spv-gallery-close:hover,
    .izin-spv-gallery .izin-spv-gallery-close:focus-visible {
      border-color:#ffdf81!important;
      background:linear-gradient(145deg,#56442b,#1d2631)!important;
      outline:2px solid rgba(255,221,118,.65);
      outline-offset:2px;
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
