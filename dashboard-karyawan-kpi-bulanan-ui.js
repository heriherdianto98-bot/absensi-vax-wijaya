/* VAX WIJAYA — Monthly employee KPI, read-only presentation.
   Only the logged-in capster's canonical daily self-RPC is queried. No Owner
   engine, sync, database, payroll logic or other employees' data is changed. */
(() => {
  'use strict';
  const dailyGrid = document.getElementById('kpiCapster');
  const picker = document.getElementById('employeeDatePicker');
  if (!dailyGrid || !picker) return;

  const css = document.createElement('style');
  css.id = 'vax-employee-monthly-kpi-css';
  css.textContent = `
    .employee-monthly-kpi{margin:17px 0 4px;color:#f3efe6;min-width:0}
    .employee-monthly-kpi[hidden]{display:none!important}
    .employee-monthly-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px}
    .employee-monthly-head h2{margin:0;font-size:17px;line-height:1.3;font-weight:800}
    .employee-monthly-head small{font-size:10px;color:#d6be88;text-align:right}
    .employee-monthly-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    .employee-monthly-card{position:relative;overflow:hidden;min-height:96px;padding:12px 10px;border:1px solid #494235;border-radius:14px;background:linear-gradient(140deg,#2b2c29,#151716 82%);box-shadow:inset 0 1px 0 #ffffff12,0 5px 14px #00000024;min-width:0}
    .employee-monthly-card:nth-child(2){background:linear-gradient(140deg,#292722,#151716 82%)}
    .employee-monthly-card:nth-child(3){grid-column:1/-1;min-height:85px;background:linear-gradient(130deg,#30291f,#161716 82%)}
    .employee-monthly-label{display:flex;align-items:center;gap:7px;font-size:11px;color:#e9e5db;font-weight:650}
    .employee-monthly-label i{display:grid;place-items:center;width:27px;height:27px;flex:0 0 27px;border-radius:50%;color:#edcc83;background:linear-gradient(145deg,#534934,#22231f);box-shadow:inset 0 1px 0 #ffffff30}
    .employee-monthly-value{display:block;margin:13px 0 0;font-size:21px;line-height:1.2;font-weight:850;text-align:center;color:#fff4da;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .employee-monthly-card:nth-child(3) .employee-monthly-value{color:#f3d18a}
    .employee-monthly-note{margin:8px 1px 0;font-size:10px;line-height:1.45;color:#bcb3a0}
    @media(max-width:345px){.employee-monthly-card{padding:10px 8px}.employee-monthly-label{font-size:10px}.employee-monthly-value{font-size:19px}}
  `;
  document.head.appendChild(css);

  const section = document.createElement('section');
  section.className = 'employee-monthly-kpi';
  section.hidden = true;
  section.setAttribute('aria-label', 'KPI bulanan pribadi dari ERP');
  section.innerHTML = `
    <div class="employee-monthly-head"><h2>KPI Bulanan Saya</h2><small id="employeeMonthlyPeriod">—</small></div>
    <div class="employee-monthly-grid">
      <article class="employee-monthly-card"><span class="employee-monthly-label"><i class="fa-solid fa-users" aria-hidden="true"></i>Customer Bulan Ini</span><strong class="employee-monthly-value" id="employeeMonthlyCustomer">—</strong></article>
      <article class="employee-monthly-card"><span class="employee-monthly-label"><i class="fa-solid fa-chart-column" aria-hidden="true"></i>Service Bulan Ini</span><strong class="employee-monthly-value" id="employeeMonthlyService">—</strong></article>
      <article class="employee-monthly-card"><span class="employee-monthly-label"><i class="fa-solid fa-coins" aria-hidden="true"></i>Share Bruto Bulan Ini</span><strong class="employee-monthly-value" id="employeeMonthlyShare">—</strong></article>
    </div>
    <p class="employee-monthly-note" id="employeeMonthlyNote" role="status" aria-live="polite">Menunggu data ERP…</p>`;
  dailyGrid.closest('.today-section')?.insertAdjacentElement('afterend', section);
  if (!section.isConnected) return;

  const customerEl = section.querySelector('#employeeMonthlyCustomer');
  const serviceEl = section.querySelector('#employeeMonthlyService');
  const shareEl = section.querySelector('#employeeMonthlyShare');
  const periodEl = section.querySelector('#employeeMonthlyPeriod');
  const note = section.querySelector('#employeeMonthlyNote');
  const rupiah = n => 'Rp' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const isCapster = () => document.documentElement.dataset.homeKpi === 'capster';
  const cache = new Map();
  let sequence = 0;
  let lastKey = '';
  let visible = false;

  function clear(message) {
    customerEl.textContent = '—'; serviceEl.textContent = '—'; shareEl.textContent = '—';
    note.textContent = message;
  }
  function jakartaToday() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const val = k => parts.find(p => p.type === k)?.value || '';
    return `${val('year')}-${val('month')}-${val('day')}`;
  }
  function datesInPeriod(iso) {
    const out = [];
    const limit = Math.min(iso, jakartaToday());
    const [y, m] = limit.split('-').map(Number);
    const dayCount = Number(limit.slice(8));
    for (let d = 1; d <= dayCount; d++) out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return out;
  }
  async function readDay(token, iso) {
    const key = token + ':' + iso;
    if (cache.has(key)) return cache.get(key);
    const pending = (async () => {
      const { data, error } = await db.rpc('karyawan_kpi_harian_self', { p_token: token, p_date: iso });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row || row.ok !== true) throw error || new Error(row?.reason || 'KPI_UNAVAILABLE');
      const vals = ['customer', 'service', 'share_bruto'].map(name => row[name] == null ? NaN : Number(row[name]));
      if (vals.some(value => !Number.isFinite(value) || value < 0)) throw new Error('KPI_INCOMPLETE');
      return vals;
    })();
    cache.set(key, pending);
    try { return await pending; } catch (error) { cache.delete(key); throw error; }
  }
  async function load(force = false) {
    const seq = ++sequence;
    if (!isCapster()) { section.hidden = true; return; }
    section.hidden = false;
    if (!visible) return;
    const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken() : '';
    const iso = picker.value;
    if (!token || typeof db === 'undefined' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      clear('Sesi atau tanggal tidak tersedia.'); return;
    }
    const days = datesInPeriod(iso);
    const key = token + ':' + iso;
    if (!force && lastKey === key) return;
    lastKey = key;
    const date = new Date(iso + 'T12:00:00Z');
    periodEl.textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
    clear('Memuat KPI bulan berjalan dari ERP…');
    let next = 0;
    let failed = false;
    const results = new Array(days.length);
    async function worker() {
      while (next < days.length && !failed && seq === sequence) {
        const i = next++;
        try { results[i] = await readDay(token, days[i]); }
        catch (error) { failed = true; console.warn('KPI bulanan pribadi gagal dibaca:', error); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, days.length) }, worker));
    if (seq !== sequence) return;
    if (failed || results.some(row => !row)) {
      lastKey = '';
      clear('Data ERP tidak lengkap atau tidak dapat dibaca. Tidak menampilkan angka perkiraan.');
      return;
    }
    const totals = results.reduce((acc, row) => row.map((value, i) => acc[i] + value), [0, 0, 0]);
    customerEl.textContent = totals[0].toLocaleString('id-ID');
    serviceEl.textContent = totals[1].toLocaleString('id-ID');
    shareEl.textContent = rupiah(totals[2]);
    note.textContent = `Data pribadi 1–${Number(iso.slice(8))} ${periodEl.textContent} · rekap nilai harian ERP, bukan kalkulasi transaksi atau gaji.`;
  }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { visible = true; void load(); }
  }, { rootMargin: '250px 0px' });
  observer.observe(section);
  picker.addEventListener('change', () => { lastKey = ''; void load(); });
  new MutationObserver(() => { if (isCapster()) { section.hidden = false; void load(); } else { ++sequence; section.hidden = true; } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-home-kpi'] });
  if (isCapster()) { section.hidden = false; void load(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) void load(true); });
})();
