/* VAX ERP — Payroll Toolbar Compact UI V2
   UI ONLY.
   - Toolbar actions fit one viewport without horizontal scroll.
   - Small icon-first controls; labels collapse on tighter widths.
   - Refresh icon spins when Refresh is clicked.
   - Does NOT touch Payroll engine, Kasbon flow, Print/PDF logic, or data.
*/
(() => {
  if (window.__payrollToolbarCompactUiV2) return;
  window.__payrollToolbarCompactUiV2 = true;

  function svg(name){
    const common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    if(name==='master') return `<svg ${common}><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    if(name==='refresh') return `<svg ${common} class="payroll-action-icon payroll-refresh-icon"><path d="M20 6v5h-5M4 18v-5h5M6.2 9A7 7 0 0 1 18.5 6.5L20 8M4 16l1.5 1.5A7 7 0 0 0 17.8 15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(name==='final') return `<svg ${common}><path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(name==='print') return `<svg ${common}><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `<svg ${common}><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 13h6M9 17h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function decorate(el, icon, label, title){
    if(!el) return;
    if(el.dataset.compactDecorated!=='1'){
      el.dataset.compactDecorated='1';
      el.classList.add('payroll-action-compact');
      el.innerHTML = `<span class="payroll-action-glyph">${svg(icon)}</span><span class="payroll-action-label">${label}</span>`;
    }
    el.setAttribute('title', title || label);
    el.setAttribute('aria-label', title || label);
  }

  function mount(){
    const master=document.querySelector('.payroll-master-link');
    const refresh=document.getElementById('payrollRefresh');
    const finalBtn=document.getElementById('payrollFinalizeKasbon');
    const print=document.getElementById('payrollPrint');
    const pdf=document.getElementById('payrollPdf');

    decorate(master,'master','Master','Master Gaji Pokok');
    decorate(refresh,'refresh','Refresh','Refresh Payroll');
    decorate(finalBtn,'final','Final','Finalisasi Payroll');
    decorate(print,'print','Print','Print Payroll');
    decorate(pdf,'pdf','PDF','Simpan PDF Payroll');

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
        .payroll-toolbar{display:grid!important;grid-template-columns:minmax(160px,1.1fr) minmax(190px,1.35fr) minmax(150px,.95fr) auto!important;gap:10px!important;align-items:end!important;min-width:0!important}
        .payroll-filter-card,.payroll-period-field{min-width:0!important}
        .payroll-toolbar-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:6px!important;flex-wrap:nowrap!important;min-width:0!important;overflow:visible!important}
        .payroll-toolbar-actions .payroll-action-compact{
          min-width:42px!important;width:auto!important;max-width:92px!important;height:40px!important;padding:0 9px!important;
          display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;
          border-radius:9px!important;white-space:nowrap!important;line-height:1!important;flex:0 1 auto!important;
        }
        .payroll-action-glyph{width:13px!important;height:13px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 13px!important}
        .payroll-action-glyph svg{width:13px!important;height:13px!important;display:block!important}
        .payroll-action-label{font-size:11px!important;font-weight:800!important;letter-spacing:0!important}
        #payrollRefresh.is-spinning .payroll-refresh-icon{animation:payrollCompactSpin .72s linear infinite}
        @keyframes payrollCompactSpin{to{transform:rotate(360deg)}}

        @media (max-width:1360px){
          .payroll-toolbar{grid-template-columns:minmax(150px,1fr) minmax(175px,1.2fr) minmax(140px,.9fr) auto!important;gap:8px!important}
          .payroll-toolbar-actions{gap:5px!important}
          .payroll-toolbar-actions .payroll-action-compact{height:38px!important;min-width:38px!important;max-width:76px!important;padding:0 7px!important}
          .payroll-action-label{font-size:10px!important}
          .payroll-action-glyph,.payroll-action-glyph svg{width:12px!important;height:12px!important}
        }

        @media (max-width:1180px){
          .payroll-toolbar{grid-template-columns:minmax(145px,1fr) minmax(165px,1.1fr) minmax(130px,.85fr) auto!important;gap:7px!important}
          .payroll-toolbar-actions .payroll-action-compact{width:36px!important;min-width:36px!important;max-width:36px!important;height:36px!important;padding:0!important;gap:0!important}
          .payroll-action-label{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
          .payroll-action-glyph,.payroll-action-glyph svg{width:14px!important;height:14px!important;flex-basis:14px!important}
        }

        @media (max-width:980px){
          .payroll-toolbar{grid-template-columns:1fr 1fr!important}
          .payroll-toolbar-actions{grid-column:1/-1!important;justify-content:flex-start!important}
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
