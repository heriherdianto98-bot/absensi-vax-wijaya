// Setoran 3 Harian — UI-only active row focus marker.
(() => {
  const BODY_ID = 's3sheetBody';
  const CLASS_NAME = 's3sheet-row-focus';

  function clearFocus(tbody) {
    tbody?.querySelectorAll(`tr.${CLASS_NAME}`).forEach(row => row.classList.remove(CLASS_NAME));
  }

  function focusRowFromTarget(target) {
    const tbody = document.getElementById(BODY_ID);
    if (!tbody || !(target instanceof Element)) return;
    const row = target.closest('tr');
    if (!row || row.parentElement !== tbody) return;
    if (row.classList.contains(CLASS_NAME)) return;
    clearFocus(tbody);
    row.classList.add(CLASS_NAME);
  }

  function bind() {
    const tbody = document.getElementById(BODY_ID);
    if (!tbody || tbody.dataset.rowFocusBound === '1') return;
    tbody.dataset.rowFocusBound = '1';

    tbody.addEventListener('pointerdown', event => focusRowFromTarget(event.target));
    tbody.addEventListener('focusin', event => focusRowFromTarget(event.target));
    tbody.addEventListener('change', event => focusRowFromTarget(event.target));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }

  document.addEventListener('erp:components-ready', bind);
})();

/*
 * Setoran 3 Harian — smooth horizontal scrollbar sync.
 * UI ONLY: tidak menyentuh data, engine, rumus, Supabase, atau workflow Setoran.
 *
 * Halaman memiliki dua area scroll horizontal: worksheet asli dan controller
 * scrollbar di bawah. Handler lama menyamakan scrollLeft pada setiap event
 * mentah sehingga repaint tabel lebar dapat terasa patah-patah. Layer ini
 * mengambil event lebih awal dan membatasi sinkronisasi maksimal sekali per
 * animation frame.
 */
(() => {
  function bindSmoothHorizontalScroll() {
    const tableWrap = document.querySelector('.s3sheet-table-wrap');
    const bottom = document.getElementById('s3sheetBottomScroll');
    if (!tableWrap || !bottom || bottom.dataset.s3SmoothSyncBound === '1') return;

    bottom.dataset.s3SmoothSyncBound = '1';
    tableWrap.dataset.s3SmoothSyncBound = '1';

    let rafId = 0;
    let pendingFrom = null;
    let pendingTo = null;

    const flush = () => {
      rafId = 0;
      const from = pendingFrom;
      const to = pendingTo;
      pendingFrom = null;
      pendingTo = null;
      if (!from || !to) return;

      const x = from.scrollLeft;
      if (Math.abs(to.scrollLeft - x) > 0.5) to.scrollLeft = x;
    };

    const queueSync = (from, to, event) => {
      // Hentikan handler sinkronisasi lama pada target yang sama; native scroll
      // tetap berjalan karena event listener bersifat passive dan tidak dicegah.
      event.stopImmediatePropagation();

      if (Math.abs(to.scrollLeft - from.scrollLeft) <= 0.5) return;
      pendingFrom = from;
      pendingTo = to;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    tableWrap.addEventListener(
      'scroll',
      event => queueSync(tableWrap, bottom, event),
      { capture: true, passive: true }
    );

    bottom.addEventListener(
      'scroll',
      event => queueSync(bottom, tableWrap, event),
      { capture: true, passive: true }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSmoothHorizontalScroll, { once: true });
  } else {
    bindSmoothHorizontalScroll();
  }

  document.addEventListener('erp:components-ready', bindSmoothHorizontalScroll);
})();

/*
 * Setoran 3 Harian — anti blink saat toggle "Sudah Diambil".
 * UI ONLY: proses save tetap memakai SetoranDirectFlow asli. Yang dicegah hanya
 * full tbody redraw setelah save checkbox, karena redraw seluruh 10 baris membuat
 * layar tampak berkedip. Perubahan lain tetap memakai renderTable normal.
 */
(() => {
  if (typeof SetoranDirectFlow === 'undefined') return;

  const flow = SetoranDirectFlow;
  if (flow.__s3TakenNoBlinkPatched) return;
  flow.__s3TakenNoBlinkPatched = true;

  let suppressFullRender = false;
  let activeCabangId = null;

  function syncTakenRowUi() {
    if (activeCabangId == null) return;

    const tr = document.querySelector(`tr[data-cabang-id="${activeCabangId}"]`);
    if (!tr) return;

    const saved = flow.savedRows.get(flow.key(activeCabangId)) || {};
    const taken = saved.taken_status === 'SUDAH DIAMBIL';
    const checkbox = tr.querySelector('[data-field="taken"]');
    const label = checkbox?.closest('.s3sheet-check');

    if (checkbox) checkbox.checked = taken;
    if (label) label.classList.toggle('is-taken', taken);
  }

  const originalRenderTable = flow.renderTable.bind(flow);
  flow.renderTable = function() {
    if (!suppressFullRender) return originalRenderTable(...arguments);

    // Pertahankan DOM tabel yang sedang terlihat; cukup sinkronkan state baris
    // yang baru disimpan. Layer status/owner-verify yang dimuat setelah file ini
    // tetap dapat mendekorasi DOM yang sama tanpa membuat seluruh tabel berkedip.
    syncTakenRowUi();
    return undefined;
  };

  const originalSaveRow = flow.saveRow.bind(flow);
  flow.saveRow = async function(tr, options = {}) {
    const isTakenToggle = options && options.taken !== null && options.taken !== undefined;
    if (!isTakenToggle) return originalSaveRow(tr, options);

    activeCabangId = Number(tr?.dataset?.cabangId);
    suppressFullRender = true;

    try {
      return await originalSaveRow(tr, options);
    } finally {
      suppressFullRender = false;
      syncTakenRowUi();
      activeCabangId = null;
    }
  };
})();
