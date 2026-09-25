/* VAX employee performance visualization. Read-only canonical daily RPC values only.
   Week/month bars are sums of the already-final daily figures, strictly for chart display.
   No owner engine, RPC, schema, employee permissions or payroll calculations changed. */
(() => {
  'use strict';
  const grid = document.getElementById('kpiCapster');
  const anchor = document.querySelector('.comm-row');
  const picker = document.getElementById('employeeDatePicker');
  if (!grid || !anchor || !picker) return;
  const style = document.createElement('style');
  style.textContent = `
    .vax-performance{margin:12px 0 2px;padding:14px 12px 13px;background:linear-gradient(145deg,#252625,#151716 78%);border:1px solid #51452f;border-radius:14px;color:#f5f1e7;min-width:0;box-shadow:inset 0 1px 0 #ffffff0a}
    .vax-performance[hidden]{display:none!important}
    .vax-performance-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
    .vax-performance-head h2{font-size:14px;line-height:1.3;margin:0;font-weight:750}
    .vax-performance-head p{font-size:10px;color:#bcb6a9;margin:3px 0 0}
    .vax-performance-head i{color:#e7c779;font-size:17px}
    .vax-performance-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:4px;border:1px solid #343530;border-radius:10px;background:#111312}
    .vax-performance-controls button{border:0;border-radius:7px;background:transparent;color:#c5c0b7;min-height:32px;font-size:11px;font-weight:650;cursor:pointer}
    .vax-performance-controls button[aria-pressed="true"]{background:linear-gradient(135deg,#e7cb87,#cba454);color:#211b11}
    .vax-performance-metrics{display:flex;gap:7px;margin:11px 0 8px}
    .vax-performance-metrics button{flex:1;min-width:0;border:1px solid #403d34;background:#1b1d1c;border-radius:8px;color:#c5c0b7;padding:8px 5px;font-size:10px;font-weight:650;cursor:pointer}
    .vax-performance-metrics button[aria-pressed="true"]{color:#f2d28b;border-color:#a98a4d;background:#29271f}
    .vax-performance-state{min-height:14px;margin-bottom:5px;font-size:10px;line-height:1.4;color:#bcb6a9}
    .vax-performance-plot{display:flex;align-items:stretch;gap:5px;min-height:150px;padding:7px 3px 0;border-bottom:1px solid #454237}
    .vax-performance-col{display:flex;flex:1;min-width:0;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px}
    .vax-performance-value{font-size:9px;white-space:nowrap;color:#e6d7b6;font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden;text-overflow:ellipsis}
    .vax-performance-bar-wrap{display:flex;align-items:flex-end;justify-content:center;width:100%;height:102px}
    .vax-performance-bar{width:min(100%,25px);min-height:2px;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#f5dda3,#bd9450);box-shadow:inset 0 1px 0 #ffffff55;transition:height .18s ease}
    .vax-performance-label{display:block;width:100%;font-size:9px;color:#c8c3b9;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .vax-performance-note{margin:10px 0 0;font-size:10px;color:#a9a397;line-height:1.4}
    .vax-performance-empty{width:100%;align-self:center;text-align:center;color:#c1b8a6;font-size:11px;line-height:1.5;padding:18px 8px}
    @media(max-width:350px){.vax-performance{padding:12px 9px}.vax-performance-label,.vax-performance-value{font-size:8px}}
    @media(prefers-reduced-motion:reduce){.vax-performance-bar{transition:none}}

    /* UI ONLY — enlarged Performa Saya + green chart icon 2026-09-26 */
    html[data-home-kpi="capster"] body .app .vax-performance{
      padding:17px 15px 15px!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-head{
      margin-bottom:12px!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-head h2{
      font-size:18px!important;
      line-height:1.18!important;
      font-weight:900!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-head p{
      margin-top:4px!important;
      font-size:11px!important;
      line-height:1.3!important;
      font-weight:650!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-head>i{
      width:34px!important;
      height:34px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      border-radius:10px!important;
      font-size:17px!important;
      color:#ffffff!important;
      background:linear-gradient(145deg,#43d5c0,#27bca8)!important;
      border:1px solid rgba(39,188,168,.32)!important;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.42),
        0 5px 13px rgba(39,188,168,.24)!important;
      filter:none!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-controls{
      padding:5px!important;
      gap:6px!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-controls button{
      min-height:36px!important;
      font-size:12px!important;
      font-weight:800!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-metrics{
      margin:12px 0 10px!important;
      gap:8px!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-metrics button{
      min-height:35px!important;
      padding:8px 6px!important;
      font-size:11px!important;
      font-weight:800!important;
    }

    /* UI ONLY — active performance metric uses VAX green theme 2026-09-26 */
    html[data-home-kpi="capster"] body .app .vax-performance-metrics button[aria-pressed="true"]{
      color:#ffffff!important;
      border-color:rgba(39,188,168,.34)!important;
      background:linear-gradient(145deg,#43d5c0,#27bca8)!important;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.35),
        0 4px 10px rgba(39,188,168,.20)!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-state{
      min-height:17px!important;
      margin-bottom:7px!important;
      font-size:11px!important;
      line-height:1.35!important;
      font-weight:650!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-plot{
      min-height:178px!important;
      gap:6px!important;
      padding-top:9px!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-value{
      font-size:11px!important;
      line-height:1!important;
      font-weight:850!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-bar-wrap{
      height:118px!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-label{
      font-size:10px!important;
      line-height:1.15!important;
      font-weight:750!important;
    }
    html[data-home-kpi="capster"] body .app .vax-performance-note{
      margin-top:11px!important;
      font-size:11px!important;
      line-height:1.45!important;
      font-weight:550!important;
    }
  `;
  document.head.appendChild(style);
  const section = document.createElement('section');
  section.className = 'vax-performance';
  section.setAttribute('aria-label', 'Grafik performa karyawan');
  section.hidden = true;
  section.innerHTML = `<div class="vax-performance-head"><div><h2>Performa Saya</h2><p>Customer dan Share Bruto dari ERP</p></div><i class="fa-solid fa-chart-column" aria-hidden="true"></i></div><div class="vax-performance-controls" role="group" aria-label="Periode grafik"><button type="button" data-period="daily" aria-pressed="true">Harian</button><button type="button" data-period="weekly" aria-pressed="false">Mingguan</button><button type="button" data-period="monthly" aria-pressed="false">Bulanan</button></div><div class="vax-performance-metrics" role="group" aria-label="Jenis data"><button type="button" data-metric="customer" aria-pressed="true">Customer</button><button type="button" data-metric="share_bruto" aria-pressed="false">Share Bruto</button></div><div class="vax-performance-state" role="status" aria-live="polite">Menyiapkan data ERP…</div><div class="vax-performance-plot" role="img" aria-label="Grafik performa"></div><p class="vax-performance-note">Grafik hanya menampilkan data akun Anda. Mingguan dan bulanan menjumlahkan nilai harian final dari ERP, bukan menghitung ulang transaksi.</p>`;
  anchor.parentNode.insertBefore(section, anchor);
  const status = section.querySelector('.vax-performance-state');
  const plot = section.querySelector('.vax-performance-plot');
  const cache = new Map();
  const formatDate = date => date.toISOString().slice(0, 10);
  const dateAt = iso => new Date(`${iso}T12:00:00Z`);
  const plusDays = (date, delta) => { const next = new Date(date.getTime()); next.setUTCDate(next.getUTCDate() + delta); return next; };
  const money = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  const shortMoney = n => n >= 1000000 ? (n / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + 'jt' : n >= 1000 ? Math.round(n / 1000).toLocaleString('id-ID') + 'rb' : String(Math.round(n));
  const labelDay = iso => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dateAt(iso));
  const labelMonth = iso => new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(dateAt(iso));
  let period = 'daily';
  let metric = 'customer';
  let currentRun = 0;
  let loaded = null;
  const isVisible = () => document.documentElement.dataset.homeKpi === 'capster';
  function buildBuckets(endIso) {
    const end = dateAt(endIso);
    if (period === 'daily') return Array.from({ length: 7 }, (_, index) => {
      const iso = formatDate(plusDays(end, index - 6));
      return { label: labelDay(iso), days: [iso] };
    });
    if (period === 'weekly') {
      const dayOfWeek = (end.getUTCDay() + 6) % 7;
      const startMonday = plusDays(end, -dayOfWeek - 21);
      return Array.from({ length: 4 }, (_, index) => {
        const monday = plusDays(startMonday, index * 7);
        const days = Array.from({ length: 7 }, (_, d) => formatDate(plusDays(monday, d))).filter(d => d <= endIso);
        return { label: 'M' + (index + 1), days, detail: labelDay(formatDate(monday)) + ' – ' + labelDay(formatDate(plusDays(monday, 6))) };
      });
    }
    return Array.from({ length: 3 }, (_, index) => {
      const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + index - 2, 1, 12));
      const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1, 12));
      const days = [];
      for (let d = first; d < next && formatDate(d) <= endIso; d = plusDays(d, 1)) days.push(formatDate(d));
      return { label: labelMonth(formatDate(first)), days };
    });
  }
  async function daily(iso, token) {
    const key = `${token}:${iso}`;
    if (cache.has(key)) return cache.get(key);
    const request = (async () => {
      const { data, error } = await db.rpc('karyawan_kpi_harian_self', { p_token: token, p_date: iso });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row || row.ok === false) throw error || new Error(row?.reason || 'DATA_UNAVAILABLE');
      const customer = row.customer == null ? NaN : Number(row.customer);
      const share = row.share_bruto == null ? NaN : Number(row.share_bruto);
      if (!Number.isFinite(customer) || !Number.isFinite(share)) throw new Error('INCOMPLETE_CANONICAL_DATA');
      return { customer, share_bruto: share };
    })();
    cache.set(key, request);
    try { return await request; } catch (error) { cache.delete(key); throw error; }
  }
  function render() {
    plot.replaceChildren();
    if (!loaded) return;
    const values = loaded.map(bucket => bucket[metric]);
    const max = Math.max(1, ...values);
    plot.setAttribute('aria-label', `${metric === 'customer' ? 'Customer' : 'Share Bruto'}: ${loaded.map((v, i) => `${v.label} ${metric === 'customer' ? v.customer + ' orang' : money(v.share_bruto)}`).join('; ')}`);
    for (const bucket of loaded) {
      const col = document.createElement('div'); col.className = 'vax-performance-col';
      const value = document.createElement('span'); value.className = 'vax-performance-value'; value.textContent = metric === 'customer' ? String(bucket.customer) : shortMoney(bucket.share_bruto);
      const wrap = document.createElement('div'); wrap.className = 'vax-performance-bar-wrap';
      const bar = document.createElement('span'); bar.className = 'vax-performance-bar'; bar.style.height = Math.max(2, bucket[metric] / max * 100) + '%'; wrap.appendChild(bar);
      const label = document.createElement('span'); label.className = 'vax-performance-label'; label.textContent = bucket.label;
      col.title = `${bucket.detail || bucket.label}: ${bucket.customer} customer; ${money(bucket.share_bruto)}`;
      col.append(value, wrap, label); plot.appendChild(col);
    }
    status.textContent = `${loaded.length} periode · data ERP sampai ${labelDay(picker.value)}`;
  }
  async function load() {
    const run = ++currentRun;
    loaded = null; plot.replaceChildren();
    if (!isVisible()) { section.hidden = true; return; }
    section.hidden = false;
    const token = typeof KaryawanSession !== 'undefined' && KaryawanSession.getToken ? KaryawanSession.getToken() : '';
    const end = picker.value;
    if (!token || typeof db === 'undefined' || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      status.textContent = 'Sesi atau tanggal tidak tersedia.'; plot.textContent = 'Data tidak tersedia'; return;
    }
    const buckets = buildBuckets(end);
    const dates = [...new Set(buckets.flatMap(bucket => bucket.days))];
    status.textContent = `Memuat ${period === 'daily' ? 'harian' : period === 'weekly' ? 'mingguan' : 'bulanan'} dari ERP…`;
    const records = new Map();
    let index = 0, failure = false;
    async function worker() {
      while (index < dates.length && run === currentRun && !failure) {
        const date = dates[index++];
        try { records.set(date, await daily(date, token)); }
        catch (error) { failure = true; console.error('Grafik ERP gagal membaca tanggal ' + date, error); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, dates.length) }, worker));
    if (run !== currentRun) return;
    if (failure || records.size !== dates.length) {
      status.textContent = 'Data grafik belum lengkap atau gagal dibaca dari ERP.';
      plot.innerHTML = '<div class="vax-performance-empty">Grafik tidak tersedia. Tidak ada angka perkiraan yang ditampilkan.</div>';
      return;
    }
    loaded = buckets.map(bucket => ({ label: bucket.label, detail: bucket.detail, customer: bucket.days.reduce((sum, d) => sum + records.get(d).customer, 0), share_bruto: bucket.days.reduce((sum, d) => sum + records.get(d).share_bruto, 0) }));
    render();
  }
  section.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
    period = button.dataset.period;
    section.querySelectorAll('[data-period]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    void load();
  }));
  section.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => {
    metric = button.dataset.metric;
    section.querySelectorAll('[data-metric]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  picker.addEventListener('change', () => { void load(); });
  /* Session/role is assigned asynchronously by the existing dashboard initialization. */
  const observer = new MutationObserver(() => { if (isVisible() && section.hidden) void load(); else if (!isVisible() && !section.hidden) { ++currentRun; section.hidden = true; } });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-home-kpi'] });
  if (isVisible()) void load();
})();