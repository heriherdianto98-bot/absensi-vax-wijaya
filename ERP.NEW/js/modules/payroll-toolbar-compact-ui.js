/* VAX ERP — Payroll Toolbar Compact UI V3
   UI ONLY.
   - Compact toolbar action buttons/icons.
   - Refresh icon spins when Refresh is clicked.
   - Prevent horizontal page scroll on Payroll viewport.
   - Does NOT touch Payroll engine, Kasbon flow, Print/PDF logic, or data.
*/
(() => {
  if (window.__payrollToolbarCompactUiV1) return;
  window.__payrollToolbarCompactUiV1 = true;

  function svg(name){
    const common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    if(name==='master') return `<svg ${common}><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    if(name==='refresh') return `<svg ${common} class="payroll-action-icon payroll-refresh-icon"><path d="M20 6v5h-5M4 18v-5h5M6.2 9A7 7 0 0 1 18.5 6.5L20 8M4 16l1.5 1.5A7 7 0 0 0 17.8 15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(name==='final') return `<svg ${common}><path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(name==='print') return `<svg ${common}><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `<svg ${common}><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 13h6M9 17h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function decorate(el, icon, label){
    if(!el || el.dataset.compactDecorated==='1') return;
    el.dataset.compactDecorated='1';
    el.classList.add('payroll-action-compact');
    el.innerHTML = `<span class="payroll-action-glyph">${svg(icon)}</span><span class="payroll-action-label">${label}</span>`;
  }

  function mount(){
    const master=document.querySelector('.payroll-master-link');
    const refresh=document.getElementById('payrollRefresh');
    const finalBtn=document.getElementById('payrollFinalizeKasbon');
    const print=document.getElementById('payrollPrint');
    const pdf=document.getElementById('payrollPdf');

    decorate(master,'master','Master');
    decorate(refresh,'refresh','Refresh');
    decorate(finalBtn,'final','Final');
    decorate(print,'print','Print');
    decorate(pdf,'pdf','PDF');

    if(refresh && !refresh.dataset.compactSpinBound){
      refresh.dataset.compactSpinBound='1';
      refresh.addEventListener('click',()=>{
        refresh.classList.remove('is-spinning');
        void refresh.offsetWidth;
        refresh.classList.add('is-spinning');
        window.setTimeout(()=>refresh.classList.remove('is-spinning'),900);
      },{capture:true});
    }

    if(!document.getElementById('payrollToolbarCompactUiStyle')){
      const style=document.createElement('style');
      style.id='payrollToolbarCompactUiStyle';
      style.textContent=`
        html,body{max-width:100vw!important;overflow-x:hidden!important}
        body.payroll-aruskas-theme .erp-wrapper,
        body.payroll-aruskas-theme .erp-content,
        body.payroll-aruskas-theme #payrollPage,
        body.payroll-aruskas-theme .payroll-panel,
        body.payroll-aruskas-theme .payroll-toolbar{
          max-width:100%!important;min-width:0!important;box-sizing:border-box!important;
        }
        body.payroll-aruskas-theme .erp-wrapper{overflow-x:hidden!important}
        body.payroll-aruskas-theme .erp-content{overflow-x:hidden!important}
        body.payroll-aruskas-theme #payrollPage{overflow-x:hidden!important}
        .payroll-toolbar{display:grid!important;grid-template-columns:minmax(210px,1fr) minmax(260px,1.2fr) minmax(210px,.85fr) auto!important;gap:10px!important;align-items:end!important}
        .payroll-toolbar>*{min-width:0!important}
        .payroll-toolbar-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:6px!important;flex-wrap:nowrap!important;min-width:0!important;max-width:100%!important}
        .payroll-toolbar-actions .payroll-action-compact{
          min-width:0!important;width:auto!important;height:40px!important;padding:0 10px!important;
          display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;
          border-radius:9px!important;white-space:nowrap!important;font-size:12px!important;line-height:1!important;
          flex:0 1 auto!important;
        }
        .payroll-toolbar-actions .payroll-master-link.payroll-action-compact,
        .payroll-toolbar-actions .payroll-finalize-kasbon-btn.payroll-action-compact{padding-inline:10px!important}
        .payroll-action-glyph{width:13px!important;height:13px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 13px!important}
        .payroll-action-glyph svg{width:13px!important;height:13px!important;display:block!important}
        .payroll-action-label{font-size:12px!important;font-weight:800!important;letter-spacing:0!important}
        #payrollRefresh.is-spinning .payroll-refresh-icon{animation:payrollCompactSpin .72s linear infinite}
        @keyframes payrollCompactSpin{to{transform:rotate(360deg)}}
        @media (max-width:1366px){
          .payroll-toolbar{grid-template-columns:minmax(185px,.9fr) minmax(230px,1.05fr) minmax(175px,.8fr) auto!important;gap:8px!important}
          .payroll-toolbar-actions{gap:5px!important}
          .payroll-toolbar-actions .payroll-action-compact{height:38px!important;padding-inline:8px!important;gap:4px!important}
          .payroll-action-label{font-size:11px!important}
          .payroll-action-glyph,.payroll-action-glyph svg{width:12px!important;height:12px!important}
        }
        @media (max-width:1180px){
          .payroll-action-label{display:none!important}
          .payroll-toolbar-actions .payroll-action-compact{width:36px!important;height:36px!important;padding:0!important}
          .payroll-toolbar-actions .payroll-master-link.payroll-action-compact,
          .payroll-toolbar-actions .payroll-finalize-kasbon-btn.payroll-action-compact{padding:0!important}
        }
      `;
      document.head.appendChild(style);
    }
  }

  const run=()=>{
    mount();
    const mo=new MutationObserver(()=>mount());
    const root=document.querySelector('.payroll-toolbar-actions') || document.body;
    mo.observe(root,{childList:true,subtree:true});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
