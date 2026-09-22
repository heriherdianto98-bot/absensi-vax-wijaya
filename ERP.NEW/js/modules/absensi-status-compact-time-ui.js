/* UI ONLY. Read existing daily attendance cache; never fetch or alter attendance data. */
(()=>{
  'use strict';
  const formatTime = value => {
    const match = String(value || '').match(/(?:^|T|\s)(\d{2}:\d{2})(?::\d{2})?/);
    return match ? `${match[1]} WIB` : '\u2014';
  };
  const mount = () => {
    const tbody = document.getElementById('statusKaryawan');
    if(!tbody || tbody.dataset.compactTimeReady) return Boolean(tbody);
    tbody.dataset.compactTimeReady = '1';
    const decorate = () => {
      const owner = window.AbsensiOwner;
      const attendance = owner?._absensiDay;
      if(!Array.isArray(attendance)) return;
      const times = new Map(attendance.map(a => [String(a.karyawan_id),formatTime(a.jam_masuk)]));
      tbody.querySelectorAll('tr[data-absensi-row-id]').forEach(row => {
        const value = times.get(row.dataset.absensiRowId) || '\u2014';
        let time = row.querySelector(':scope > td.absensi-status-time');
        if(!time){
          time = document.createElement('td');
          time.className = 'absensi-status-time';
          time.setAttribute('aria-label','Jam masuk');
          row.appendChild(time); // Keep status at cells[2] for existing filter and click handlers.
        }
        if(time.textContent !== value) time.textContent = value;
      });
    };
    decorate();
    new MutationObserver(decorate).observe(tbody,{childList:true});
    return true;
  };
  const boot = () => {
    if(mount()) return;
    let tries = 0;
    const timer = setInterval(() => {if(mount() || ++tries >= 120) clearInterval(timer);},250);
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  document.addEventListener('erp:finance-ready',mount);
})();