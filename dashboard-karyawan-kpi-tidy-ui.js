/* Employee-only presentation adapter. Service formatting only; final fines and daily payable are self-read consumers. */
(() => {
  'use strict';
  const service = document.getElementById('todayService');
  if (!service) return;
  const titleCase = value => String(value || '').toLocaleLowerCase('id-ID').replace(/(^|[\s/(-])([^\s/(-])/g, (_all, prefix, letter) => prefix + letter.toLocaleUpperCase('id-ID'));
  const tidyServices = () => {
    for (const item of service.querySelectorAll('.service-detail-item:not([data-vax-tidy])')) {
      const raw = item.textContent.trim();
      const match = raw.match(/^(.*?)\s*[×x]\s*(\d+)\s*$/i);
      if (!match) { item.dataset.vaxTidy = '1'; continue; }
      const name = document.createElement('span');
      name.className = 'service-name';
      name.textContent = titleCase(match[1]);
      const dots = document.createElement('span');
      dots.className = 'service-dots';
      dots.setAttribute('aria-hidden', 'true');
      const quantity = document.createElement('span');
      quantity.className = 'service-qty';
      quantity.textContent = `${match[2]} svc`;
      item.dataset.vaxTidy = '1';
      item.replaceChildren(name, dots, quantity);
      item.setAttribute('aria-label', `${name.textContent}, ${match[2]} service`);
    }
  };
  new MutationObserver(tidyServices).observe(service, { childList: true });
  tidyServices();
})();

/* Reuse Owner's existing freshness evaluator on the token-checked read-only snapshot. */
(() => {
  'use strict';
  const provider = document.getElementById('employeeProviderStatus');
  const last = document.getElementById('employeeProviderLastSync');
  if (!provider || !last) return;
  const unavailable = () => { provider.textContent = 'Status belum tersedia'; last.textContent = '—'; };
  const fmtWib = iso => {
    if (!iso || !Number.isFinite(Date.parse(iso))) return '—';
    return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) + ' WIB';
  };
  const ensureOwnerEvaluator = () => new Promise((resolve, reject) => {
    if (window.ErpFreshness?.evaluate) { resolve(window.ErpFreshness); return; }
    const script = document.createElement('script');
    script.src = 'ERP.NEW/js/modules/erp-freshness.js?v=20260922-1';
    script.onload = () => window.ErpFreshness?.evaluate ? resolve(window.ErpFreshness) : reject(new Error('FRESHNESS_EVALUATOR_UNAVAILABLE'));
    script.onerror = () => reject(new Error('FRESHNESS_SCRIPT_UNAVAILABLE'));
    document.head.appendChild(script);
  });
  let busy = false;
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken() : '';
      if (!token || typeof db === 'undefined') { unavailable(); return; }
      const { data, error } = await db.rpc('karyawan_sync_metadata_self', { p_token: token });
      if (error || !data || data.ok !== true) throw error || new Error('SYNC_METADATA_UNAVAILABLE');
      const engine = await ensureOwnerEvaluator();
      const result = engine.evaluate(data);
      provider.textContent = result.provider?.label || 'Status belum tersedia';
      last.textContent = fmtWib(result.lastSyncIso);
    } catch (error) {
      unavailable();
      console.warn('Employee read-only sync status:', error);
    } finally { busy = false; }
  }
  void refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => { void refresh(); }, 60000);
})();

/* Load isolated employee-only monthly target presentation. */
(() => {
  'use strict';
  if (document.querySelector('script[data-vax-employee-monthly-kpi]')) return;
  const script = document.createElement('script');
  script.src = 'dashboard-karyawan-kpi-bulanan-ui.js?v=20260922-1';
  script.dataset.vaxEmployeeMonthlyKpi = '1';
  document.head.appendChild(script);
})();

/* Present existing service rows in adaptive columns, without touching the renderer. */
(() => {
  'use strict';
  if (document.querySelector('script[data-vax-employee-service-modal]')) return;
  const script = document.createElement('script');
  script.src = 'dashboard-karyawan-service-detail-ui.js?v=20260922-1';
  script.dataset.vaxEmployeeServiceModal = '1';
  document.head.appendChild(script);
})();

/* Read the finalized Absensi fine for the selected capster/date only. */
(() => {
  'use strict';
  if (document.querySelector('script[data-vax-employee-final-fine]')) return;
  const script = document.createElement('script');
  script.src = 'dashboard-karyawan-denda-final-ui.js?v=20260922-1';
  script.dataset.vaxEmployeeFinalFine = '1';
  document.head.appendChild(script);
})();

/* Read the same date's daily Payroll entitlement with employee-session scope. */
(() => {
  'use strict';
  if (document.querySelector('script[data-vax-employee-daily-hak]')) return;
  const script = document.createElement('script');
  script.src = 'dashboard-karyawan-hak-harian-ui.js?v=20260922-hak2';
  script.dataset.vaxEmployeeDailyHak = '1';
  document.head.appendChild(script);
})();
