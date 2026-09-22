/* Capster dashboard consumer of the existing Absensi final fine decision. No fine calculation or write. */
(() => {
  'use strict';
  const fine = document.getElementById('todayFine');
  const picker = document.getElementById('employeeDatePicker');
  if (!fine || !picker) return;
  const money = n => 'Rp' + Number(n).toLocaleString('id-ID', {maximumFractionDigits:0});
  let sequence = 0;
  let pending = false;
  async function refresh() {
    if (document.hidden || document.documentElement.dataset.homeKpi !== 'capster') return;
    const date = picker.value;
    const seq = ++sequence;
    fine.textContent = '…';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { fine.textContent = '—'; return; }
    const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken?.() : '';
    if (!token || typeof db === 'undefined') { fine.textContent = '—'; return; }
    pending = true;
    try {
      const {data,error} = await db.rpc('karyawan_denda_final_harian_self', {p_token:token,p_date:date});
      if (seq !== sequence || picker.value !== date) return;
      const payload = Array.isArray(data) ? data[0] : data;
      if (error || !payload || payload.ok !== true) throw error || new Error(payload?.reason || 'DENDA_UNAVAILABLE');
      const amount = payload.denda_final;
      const isFinal = payload.state === 'FINAL' || payload.state === 'TIDAK_TERLAMBAT';
      fine.textContent = isFinal && amount !== null && amount !== undefined && amount !== '' && Number.isFinite(Number(amount))
        ? money(amount) : '—';
      fine.title = payload.state === 'MENUNGGU_KEPUTUSAN' ? 'Denda menunggu keputusan Absensi' : 'Denda final dari modul Absensi';
    } catch (error) {
      if (seq !== sequence) return;
      fine.textContent = '—';
      console.warn('Denda final Absensi karyawan tidak tersedia:',error);
    } finally {
      pending = false;
    }
  }
  picker.addEventListener('change', () => { void refresh(); });
  new MutationObserver(() => { if (document.documentElement.dataset.homeKpi === 'capster') void refresh(); })
    .observe(document.documentElement, {attributes:true,attributeFilter:['data-home-kpi']});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => { if (!pending) void refresh(); }, 60000);
  void refresh();
})();
