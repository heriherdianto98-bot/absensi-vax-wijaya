/* VAX ERP — Payroll Bonus Collapse UI
   UI ONLY.
   Keeps saved bonus editor collapsed by default and reopens on demand.
   Does NOT change payroll formulas, adjustment store, Kasbon, or Print/PDF.
*/
(() => {
  if (window.__payrollBonusCollapseUiV1) return;
  window.__payrollBonusCollapseUiV1 = true;

  function ensureStyle(){
    if(document.getElementById('payrollBonusCollapseUiStyle')) return;
    const style=document.createElement('style');
    style.id='payrollBonusCollapseUiStyle';
    style.textContent=`
      .payroll-bonus-toggle-row{
        display:flex;align-items:center;justify-content:flex-end;gap:8px;
        margin-top:10px;padding-top:10px;border-top:1px solid rgba(148,163,184,.12);
      }
      .payroll-bonus-edit-btn{
        height:34px;padding:0 12px;border:1px solid rgba(56,189,248,.28);border-radius:9px;
        background:rgba(15,23,42,.76);color:#dbeafe;font:800 12px 'Source Sans 3',sans-serif;
        cursor:pointer;transition:.16s ease;
      }
      .payroll-bonus-edit-btn:hover{border-color:rgba(56,189,248,.55);background:rgba(30,41,59,.92)}
      .payroll-manual.is-collapsed{display:none!important}
      .payroll-bonus-saved-note{font-size:11px;font-weight:700;color:#86efac;margin-right:auto;opacity:.92}
    `;
    document.head.appendChild(style);
  }

  function mountCard(card){
    if(!card || card.dataset.bonusCollapseMounted==='1') return;
    const manual=card.querySelector('.payroll-manual');
    if(!manual) return;
    card.dataset.bonusCollapseMounted='1';

    const row=document.createElement('div');
    row.className='payroll-bonus-toggle-row';
    row.innerHTML='<span class="payroll-bonus-saved-note">Bonus tersimpan di ringkasan payroll.</span><button type="button" class="payroll-bonus-edit-btn">Edit Bonus</button>';
    manual.insertAdjacentElement('beforebegin',row);

    const editBtn=row.querySelector('.payroll-bonus-edit-btn');
    manual.classList.add('is-collapsed');

    editBtn.addEventListener('click',()=>{
      const collapsed=manual.classList.toggle('is-collapsed');
      editBtn.textContent=collapsed?'Edit Bonus':'Tutup';
      if(!collapsed){
        const input=manual.querySelector('.js-insentif,.js-kpi,.js-note');
        requestAnimationFrame(()=>input?.focus());
      }
    });
  }

  function mountAll(){
    ensureStyle();
    document.querySelectorAll('#payrollList .payroll-employee-card').forEach(mountCard);
  }

  function run(){
    mountAll();
    const root=document.getElementById('payrollList');
    if(!root) return;
    const mo=new MutationObserver(()=>mountAll());
    mo.observe(root,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
