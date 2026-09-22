/* Employee dashboard UI only: attendance lives in the Absensi tab, and late-arrival
   requests remain available through the existing Izin / Libur / Sakit form.
   Keep the approved dashboard engine untouched. */
(() => {
  'use strict';
  function loadInbox(){
    if(document.querySelector('script[data-vax-employee-inbox]'))return;
    const inbox=document.createElement('script');
    inbox.src='dashboard-karyawan-inbox-ui.js?v=20260923-1';
    inbox.dataset.vaxEmployeeInbox='1';
    document.head.appendChild(inbox);
  }
  function mount() {
    document.getElementById('vaxLateNoticeEntry')?.remove();
    document.getElementById('btnAbsen')?.remove();
    if (document.querySelector('script[data-vax-employee-notif]')) {loadInbox();return;}
    const script=document.createElement('script');
    script.src='dashboard-karyawan-notifikasi-ui.js?v=20260923-1';
    script.dataset.vaxEmployeeNotif='1';
    script.onload=loadInbox;
    script.onerror=loadInbox;
    document.head.appendChild(script);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
