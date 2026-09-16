/* Investor Revised / Gaji Karyawan — Kalijati screen-only trial.
 * Reads the calculated report; never writes payroll, locked investor UI or print DOM.
 */
"use strict";
(() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v || 0));
  const branch = () => String(document.getElementById('lbBranch')?.value ?? '');
  const month = () => String(document.getElementById('lbMonth')?.value ?? '');
  const valid = r => branch() === '1' && String(r?.branch?.id ?? '') === '1' && !r?.isAllBranches && !!r?.gaji && (!r?.range?.start || String(r.range.start).slice(0,7) === month());
  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-7 16-7 16 0v2"/></svg>';
  const item = (label,value) => `<div class="vax-salary-detail"><span>${esc(label)}</span><strong>${money(value)}</strong></div>`;
  const nonRows = r => {
    const fields = [['Gaji Pokok','gajiPokok'],['Bonus Insentif','bonusInsentif'],['Bonus KPI','bonusKpi'],['Bonus Produk','bonusProduk'],['Denda','denda'],['Kasbon','kasbon']];
    return fields.filter(([,k]) => k === 'gajiPokok' || Number(r?.[k] || 0) !== 0).map(([label,k])=>item(label, r?.[k])).join('');
  };
  const capRows = r => [['Share Cukur','payroll'],['Backup Capster','mapped'],['Protek','protek'],['Free Point','freePoint']].filter(([,k])=>Number(r?.[k] || 0)!==0).map(([label,k])=>item(label,r[k])).join('');
  const card = (r,capster) => `<article class="vax-salary-card"><div class="vax-salary-identity"><span class="vax-salary-icon">${icon}</span><div><h4>${esc(r?.nama || (capster?'Capster':'Karyawan'))}</h4><small>${esc(capster?(r?.isBackup?'Backup Capster':'Capster'):(r?.jabatan || 'Karyawan'))}</small></div></div><div class="vax-salary-details">${capster?capRows(r):nonRows(r)}</div><div class="vax-salary-card-total"><span>Total Gaji</span><strong>${money(capster?r?.total:r?.amount)}</strong></div></article>`;
  const group = (title,rows,capster) => rows.length ? `<section class="vax-salary-group"><header class="vax-salary-group-head"><h3>${esc(title)}</h3><span>${rows.length} karyawan</span></header><div class="vax-salary-grid">${rows.map(r=>card(r,capster)).join('')}</div></section>` : '';
  const other = (title,amount) => `<article class="vax-salary-card vax-salary-allocation"><div class="vax-salary-identity"><span class="vax-salary-icon">${icon}</span><div><h4>${esc(title)}</h4><small>Alokasi laporan · bukan rincian per orang</small></div></div><div class="vax-salary-card-total"><span>Nominal</span><strong>${money(amount)}</strong></div></article>`;
  function hide(){document.body.classList.remove('vax-salary-diagram-ready');document.getElementById('vax-salary-diagram')?.remove();}
  function render(report){
    if(!valid(report)){hide();return;}
    const original=document.getElementById('lbSalaryLines');
    if(!original?.closest('[data-lb-view="salary"]'))return;
    const g=report.gaji, cap=Array.isArray(g.capsterDetail)?g.capsterDetail:[], non=Array.isArray(g.nonCapsterDetail)?g.nonCapsterDetail:[];
    let host=document.getElementById('vax-salary-diagram');
    if(!host){host=document.createElement('section');host.id='vax-salary-diagram';host.setAttribute('aria-label','Diagram Gaji Karyawan Kalijati');original.insertAdjacentElement('afterend',host);}
    const allocations=Number(g.svp||0)!==0||Number(g.backupNamedSupplement||0)!==0
      ? `<section class="vax-salary-group vax-salary-other"><header class="vax-salary-group-head"><h3>Alokasi Gaji Lainnya</h3></header><div class="vax-salary-grid">${Number(g.svp||0)!==0?other('Gaji SVP',g.svp):''}${Number(g.backupNamedSupplement||0)!==0?other('Gaji Backup Kasir',g.backupNamedSupplement):''}</div></section>` : '';
    host.innerHTML=`<header class="vax-salary-heading"><div><span class="vax-salary-eyebrow">LAPORAN BULANAN INVESTOR</span><h2>Gaji Karyawan</h2><p>Rincian gaji berdasarkan data laporan periode terpilih</p></div><span class="vax-salary-branch">${esc(report.branch?.name||'Kalijati')}</span></header><div class="vax-salary-top"><span>TOTAL BIAYA GAJI</span><strong>${money(g.total)}</strong></div><div class="vax-salary-stem" aria-hidden="true"></div><div class="vax-salary-groups">${group('Gaji Capster',cap,true)}<div class="vax-salary-right">${group('Gaji Kasir & Karyawan',non,false)}${allocations}</div></div>`;
    document.body.classList.add('vax-salary-diagram-ready');
  }
  function sync(){const r=window.InvestorRevisedReport;if(valid(r))render(r);else hide();}
  function boot(){
    document.addEventListener('laporan-investor:revised-report-applied',e=>render(e.detail?.report));
    document.getElementById('lbBranch')?.addEventListener('change',()=>{hide();requestAnimationFrame(sync);});
    document.getElementById('lbMonth')?.addEventListener('change',()=>{hide();requestAnimationFrame(sync);});
    window.addEventListener('beforeprint',()=>document.body.classList.remove('vax-salary-diagram-ready'));
    window.addEventListener('afterprint',sync);
    sync();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
