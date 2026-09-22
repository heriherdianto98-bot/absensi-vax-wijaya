/* Employee Capster: employee-session-scoped read-only daily Payroll entitlement.
   Bonus/adjustments allocated only monthly are not included. */
(() => {
  'use strict';
  if (window.__vaxEmployeeDailyHak) return;
  window.__vaxEmployeeDailyHak = true;
  const value = document.getElementById('todayPayable');
  const picker = document.getElementById('employeeDatePicker');
  if (!value || !picker) return;
  const money = amount => 'Rp' + Number(amount).toLocaleString('id-ID', {maximumFractionDigits:0});
  let generation = 0, pending = false, verified = null;
  const show = (text, title) => { if (value.textContent !== text) value.textContent = text; value.title = title; };
  // The canonical dashboard renderer still writes a placeholder during its own
  // async KPI refresh. Preserve a verified value for the same selected date only.
  new MutationObserver(() => {
    if (!verified || picker.value !== verified.date || document.documentElement.dataset.homeKpi !== 'capster') return;
    if (value.textContent !== verified.text) show(verified.text, verified.title);
  }).observe(value, {childList:true,characterData:true,subtree:true});
  async function refresh() {
    if (document.hidden || document.documentElement.dataset.homeKpi !== 'capster') return;
    const date = picker.value, seq = ++generation;
    verified = null;
    show('…','Memuat nilai harian dari Payroll');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { show('—','Tanggal tidak valid'); return; }
    const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken?.() : '';
    if (!token || typeof db === 'undefined') { show('—','Sesi atau koneksi tidak tersedia'); return; }
    pending = true;
    try {
      const {data,error} = await db.rpc('karyawan_capster_hak_harian_self', {p_token:token,p_date:date});
      if (seq !== generation || picker.value !== date) return;
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result || result.ok !== true) throw error || new Error(result?.reason || 'HAK_HARIAN_UNAVAILABLE');
      if (result.state !== 'DAILY_PARTIAL' || result.hak_harian === null || result.hak_harian === undefined || !Number.isSafeInteger(Number(result.hak_harian))) {
        show('—',`Nilai harian belum dapat diverifikasi (${result.state || 'UNKNOWN'})`);
        return;
      }
      verified = {date, text:money(result.hak_harian), title:'Hak harian dari rincian Payroll; belum termasuk bonus/potongan khusus bulanan. Bukan bukti pencairan.'};
      show(verified.text, verified.title);
    } catch (error) {
      if (seq !== generation) return;
      verified = null;
      show('—','Nilai harian belum tersedia');
      console.warn('Hak Dibayar Capster read-only:',error);
    } finally {
      if (seq === generation) pending = false;
    }
  }
  picker.addEventListener('change', () => { void refresh(); });
  new MutationObserver(() => { if (document.documentElement.dataset.homeKpi === 'capster') void refresh(); else verified = null; })
    .observe(document.documentElement, {attributes:true,attributeFilter:['data-home-kpi']});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => { if (!pending) void refresh(); },60000);
  void refresh();
})();
