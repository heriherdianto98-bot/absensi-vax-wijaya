/* Employee Capster: read-only daily entitlement, scoped by employee session and selected date.
   Uses the same daily Payroll inputs as the Owner's Hak Dibayar table; excludes
   unallocated monthly adjustments. Never read owner-wide payroll or write finance. */
(() => {
  'use strict';
  if (window.__vaxEmployeeDailyHak) return;
  window.__vaxEmployeeDailyHak = true;
  const value = document.getElementById('todayPayable');
  const picker = document.getElementById('employeeDatePicker');
  if (!value || !picker) return;
  const money = amount => 'Rp' + Number(amount).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  let generation = 0;
  let pending = false;
  async function refresh() {
    if (document.hidden || document.documentElement.dataset.homeKpi !== 'capster') return;
    const date = picker.value;
    const seq = ++generation;
    value.textContent = '…';
    value.title = 'Memuat nilai harian dari Payroll';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { value.textContent = '—'; return; }
    const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken?.() : '';
    if (!token || typeof db === 'undefined') { value.textContent = '—'; return; }
    pending = true;
    try {
      const {data, error} = await db.rpc('karyawan_capster_hak_harian_self', {p_token: token, p_date: date});
      if (seq !== generation || picker.value !== date) return;
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result || result.ok !== true) throw error || new Error(result?.reason || 'HAK_HARIAN_UNAVAILABLE');
      if (result.state !== 'DAILY_PARTIAL' || result.hak_harian === null || result.hak_harian === undefined || !Number.isSafeInteger(Number(result.hak_harian))) {
        value.textContent = '—';
        value.title = `Nilai harian belum dapat diverifikasi (${result.state || 'UNKNOWN'})`;
        return;
      }
      value.textContent = money(result.hak_harian);
      value.title = 'Hak harian dari Payroll Owner; belum termasuk bonus/potongan khusus bulanan. Bukan bukti pencairan.';
    } catch (error) {
      if (seq !== generation) return;
      value.textContent = '—';
      value.title = 'Nilai harian belum tersedia';
      console.warn('Hak Dibayar Capster read-only:', error);
    } finally {
      if (seq === generation) pending = false;
    }
  }
  picker.addEventListener('change', () => { void refresh(); });
  new MutationObserver(() => { if (document.documentElement.dataset.homeKpi === 'capster') void refresh(); })
    .observe(document.documentElement, {attributes:true,attributeFilter:['data-home-kpi']});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => { if (!pending) void refresh(); }, 60000);
  void refresh();
})();
