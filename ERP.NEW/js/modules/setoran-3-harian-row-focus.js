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
