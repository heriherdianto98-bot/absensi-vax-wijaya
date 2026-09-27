/* Gaji Saya — profile date presentation only.
   Mirrors Absensi profile date UI; no payroll/session/business logic changes. */
(() => {
  "use strict";
  const profile=document.querySelector('.app .gaji-profile-card[aria-label="Profil karyawan"]');
  if(!profile || profile.querySelector('.profile-meta-date')) return;

  const isoWib=()=>{
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const part=(type)=>parts.find(item=>item.type===type)?.value||'';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };

  const dateMeta=document.createElement('div');
  dateMeta.className='profile-meta-date';
  dateMeta.setAttribute('aria-label','Tanggal hari ini');

  const render=()=>{
    const iso=isoWib();
    const date=new Date(`${iso}T12:00:00Z`);
    const hari=new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',weekday:'long'}).format(date);
    const bulan=new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',month:'short',year:'numeric'}).format(date);
    dateMeta.innerHTML=`<small>${hari}</small><strong>${Number(iso.slice(8))}</strong><span>${bulan}</span>`;
  };

  const branch=profile.querySelector('.profile-branch');
  if(branch) profile.insertBefore(dateMeta,branch);
  else profile.appendChild(dateMeta);

  render();
  window.setInterval(render,60000);
})();