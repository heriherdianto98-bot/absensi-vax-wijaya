/* VAX ERP — Employee read-only consumer of the existing Owner TARGET BULAN KPI.
   The secured self-session RPC projects only the employee's branch TARGET BULAN.
   No independent KPI engine, monthly employee totals, or sync invocation. */
(() => {
  'use strict';
  const daily = document.getElementById('kpiCapster')?.closest('.today-section');
  if (!daily) return;
  const style = document.createElement('style');
  style.id = 'vax-employee-owner-target-ui';
  style.textContent = `
    .employee-monthly-kpi{margin:16px 0 4px;min-width:0;color:#f2ede3}
    .employee-monthly-kpi[hidden]{display:none!important}
    .employee-monthly-kpi-card{padding:12px 13px 13px;border:1px solid #5e5135;border-radius:14px;background:linear-gradient(150deg,#2d2a22,#181a19 76%);box-shadow:inset 0 1px 0 #ffffff12,0 6px 16px #0003}
    .employee-monthly-kpi-heading{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:750;letter-spacing:.08em;color:#d9c9a8}
    .employee-monthly-kpi-heading i{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;color:#f2d58f;background:#443b2a}
    .employee-monthly-kpi-value{display:block;margin:7px 0 6px;color:#f4d187;font-size:29px;line-height:1.15;text-align:center;font-weight:800;font-variant-numeric:tabular-nums}
    .employee-monthly-kpi-track{height:5px;border-radius:20px;background:#414039;overflow:hidden}
    .employee-monthly-kpi-fill{display:block;height:100%;width:0;background:linear-gradient(90deg,#b8944a,#f5d991);transition:width .2s ease}
    .employee-monthly-kpi-detail{margin-top:7px;font-size:11px;line-height:1.4;color:#e9dfc9;text-align:center;font-weight:650;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .employee-monthly-kpi-note{margin:6px 1px 0;font-size:10px;color:#a9a394;line-height:1.4}
    @media(prefers-reduced-motion:reduce){.employee-monthly-kpi-fill{transition:none}}
  `;
  document.head.appendChild(style);
  const section = document.createElement('section');
  section.className = 'employee-monthly-kpi';
  section.hidden = true;
  section.setAttribute('aria-label', 'Target bulan cabang dari ERP Owner');
  section.innerHTML = `<article class="employee-monthly-kpi-card"><div class="employee-monthly-kpi-heading"><i class="fa-solid fa-bullseye" aria-hidden="true"></i><span>TARGET BULAN</span></div><strong class="employee-monthly-kpi-value" id="employeeOwnerTargetPct">—</strong><div class="employee-monthly-kpi-track" role="progressbar" aria-label="Pencapaian target bulan" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="employee-monthly-kpi-fill"></span></div><div class="employee-monthly-kpi-detail" id="employeeOwnerTargetDetail">— / —</div></article><p class="employee-monthly-kpi-note" id="employeeOwnerTargetNote" role="status" aria-live="polite">Memuat TARGET BULAN cabang dari ERP…</p>`;
  daily.insertAdjacentElement('afterend', section);
  const pct = section.querySelector('#employeeOwnerTargetPct');
  const detail = section.querySelector('#employeeOwnerTargetDetail');
  const note = section.querySelector('#employeeOwnerTargetNote');
  const track = section.querySelector('.employee-monthly-kpi-track');
  const fill = section.querySelector('.employee-monthly-kpi-fill');
  const isCapster = () => document.documentElement.dataset.homeKpi === 'capster';
  const rupiah = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  let busy = false;
  let run = 0;
  function reset(message) {
    pct.textContent = '—';
    detail.textContent = '— / —';
    track.setAttribute('aria-valuenow', '0');
    track.removeAttribute('aria-valuetext');
    fill.style.width = '0%';
    note.textContent = message;
  }
  async function refresh() {
    if (busy || document.hidden || !isCapster()) return;
    const current = ++run;
    busy = true;
    try {
      const token = typeof KaryawanSession !== 'undefined' ? KaryawanSession.getToken() : '';
      if (!token || typeof db === 'undefined') throw new Error('SESSION_UNAVAILABLE');
      const { data, error } = await db.rpc('karyawan_target_bulan_cabang_self', { p_token: token });
      if (current !== run) return;
      if (error || !data || data.ok !== true) throw error || new Error(data?.reason || 'TARGET_UNAVAILABLE');
      const percent = Number(data.persen), omzet = Number(data.omzet), target = Number(data.target);
      if (![percent, omzet, target].every(Number.isFinite) || target <= 0) throw new Error('TARGET_DATA_INVALID');
      pct.textContent = `${percent}%`;
      detail.textContent = `${rupiah(omzet)} / ${rupiah(target)}`;
      track.setAttribute('aria-valuenow', String(Math.min(100, Math.max(0, percent))));
      track.setAttribute('aria-valuetext', `${percent}% dari target cabang`);
      fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      note.textContent = 'Target cabang bulan berjalan · sumber yang sama dengan Dashboard Owner · hanya baca.';
    } catch (error) {
      if (current !== run) return;
      reset('Target bulan belum dapat dibaca dari ERP.');
      console.warn('TARGET BULAN cabang read-only:', error);
    } finally { busy = false; }
  }
  const updateRole = () => {
    section.hidden = !isCapster();
    if (isCapster()) void refresh();
    else { ++run; reset('Menunggu data ERP…'); }
  };
  new MutationObserver(updateRole).observe(document.documentElement, { attributes: true, attributeFilter: ['data-home-kpi'] });
  updateRole();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => { void refresh(); }, 60000); // UI read only, not a sync scheduler.
})();
