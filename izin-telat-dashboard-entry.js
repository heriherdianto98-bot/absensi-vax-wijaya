/* Employee Dashboard UI entry: keep attendance, notification and inbox engines untouched. */
(() => {
  'use strict';
  function loadInbox(){
    if(document.querySelector('script[data-vax-employee-inbox]'))return;
    const inbox=document.createElement('script');
    inbox.src='dashboard-karyawan-inbox-ui.js?v=20260923-1';
    inbox.dataset.vaxEmployeeInbox='1';
    document.head.appendChild(inbox);
  }
  function mount(){
    document.getElementById('vaxLateNoticeEntry')?.remove();
    document.getElementById('btnAbsen')?.remove();
    /* Content-height page: no full-viewport minimum after the final card.
       Reserve only the fixed bottom navigation height + breathing room, so
       the last card is not covered and the scroll cannot reach empty filler. */
    if(!document.getElementById('vaxEmployeeScrollEndUi')){
      const style=document.createElement('style');
      style.id='vaxEmployeeScrollEndUi';
      style.textContent=`
        html body .app{min-height:0!important;padding-bottom:calc(76px + env(safe-area-inset-bottom, 0px))!important}
        html body .app .dash-body{flex:0 0 auto!important}
      `;
      document.head.appendChild(style);
    }
    if(!document.querySelector('script[data-vax-employee-sp-banner]')){
      const banner=document.createElement('script');
      banner.src='dashboard-karyawan-sp-banner-ui.js?v=20260923-1';
      banner.dataset.vaxEmployeeSpBanner='1';
      document.head.appendChild(banner);
    }
    if(!document.querySelector('script[data-vax-credential-nudge]')){
      const nudge=document.createElement('script');
      nudge.src='employee-credential-nudge-ui.js?v=20261001-1';
      nudge.dataset.vaxCredentialNudge='1';
      document.head.appendChild(nudge);
    }
    if(document.querySelector('script[data-vax-employee-notif]')){loadInbox();return;}
    const script=document.createElement('script');
    script.src='dashboard-karyawan-notifikasi-ui.js?v=20261005-kasbonnotif1';
    script.dataset.vaxEmployeeNotif='1';
    script.onload=loadInbox;
    script.onerror=loadInbox;
    document.head.appendChild(script);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();