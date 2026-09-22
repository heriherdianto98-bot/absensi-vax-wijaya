/* Employee-only presentation adapter. All values are read from existing ERP self-read RPCs; no financial calculations. */
(() => {
  'use strict';
  const service = document.getElementById('todayService');
  const fine = document.getElementById('todayFine');
  const picker = document.getElementById('employeeDatePicker');
  if (!service || !fine || !picker) return;

  const titleCase = value => String(value || '').toLocaleLowerCase('id-ID').replace(/(^|[\s/(-])([^\s/(-])/g, (_all, prefix, letter) => prefix + letter.toLocaleUpperCase('id-ID'));
  /* Only reformat rows already rendered by the existing canonical KPI renderer. */
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

  let fineRequest = 0;
  const showFine = value => { fine.textContent = value; };
  const formatFine = value => 'Rp' + Number(value).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  async function loadFine(date) {
    const currentRequest = ++fineRequest;
    showFine('…');
    const token = typeof KaryawanSession !== 'undefined' && KaryawanSession.getToken ? KaryawanSession.getToken() : '';
    if (!token || typeof db === 'undefined' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      showFine('—');
      return;
    }
    try {
      /* Same existing self-read source used by Riwayat and Absensi; do not query another employee. */
      const { data, error } = await db.rpc('karyawan_absensi_bulan_self', { p_token: token, p_month: `${date.slice(0, 7)}-01` });
      if (currentRequest !== fineRequest) return;
      const payload = Array.isArray(data) ? data[0] : data;
      if (error || !payload || payload.ok === false) throw error || new Error(payload?.reason || 'ABSENSI_UNAVAILABLE');
      const history = payload.history || payload.riwayat || payload.rows;
      if (!Array.isArray(history)) { showFine('—'); return; }
      const matching = history.filter(row => String(row?.tanggal || row?.activity_date || '').slice(0, 10) === date);
      /* A missing or ambiguous entry must not be presented as zero or recalculated here. */
      if (matching.length !== 1) { showFine('—'); return; }
      const recorded = matching[0].denda;
      if (recorded === null || recorded === undefined || recorded === '' || !Number.isFinite(Number(recorded))) {
        showFine('—'); return;
      }
      showFine(formatFine(recorded));
    } catch (error) {
      if (currentRequest !== fineRequest) return;
      showFine('—');
      console.error('Denda harian read-only gagal:', error);
    }
  }
  picker.addEventListener('change', () => { void loadFine(picker.value); });
  /* The toolbar creates the input synchronously before this script; use its selected date. */
  void loadFine(picker.value);
})();
