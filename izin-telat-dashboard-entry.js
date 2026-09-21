/* Additive employee dashboard entry, no changes to locked dashboard JS engine. */
(() => {
  'use strict';
  function mount() {
    if(document.getElementById('vaxLateNoticeEntry'))return;
    const hero=document.getElementById('btnAbsen');
    if(!hero)return;
    const link=document.createElement('a');
    link.id='vaxLateNoticeEntry';link.href='izin-telat.html';
    link.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;padding:15px 17px;border-radius:13px;border:1px solid #d3a83d;background:#1b2530;color:#f7d477;text-decoration:none;font-size:16px;font-weight:800;box-shadow:0 5px 19px #0005';
    link.innerHTML='<span>🕒 Izin Telat Masuk <small style="display:block;color:#c9d3dc;font-weight:550;font-size:13px;margin-top:3px">Kirim alasan dan foto bukti ke SPV &amp; Owner</small></span><span aria-hidden="true">›</span>';
    hero.insertAdjacentElement('afterend',link);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
