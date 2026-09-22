/* Employee presentation adapter: read-only consumer of the existing canonical Supabase self-read RPC.
   No employee-side financial calculation, schema changes, or edits to locked ERP engines. */
(() => {
  'use strict';
  const app = document.querySelector('.app');
  const topbar = app?.querySelector('.topbar');
  const profile = app?.querySelector('.profile-card:not(.tutup-ops-banner)');
  if (!app || !topbar || !profile) return;

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
  const branchInfo = document.createElement('div');
  const branchName = document.createElement('span');
  branchName.className = 'profile-branch-name';
  branchName.textContent = 'Memuat cabang…';
  const address = document.createElement('span');
  address.className = 'profile-branch-address';
  address.textContent = 'Memuat alamat Master Cabang…';
  branchInfo.append(branchName, address);
  branch.append(pin, branchInfo);
  profile.appendChild(branch);
  const existingName = document.getElementById('cabangKaryawan');
  if (existingName) {
    const sync = () => { branchName.textContent = existingName.textContent.trim() || 'Cabang belum tersedia'; };
    sync();
    new MutationObserver(sync).observe(existingName, { childList: true, subtree: true, characterData: true });
  }

  const isoWib = () => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const formatDate = value => new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(`${value}T12:00:00Z`));
  const initialDate = isoWib();
  const today = new Date(`${initialDate}T12:00:00Z`);
  dateMeta.innerHTML = `<small>${new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long' }).format(today)}</small><strong>${Number(initialDate.slice(8))}</strong><span>${new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(today)}</span>`;

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
  current.textContent = formatDate(initialDate);
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
  input.max = initialDate;
  input.value = initialDate;
  pickerWrap.append(button, input);
  toolbar.append(caption, pickerWrap);
  profile.insertAdjacentElement('afterend', toolbar);
  const status = document.createElement('span');
  status.className = 'date-toolbar-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  toolbar.insertAdjacentElement('afterend', status);

  const sectionTitle = app.querySelector('.today-title');
  const kpiLabels = [
    [app.querySelector('#kpiCapster .kpi-customer .kpi-label'), 'Customer Hari Ini', 'Customer'],
    [app.querySelector('#kpiCapster .kpi-service .kpi-label'), 'Service Hari Ini', 'Service']
  ];
  const showPeriod = date => {
    const isToday = date === isoWib();
    current.textContent = formatDate(date);
    button.innerHTML = `<i class="fa-regular fa-calendar-days" aria-hidden="true"></i> ${isToday ? 'Pilih tanggal' : 'Ubah tanggal'}`;
    toolbar.classList.toggle('is-custom-date', !isToday);
    if (sectionTitle) sectionTitle.textContent = isToday ? 'Hari Ini' : 'Data ' + formatDate(date);
    kpiLabels.forEach(([el, labelToday, labelHistory]) => { if (el) el.textContent = isToday ? labelToday : labelHistory; });
  };
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const clearKpi = message => {
    setText('todayCustomer', '—');
    setText('todayShare', '—');
    setText('todayPayable', '—');
    const service = document.getElementById('todayService');
    if (service) { service.className = 'service-detail-list'; service.textContent = message; }
  };

  /* The existing owner-side/Supabase RPC returns final values. Do not reconstruct
     customers, service share, fines or take-home pay in this employee page. */
  let activeRequest = 0;
  async function selectDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > isoWib()) return;
    const request = ++activeRequest;
    showPeriod(date);
    const role = document.documentElement.dataset.homeKpi;
    if (role !== 'capster') {
      status.textContent = 'Data historis jabatan ini belum tersedia dari sumber ERP.';
      if (date !== isoWib()) ['statusAbsenKasir', 'totalMasukKasir', 'totalDendaKasir'].forEach(id => setText(id, '—'));
      else {
        status.textContent = '';
        if (typeof loadStatusHariIni === 'function') await loadStatusHariIni();
        if (typeof loadRingkasan === 'function') await loadRingkasan();
      }
      return;
    }
    const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken() : '';
    if (!token || typeof db === 'undefined') {
      clearKpi('Data tidak tersedia');
      status.textContent = 'Sesi karyawan tidak tersedia; data ERP tidak dapat dibaca.';
      return;
    }
    clearKpi('Memuat data ERP…');
    setText('todayCustomer', '…');
    setText('todayShare', '…');
    status.textContent = 'Memuat data ERP tanggal terpilih…';
    try {
      const { data, error } = await db.rpc('karyawan_kpi_harian_self', { p_token: token, p_date: date });
      if (request !== activeRequest) return;
      const payload = Array.isArray(data) ? data[0] : data;
      if (error || !payload || payload.ok === false) throw error || new Error(payload?.reason || 'DATA_UNAVAILABLE');
      /* Formatting only, using the canonical dashboard renderer. */
      if (typeof setCapsterKpiText !== 'function') throw new Error('CANONICAL_RENDERER_UNAVAILABLE');
      const customer = payload.customer == null ? '—' : String(payload.customer);
      const share = payload.share_bruto == null ? '—' : formatRupiahId(payload.share_bruto);
      const detail = Array.isArray(payload.service_detail) ? payload.service_detail : [];
      setCapsterKpiText(customer, detail, share, '—');
      status.textContent = `Data ${formatDate(date)} · dibaca dari ERP.`;
    } catch (error) {
      if (request !== activeRequest) return;
      clearKpi('Data tidak tersedia');
      status.textContent = 'Gagal membaca data ERP; angka hari lain tidak digunakan sebagai pengganti.';
      console.error('Employee read-only KPI failed:', error);
    }
  }
  button.addEventListener('click', () => {
    input.max = isoWib();
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch (_error) { /* fallback below */ }
    }
    input.focus();
    input.click();
  });
  input.addEventListener('change', () => { if (input.value) void selectDate(input.value); });

  async function loadMasterAddress() {
    try {
      if (typeof db === 'undefined' || typeof KaryawanSession === 'undefined') return;
      const employee = await KaryawanSession.requirePage();
      if (!employee?.cabang_id) { address.textContent = 'Alamat cabang belum tersedia'; return; }
      const { data, error } = await db.from('cabang').select('nama_cabang,alamat').eq('id', employee.cabang_id).maybeSingle();
      if (error || !data) { address.textContent = 'Alamat belum dapat dimuat dari Master Cabang'; return; }
      if (data.nama_cabang) branchName.textContent = data.nama_cabang;
      address.textContent = String(data.alamat || '').trim() || 'Alamat belum diisi di Master Cabang';
    } catch (_error) { address.textContent = 'Alamat belum dapat dimuat dari Master Cabang'; }
  }
  void loadMasterAddress();
})();