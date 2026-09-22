/* Employee dashboard UI only: attendance lives in the Absensi tab, and late-arrival
   requests remain available through the existing Izin / Libur / Sakit form.
   Do not alter attendance, GPS, approval, or finance engines. */
(() => {
  'use strict';
  function mount() {
    document.getElementById('vaxLateNoticeEntry')?.remove();
    document.getElementById('btnAbsen')?.remove();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
