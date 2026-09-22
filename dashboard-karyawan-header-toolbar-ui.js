/* Header & toolbar presentation layer. Does not change dashboard KPI/attendance queries. */
(function () {
  'use strict';
  const root = document.querySelector('.app');
  const topbar = root?.querySelector('.topbar');
  const profile = root?.querySelector('.profile-card:not(.tutup-ops-banner)');
  if (!root || !topbar || !profile) return;
  const brand = topbar.querySelector('.topbar-brand');
  if (brand && !brand.querySelector('.brand-subtitle')) {
    const subtitle = document.createElement('span');
    subtitle.className = 'brand-subtitle';
    subtitle.textContent = 'ENTERPRISE MANAGEMENT SYSTEM';
    brand.appendChild(subtitle);
  }
  const meta = topbar.querySelector('.topbar-meta');
  if (meta) { const online = meta.querySelector('b'); if (online) online.textContent = 'ONLINE'; }
  const dateMeta = document.createElement('div');
  dateMeta.className = 'profile-meta-date';
  dateMeta.setAttribute('aria-label', 'Tanggal hari ini');
  profile.appendChild(dateMeta);
  const branch = document.createElement('div');
  branch.className = 'profile-branch';
  const pin = document.createElement('i');
  pin.className = 'fa-solid fa-location-dot';
  pin.setAttribute('aria-hidden', 'true');
  const detail = document.createElement('div');
  const branchName = document.createElement('span');
  branchName.className = 'profile-branch-name';
  branchName.textContent = 'Memuat cabang…';
  const address = document.createElement('span');
  address.className = 'profile-branch-address';
  address.textContent = 'Memuat alamat Master Cabang…';
  detail.append(branchName, address);
  branch.append(pin, detail);
  profile.appendChild(branch);
  // Existing dashboard remains the authority for name, photo and branch name.
  const existingName = document.getElementById('cabangKaryawan');
  if (existingName) {
    const sync = () => { branchName.textContent = existingName.textContent.trim() || 'Cabang belum tersedia'; };
    sync();
    new MutationObserver(sync).observe(existingName, { childList: true, subtree: true, characterData: true });
  }
  const nowWib = () => new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Jakarta'}));
  const isoWib = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const readable = (date) => new Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
  const now = nowWib();
  dateMeta.innerHTML = `<small>${new Intl.DateTimeFormat('id-ID',{weekday:'long'}).format(now)}</small><strong>${now.getDate()}</strong><span>${new Intl.DateTimeFormat('id-ID',{month:'short',year:'numeric'}).format(now)}</span>`;
  const toolbar = document.createElement('section');
  toolbar.className = 'employee-date-toolbar';
  toolbar.setAttribute('aria-label', 'Toolbar tanggal Dashboard');
  const caption = document.createElement('div');
  caption.className = 'date-toolbar-info';
  const sub = document.createElement('span'); sub.className = 'date-toolbar-caption'; sub.textContent = 'Periode Dashboard';
  const current = document.createElement('span'); current.className = 'date-toolbar-current'; current.textContent = readable(new Date());
  caption.append(sub, current);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'date-toolbar-button'; button.setAttribute('aria-expanded','false'); button.innerHTML = '<i class="fa-regular fa-calendar-days" aria-hidden="true"></i> Pilih tanggal';
  toolbar.append(caption, button);
  const popover = document.createElement('div'); popover.className='date-toolbar-popover'; popover.hidden=true;
  const label = document.createElement('label'); label.textContent='Tanggal yang ingin dilihat'; label.htmlFor='employeeDatePicker';
  const input = document.createElement('input'); input.type='date'; input.id='employeeDatePicker'; input.max=isoWib(); input.value=isoWib();
  const actions = document.createElement('div'); actions.className='date-toolbar-actions';
  const today = document.createElement('button'); today.type='button'; today.className='date-toolbar-close'; today.textContent='Hari ini';
  const close = document.createElement('button'); close.type='button'; close.className='date-toolbar-close'; close.textContent='Tutup';
  actions.append(today,close);
  const help = document.createElement('p'); help.className='date-toolbar-help'; help.textContent='Filter data tanggal khusus belum aktif. KPI yang tampil tetap data hari ini hingga sumber data historis disambungkan.';
  popover.append(label,input,actions,help);
  profile.insertAdjacentElement('afterend',popover);
  profile.insertAdjacentElement('afterend',toolbar);
  button.addEventListener('click',()=>{popover.hidden=!popover.hidden;button.setAttribute('aria-expanded',String(!popover.hidden));});
  close.addEventListener('click',()=>{popover.hidden=true;button.setAttribute('aria-expanded','false');});
  today.addEventListener('click',()=>{input.value=isoWib();current.textContent=readable(new Date());popover.hidden=true;button.setAttribute('aria-expanded','false');});
  input.addEventListener('change',()=>{if(input.value && input.value <= isoWib()) {current.textContent=`Tanggal dipilih: ${input.value} · KPI tetap hari ini`;}});
  // Read-only branch detail, scoped to the branch already assigned in canonical employee session.
  async function loadMasterAddress() {
    try {
      if (typeof db === 'undefined' || typeof KaryawanSession === 'undefined') return;
      const user = await KaryawanSession.requirePage();
      if (!user?.cabang_id) {address.textContent='Alamat cabang belum tersedia';return;}
      const {data,error} = await db.from('cabang').select('nama_cabang,alamat').eq('id',user.cabang_id).maybeSingle();
      if(error || !data){address.textContent='Alamat belum dapat dimuat dari Master Cabang';return;}
      if(data.nama_cabang) branchName.textContent=data.nama_cabang;
      address.textContent=String(data.alamat||'').trim() || 'Alamat belum diisi di Master Cabang';
    } catch (_error) {address.textContent='Alamat belum dapat dimuat dari Master Cabang';}
  }
  loadMasterAddress();
})();
