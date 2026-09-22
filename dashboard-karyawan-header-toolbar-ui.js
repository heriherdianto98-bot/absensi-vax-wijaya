/* Employee dashboard header and date selector. Uses existing self-read RPC; no canonical engine edits. */
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
  const existingName = document.getElementById('cabangKaryawan');
  if (existingName) {
    const sync = () => { branchName.textContent = existingName.textContent.trim() || 'Cabang belum tersedia'; };
    sync();
    new MutationObserver(sync).observe(existingName, { childList: true, subtree: true, characterData: true });
  }
  const isoWib = () => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const formatDate = value => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
  const todayIso = isoWib();
  const now = new Date(`${todayIso}T12:00:00Z`);
  dateMeta.innerHTML = `<small>${new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long' }).format(now)}</small><strong>${Number(todayIso.slice(8))}</strong><span>${new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(now)}</span>`;
  const toolbar = document.createElement('section');
  toolbar.className = 'employee-date-toolbar';
  toolbar.setAttribute('aria-label', 'Periode Dashboard Karyawan');
  const caption = document.createElement('div');
  caption.className = 'date-toolbar-info';
  const sub = document.createElement('span');
  sub.className = 'date-toolbar-caption';
  sub.textContent = 'Periode Dashboard';
  const current = document.createElement('span');
  current.className = 'date-toolbar-current';
  current.textContent = formatDate(todayIso);
  caption.append(sub, current);
  const pickerWrap = document.createElement('div');
  pickerWrap.className = 'date-toolbar-picker';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'date-toolbar-button';
  button.innerHTML = '<i class="fa-regular fa-calendar-days" aria-hidden="true"></i> Pilih tanggal';
  const input = document.createElement('input');
  input.type = 'date';
  input.id = 'employeeDatePicker';
  input.className = 'date-toolbar-native-date';
  input.setAttribute('aria-label', 'Pilih tanggal Dashboard');
  input.max = todayIso;
  input.value = todayIso;
  pickerWrap.append(button, input);
  toolbar.append(caption, pickerWrap);
  profile.insertAdjacentElement('afterend', toolbar);
  const status = document.createElement('span');
  status.className = 'date-toolbar-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  toolbar.insertAdjacentElement('afterend', status);
  let requestId = 0;
  const setText = (id, value) => { const target = document.getElementById(id); if (target) target.textContent = value; };
  const unavailable = () => {
    setText('todayCustomer', '—');
    setText('todayShare', '—');
    setText('todayPayable', '—');
    const services = document.getElementById('todayService');
    if (services) services.textContent = 'Data tidak tersedia';
  };
  function renderSelfKpi(payload) {
    const customer = Number(payload.customer);
    const share = Number(payload.share_bruto);
    if (typeof setCapsterKpiText === 'function') {
      setCapsterKpiText(Number.isFinite(customer) ? String(Math.round(customer)) : '—', Array.isArray(payload.service_detail) ? payload.service_detail : [], Number.isFinite(share) ? 'Rp' + share.toLocaleString('id-ID') : '—', '—');
    } else {
      unavailable();
    }
  }
  async function selectDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > isoWib()) return;
    const id = ++requestId;
    current.textContent = formatDate(value);
    const isToday = value === isoWib();
    button.innerHTML = `<i class="fa-regular fa-calendar-days" aria-hidden="true"></i> ${isToday ? 'Pilih tanggal' : 'Ubah tanggal'}`;
    toolbar.classList.toggle('is-custom-date', !isToday);
    if (isToday) {
      status.textContent = '';
      if (document.documentElement.dataset.homeKpi === 'capster' && typeof loadCapsterKpiHariIni === 'function') await loadCapsterKpiHariIni();
      if (document.documentElement.dataset.homeKpi === 'kasir') {
        if (typeof loadStatusHariIni === 'function') await loadStatusHariIni();
        if (typeof loadRingkasan === 'function') await loadRingkasan();
      }
      return;
    }
    const role = document.documentElement.dataset.homeKpi;
    if (role !== 'capster') {
      status.textContent = 'KPI tanggal khusus untuk jabatan ini belum tersedia.';
      ['statusAbsenKasir', 'totalMasukKasir', 'totalDendaKasir'].forEach(key => setText(key, '—'));
      return;
    }
    const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken() : '';
    if (!token || typeof db === 'undefined') {
      unavailable();
      status.textContent = 'Sesi tidak tersedia. Data tanggal ini tidak dapat dimuat.';
      return;
    }
    setText('todayCustomer', '…');
    setText('todayShare', '…');
    setText('todayPayable', '—');
    const services = document.getElementById('todayService');
    if (services) services.textContent = 'Memuat…';
    status.textContent = 'Memuat KPI tanggal terpilih…';
    try {
      const { data, error } = await db.rpc('karyawan_kpi_harian_self', { p_token: token, p_date: value });
      if (id !== requestId) return;
      const payload = Array.isArray(data) ? data[0] : data;
      if (error || !payload || payload.ok === false) throw error || new Error(payload?.reason || 'DATA_UNAVAILABLE');
      renderSelfKpi(payload);
      status.textContent = `KPI tanggal ${formatDate(value)} · sesuai data ERP.`;
    } catch (error) {
      if (id !== requestId) return;
      unavailable();
      status.textContent = 'KPI tanggal ini belum dapat dimuat. Data hari ini tidak digunakan sebagai pengganti.';
      console.error('KPI tanggal pilihan gagal:', error);
    }
  }
  button.addEventListener('click', () => {
    input.max = isoWib();
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch (_error) { /* browser fallback */ }
    }
    input.focus();
    input.click();
  });
  input.addEventListener('change', () => { if (input.value) void selectDate(input.value); });
  async function loadMasterAddress() {
    try {
      if (typeof db === 'undefined' || typeof KaryawanSession === 'undefined') return;
      const user = await KaryawanSession.requirePage();
      if (!user?.cabang_id) { address.textContent = 'Alamat cabang belum tersedia'; return; }
      const { data, error } = await db.from('cabang').select('nama_cabang,alamat').eq('id', user.cabang_id).maybeSingle();
      if (error || !data) { address.textContent = 'Alamat belum dapat dimuat dari Master Cabang'; return; }
      if (data.nama_cabang) branchName.textContent = data.nama_cabang;
      address.textContent = String(data.alamat || '').trim() || 'Alamat belum diisi di Master Cabang';
    } catch (_error) { address.textContent = 'Alamat belum dapat dimuat dari Master Cabang'; }
  }
  void loadMasterAddress();
})();