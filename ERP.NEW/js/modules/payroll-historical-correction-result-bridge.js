/* VAX ERP — Historical Payroll Correction Result Bridge V2
   Adapter only. Does NOT modify PayrollUnifiedEngine formulas or immutable snapshots.
   Exposes one deterministic normalizer for historical correction view-models
   and collapses an already-saved correction panel by default.
*/
(() => {
  const num = v => { const n=Number(v||0); return Number.isFinite(n)?n:0; };

  function applyCorrectionResult(result){
    if(!result?.historicalLocked || result?.source!=='SNAPSHOT_ORIGINAL') return result;
    const corrections = Array.isArray(result.historicalCorrections) ? result.historicalCorrections : [];
    if(!corrections.length) return result;

    const byEmployee = new Map(corrections.map(c => [Number(c.employee_id), c]));
    (result.payroll || []).forEach(row => {
      const corr = byEmployee.get(Number(row.employeeId));
      if(!corr || !row.summary) return;
      const s = row.summary;
      if(corr.bonus_insentif_override !== null && corr.bonus_insentif_override !== undefined){
        s.bonusInsentif = Math.max(0, num(corr.bonus_insentif_override));
      }
      if(corr.bonus_kpi_override !== null && corr.bonus_kpi_override !== undefined){
        s.bonusKpi = Math.max(0, num(corr.bonus_kpi_override));
      }
      // Exact OWNER LOCK formula, applied only to historical result view-model.
      s.gajiBersih = Math.round(
        num(s.gajiPokok) - num(s.denda) - num(s.kasbon)
        + num(s.bonusInsentif) + num(s.bonusKpi) + num(s.bonusProduk)
      );
    });

    const totals=(result.payroll||[]).reduce((a,row)=>{
      const s=row.summary||{};
      a.gajiPokok+=num(s.gajiPokok); a.denda+=num(s.denda); a.kasbon+=num(s.kasbon);
      a.bonusInsentif+=num(s.bonusInsentif); a.bonusKpi+=num(s.bonusKpi); a.bonusProduk+=num(s.bonusProduk); a.gajiBersih+=num(s.gajiBersih);
      return a;
    },{gajiPokok:0,denda:0,kasbon:0,bonusInsentif:0,bonusKpi:0,bonusProduk:0,gajiBersih:0});
    totals.gajiKotor=totals.gajiPokok;
    result.totals=totals;
    window.__VAX_HISTORICAL_PAYROLL_RESULT__=result;
    return result;
  }

  window.PayrollHistoricalCorrectionResultBridge = Object.freeze({ applyCorrectionResult });

  function ensureStyle(){
    if(document.getElementById('histCorrectionCollapseStyle')) return;
    const style=document.createElement('style');
    style.id='histCorrectionCollapseStyle';
    style.textContent=`
      .hist-payroll-correction.is-collapsed .hist-payroll-grid,
      .hist-payroll-correction.is-collapsed .hist-payroll-actions,
      .hist-payroll-correction.is-collapsed > p{display:none!important}
      .hist-correction-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .hist-correction-toggle{border:1px solid rgba(217,180,50,.5);background:transparent;color:#e3c24a;border-radius:8px;padding:7px 10px;font-weight:700;cursor:pointer}
      .hist-correction-saved{font-size:11px;color:#9eabb7;margin-left:auto}
    `;
    document.head.appendChild(style);
  }

  function hasSavedCorrection(panel){
    return [...panel.querySelectorAll('.hist-gaji,.hist-insentif,.hist-kpi,.hist-note')]
      .some(input => String(input?.value||'').trim() !== '');
  }

  function enhancePanel(panel){
    if(!panel || panel.dataset.collapseEnhanced==='1') return;
    panel.dataset.collapseEnhanced='1';
    ensureStyle();
    const title=panel.querySelector('h4');
    if(!title) return;
    const head=document.createElement('div'); head.className='hist-correction-head';
    title.parentNode.insertBefore(head,title); head.appendChild(title);
    const saved=hasSavedCorrection(panel);
    if(saved){
      const badge=document.createElement('span'); badge.className='hist-correction-saved'; badge.textContent='Koreksi tersimpan'; head.appendChild(badge);
    }
    const btn=document.createElement('button'); btn.type='button'; btn.className='hist-correction-toggle';
    const sync=()=>{ btn.textContent=panel.classList.contains('is-collapsed')?'Edit Koreksi':'Tutup'; };
    btn.addEventListener('click',()=>{ panel.classList.toggle('is-collapsed'); sync(); });
    head.appendChild(btn);
    if(saved) panel.classList.add('is-collapsed');
    sync();
  }

  const observer=new MutationObserver(()=>document.querySelectorAll('.hist-payroll-correction').forEach(enhancePanel));
  const start=()=>{
    document.querySelectorAll('.hist-payroll-correction').forEach(enhancePanel);
    const root=document.getElementById('payrollList');
    if(root) observer.observe(root,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
