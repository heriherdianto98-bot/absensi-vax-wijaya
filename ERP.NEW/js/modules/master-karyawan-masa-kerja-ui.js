/* ERP VAX Task 2 presentation only: deep gold + Rupiah input mirror.
 * Canonical numeric input, salary validation and all data/engine logic stay unchanged.
 */
(() => {
  'use strict';
  const init = () => {
    const panel = document.getElementById('mkwPanel');
    const raw = document.getElementById('mkwSalaryAmount');
    if (!panel || !raw || document.getElementById('mkwSalaryFormatted')) return;

    const style = document.createElement('style');
    style.id = 'mkw-task2-deep-gold-ui';
    style.textContent = `
      #mkwPanel.mkw-section { border-color: #76571e; box-shadow: inset 0 1px 0 rgba(168,120,33,.12); }
      #mkwPanel.mkw-section h4 { color: #bd9139; }
      #mkwPanel .mkw-card { border-color: #45402f; }
      #mkwPanel .mkw-card strong, #mkwPanel .mkw-salary strong { color: #c59a43; }
      #mkwPanel .mkw-salary { border-top-color: #58451f; }
      #mkwPanel .mkw-salary button { background: linear-gradient(180deg,#bd9139,#916818); border-color: #a87e2a; color: #17140d; }
      #mkwPanel .mkw-salary button:hover:not(:disabled) { background: linear-gradient(180deg,#c99e46,#a17722); }
      #mkwPanel .mkw-rupiah-wrap { display:flex; align-items:center; width:100%; min-height:42px; border:1px solid #424954; border-radius:9px; background:#111820; overflow:hidden; }
      #mkwPanel .mkw-rupiah-prefix { padding:0 4px 0 12px; font-size:14px; font-weight:800; color:#c59a43; flex:none; }
      #mkwPanel .mkw-rupiah-wrap input { flex:1; min-width:0; min-height:40px; width:100%; border:0; border-radius:0; background:transparent; padding:9px 12px 9px 3px; color:#fff; font:600 14px 'Source Sans 3',sans-serif; outline:none; }
      #mkwPanel .mkw-rupiah-wrap:focus-within { border-color:#b58a30; box-shadow:0 0 0 2px rgba(181,138,48,.14); }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = 'mkw-rupiah-wrap';
    const prefix = document.createElement('span');
    prefix.className = 'mkw-rupiah-prefix';
    prefix.textContent = 'Rp';
    prefix.setAttribute('aria-hidden','true');
    const display = document.createElement('input');
    display.id = 'mkwSalaryFormatted';
    display.type = 'text';
    display.inputMode = 'numeric';
    display.autocomplete = 'off';
    display.placeholder = '0';
    display.setAttribute('aria-label','Total gaji historis manual dalam rupiah');
    wrapper.append(prefix,display);
    raw.parentNode.insertBefore(wrapper,raw);
    raw.style.display = 'none';
    raw.tabIndex = -1;
    raw.setAttribute('aria-hidden','true');

    const format = value => {
      const digits = String(value ?? '').replace(/\D/g,'');
      if (!digits) return '';
      const normalized = digits.replace(/^0+(?=\d)/,'');
      return normalized.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    };
    const syncFromRaw = () => { display.value = format(raw.value); };
    display.addEventListener('input', () => {
      const digits = display.value.replace(/\D/g,'');
      const normalized = digits.replace(/^0+(?=\d)/,'');
      raw.value = normalized;
      display.value = format(normalized);
    });
    display.addEventListener('focus',syncFromRaw);
    const salaryDisplay = document.getElementById('mkwSalaryDisplay');
    if (salaryDisplay) new MutationObserver(syncFromRaw).observe(salaryDisplay,{childList:true,characterData:true,subtree:true});
    syncFromRaw();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();