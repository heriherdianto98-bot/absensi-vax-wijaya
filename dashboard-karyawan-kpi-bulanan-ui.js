/* Employee-only monthly KPI presentation. The existing employee self-read ERP RPC
   supplies final daily totals; this module only groups those values by month.
   No Owner engine, payroll, sync, scheduler, database or permissions are changed. */
(() => {
  'use strict';
  const grid = document.getElementById('kpiCapster');
  const picker = document.getElementById('employeeDatePicker');
  const daily = grid?.closest('.today-section');
  if (!daily || !picker) return;
  const style = document.createElement('style');
  style.textContent = `
    .employee-monthly-kpi{margin:17px 0 4px;color:#f3efe6;min-width:0}
    .employee-monthly-kpi[hidden]{display:none!important}
    .employee-monthly-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
    .employee-monthly-head h2{margin:0;font-size:17px;line-height:1.3;font-weight:800}
    .employee-monthly-head small{font-size:10px;color:#d6be88;text-align:right}
    .employee-monthly-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    .employee-monthly-card{min-width:0;min-height:97px;padding:12px 10px;border:1px solid #494235;border-radius:14px;background:linear-gradient(140deg,#2b2c29,#151716 82%);box-shadow:inset 0 1px 0 #ffffff12,0 5px 14px #00000024}
    .employee-monthly-card:nth-child(2){background:linear-gradient(140deg,#292722,#151716 82%)}
    .employee-monthly-card:nth-child(3){grid-column:1/-1;min-height:86px;background:linear-gradient(130deg,#30291f,#161716 82%)}
    .employee-monthly-label{display:flex;align-items:center;gap:7px;font-size:11px;color:#e9e5db;font-weight:650}
    .employee-monthly-label i{display:grid;place-items:center;width:27px;height:27px;flex:0 0 27px;border-radius:50%;color:#edcc83;background:linear-gradient(145deg,#534934,#22231f);box-shadow:inset 0 1px 0 #ffffff30}
    .employee-monthly-value{display:block;margin:13px 0 0;font-size:20px;line-height:1.2;font-weight:850;text-align:center;color:#fff4da;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .employee-monthly-card:nth-child(3) .employee-monthly-value{color:#f3d18a}
    .employee-monthly-note{margin:8px 1px 0;font-size:10px;line-height:1.45;color:#bcb3a0}
    @media(max-width:345px){.employee-monthly-card{padding:10px 8px}.employee-monthly-label{font-size:10px}.employee-monthly-value{font-size:18px}}
  `;
  document.head.appendChild(style);
  const section = document.createElement('section');
  section.className = 'employee-monthly-kpi';
  section.hidden = true;
  section.setAttribute('aria-label', 'KPI bulanan pribadi dari ERP');
  section.innerHTML = `
    <div class="employee-monthly-head"><h2>KPI Bulanan Saya</h2><small id="employeeMonthlyPeriod">—</small></div>
    <div class="employee-monthly-grid">
      <article class="employee-monthly-card"><span class="employee-monthly-label"><i class="fa-solid fa-users" aria-hidden="true"></i>Customer Bulan Ini</span><strong class="employee-monthly-value" id="employeeMonthlyCustomer">—</strong></article>
      <article class="employee-monthly-card"><span class="employee-monthly-label"><i class="fa-solid fa-receipt" aria-hidden="true"></i>Income Service</span><strong class="employee-monthly-value" id="employeeMonthlyIncome">—</strong></article>
      <article class="employee-monthly-card"><span class="employee-monthly-label"><i class="fa-solid fa-coins" aria-hidden="true"></i>Share Bruto Bulan Ini</span><strong class="employee-monthly-value" id="employeeMonthlyShare">—</strong></article>
    </div>
    <p class="employee-monthly-note" id="employeeMonthlyNote" role="status" aria-live="polite">Menunggu data ERP…</p>`;
  daily.insertAdjacentElement('afterend', section);
  const customerEl = section.querySelector('#employeeMonthlyCustomer');
  const incomeEl = section.querySelector('#employeeMonthlyIncome');
  const shareEl = section.querySelector('#employeeMonthlyShare');
  const periodEl = section.querySelector('#employeeMonthlyPeriod');
  const note = section.querySelector('#employeeMonthlyNote');
  const rupiah = n => 'Rp' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const isCapster = () => document.documentElement.dataset.homeKpi === 'capster';
  const cache = new Map();
  let seq = 0;
  let lastKey = '';
  let inView = false;
  function clear(message) {
    customerEl.textContent = '—'; incomeEl.textContent = '—'; shareEl.textContent = '—';
    note.textContent = message;
  }
  function jakartaToday() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const val = k => parts.find(p => p.type === k)?.value || '';
    return `${val('year')}-${val('month')}-${val('day')}`;
  }
  function monthDates(selected) {
    const end = selected < jakartaToday() ? selected : jakartaToday();
    const [year, month] = end.split('-');
    return Array.from({ length: Number(end.slice(8)) }, (_, i) => `${year}-${month}-${String(i + 1).padStart(2, '0')}`);
  }
  async function readDay(token, date) {
    const key = token + ':' + date;
    if (cache.has(key)) return cache.get(key);
    const pending = (async () => {
      const { data, error } = await db.rpc('karyawan_kpi_harian_self', { p_token: token, p_date: date });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row || row.ok !== true) throw error || new Error(row?.reason || 'KPI_UNAVAILABLE');
      // The canonical "service" field is TOTAL INCOME (rupiah), not a service count.
      const values = [row.customer, row.service, row.share_bruto].map(n => n == null ? NaN : Number(n));
      if (values.some(n => !Number.isFinite(n) || n < 0)) throw new Error('KPI_INCOMPLETE');
      return values;
    })();
    cache.set(key, pending);
    try { return await pending; } catch (error) { cache.delete(key); throw error; }
  }
  async function load(force = false) {
    const request = ++seq;
    if (!isCapster()) { section.hidden = true; return; }
    section.hidden = false;
    if (!inView) return;
    const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken() : '';
    const selected = picker.value;
    if (!token || typeof db === 'undefined' || !/^\d{4}-\d{2}-\d{2}$/.test(selected) || selected > jakartaToday()) {
      clear('Sesi atau tanggal tidak tersedia.'); return;
    }
    const key = token + ':' + selected;
    if (!force && lastKey === key) return;
    lastKey = key;
    periodEl.textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(selected + 'T12:00:00Z'));
    clear('Memuat KPI bulanan dari ERP…');
    const days = monthDates(selected);
    const records = new Array(days.length);
    let index = 0;
    let failed = false;
    async function worker() {
      while (index < days.length && !failed && request === seq) {
        const i = index++;
        try { records[i] = await readDay(token, days[i]); }
        catch (error) { failed = true; console.warn('KPI bulanan pribadi gagal dibaca:', error); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, days.length) }, worker));
    if (request !== seq) return;
    if (failed || records.some(row => !row)) {
      lastKey = '';
      clear('Data ERP tidak lengkap atau gagal dibaca. Angka perkiraan tidak ditampilkan.');
      return;
    }
    const totals = records.reduce((sum, row) => sum.map((v, i) => v + row[i]), [0, 0, 0]);
    customerEl.textContent = totals[0].toLocaleString('id-ID');
    incomeEl.textContent = rupiah(totals[1]);
    shareEl.textContent = rupiah(totals[2]);
    note.textContent = `Data pribadi 1–${Number(selected.slice(8))} ${periodEl.textContent} · penjumlahan angka harian ERP, bukan penghitungan ulang transaksi atau gaji.`;
  }
  new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { inView = true; void load(); }
  }, { rootMargin: '250px 0px' }).observe(section);
  picker.addEventListener('change', () => { lastKey = ''; void load(); });
  new MutationObserver(() => {
    if (isCapster()) { section.hidden = false; void load(); }
    else { ++seq; section.hidden = true; }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-home-kpi'] });
  if (isCapster()) { section.hidden = false; void load(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && inView) void load(true); });
})();
