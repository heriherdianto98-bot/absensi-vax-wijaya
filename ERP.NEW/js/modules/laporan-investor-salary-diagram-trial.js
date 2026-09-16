/* Investor Revised / Gaji Karyawan — locked screen UI shared by individual branches.
 * Read-only presenter: handle the report carried by each event rather than a mutable
 * global lastReport; support the documented Soklat/Barsel branch label alias.
 * Never writes payroll, investor UI, source reports or print DOM.
 */
"use strict";
(() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v || 0));
  const selected = () => {
    const select = document.getElementById('lbBranch');
    const id = String(select?.value ?? '').trim();
    const label = String(select?.selectedOptions?.[0]?.textContent ?? '').trim();
    return !id || /^(all|semua)$/i.test(id) || /^semua cabang$/i.test(label) ? null : {id,label};
  };
  const normalizeBranch = value => String(value ?? '').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim()
    .replace(/^vax\s+(?:wijaya|wijiaya)\s+/,'').replace(/^spbu\s+/,'')
    .replace(/rawa\s+badak/g,'rawabadak').replace(/\bsoklat\b/g,'barsel')
    .replace(/\s+/g,' ').trim();
  const month = () => String(document.getElementById('lbMonth')?.value ?? '');
  const valid = r => {
    const choice = selected();
    if(!choice || !r || r.isAllBranches || !r.gaji)return false;
    const reportId = String(r.branch?.id ?? '').trim();
    const reportLabel = normalizeBranch(r.branch?.name ?? r.branch?.nama_cabang);
    const choiceLabel = normalizeBranch(choice.label);
    const sameBranch = (reportId && reportId === choice.id) || (reportLabel && choiceLabel && reportLabel === choiceLabel);
    const reportPeriod = String(r.range?.start || r.range?.end || '').slice(0,7);
    return !!sameBranch && (!month() || !reportPeriod || reportPeriod === month());
  };
  const revised = r => valid(r) && r?.diagnostics?.investorRevised?.applied === true;
  let lastMatched = null;
  const currentReport = () => {
    const applied = window.InvestorRevisedReport;
    if(revised(applied))return applied;
    if(valid(lastMatched))return lastMatched;
    const monthly = window.LaporanBulananInvestorShareBridge?.lastReport;
    return valid(monthly) ? monthly : valid(applied) ? applied : null;
  };
  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-7 16-7 16 0v2"/></svg>';
  const moneyIcon = '<svg viewBox="0 0 24 24" width="29" height="29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 10h.01M17 14h.01"/></svg>';
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
    if(!valid(report))return;
    const original=document.getElementById('lbSalaryLines');
    if(!original?.closest('[data-lb-view="salary"]'))return;
    const g=report.gaji, cap=Array.isArray(g.capsterDetail)?g.capsterDetail:[], non=Array.isArray(g.nonCapsterDetail)?g.nonCapsterDetail:[];
    let host=document.getElementById('vax-salary-diagram');
    if(!host){host=document.createElement('section');host.id='vax-salary-diagram';host.setAttribute('aria-label','Diagram Gaji Karyawan');original.insertAdjacentElement('afterend',host);}
    const allocations=Number(g.svp||0)!==0||Number(g.backupNamedSupplement||0)!==0
      ? `<section class="vax-salary-group vax-salary-other"><header class="vax-salary-group-head"><h3>Alokasi Gaji Lainnya</h3></header><div class="vax-salary-grid">${Number(g.svp||0)!==0?other('Gaji SVP',g.svp):''}${Number(g.backupNamedSupplement||0)!==0?other('Gaji Backup Kasir',g.backupNamedSupplement):''}</div></section>` : '';
    host.innerHTML=`<header class="vax-salary-heading"><div><span class="vax-salary-eyebrow">LAPORAN BULANAN INVESTOR</span><h2>Gaji Karyawan</h2><p>Rincian gaji berdasarkan data laporan periode terpilih</p></div><span class="vax-salary-branch">${esc(report.branch?.name||report.branch?.nama_cabang||'Cabang')}</span></header><div class="vax-salary-top"><span class="vax-salary-top-icon" aria-hidden="true">${moneyIcon}</span><div class="vax-salary-top-copy"><span>TOTAL BIAYA GAJI</span><strong>${money(g.total)}</strong></div></div><div class="vax-salary-stem" aria-hidden="true"></div><div class="vax-salary-groups${allocations?' vax-salary-has-allocation':''}">${group('Gaji Capster',cap,true)}${allocations}<div class="vax-salary-right">${group('Gaji Kasir & Karyawan',non,false)}<div class="vax-salary-brand" aria-label="Enterprise Management System · VAX Wijaya Barbershop"><strong>ENTERPRISE MANAGEMENT SYSTEM</strong><small>VAX WIJAYA BARBERSHOP</small></div></div></div>`;
    lastMatched=report;
    document.body.classList.add('vax-salary-diagram-ready');
  }
  function accept(report){
    if(!valid(report))return;
    // A late monthly event must never replace an applied Revised report for this branch/period.
    const applied=window.InvestorRevisedReport;
    render(revised(applied) ? applied : report);
  }
  function sync(){const report=currentReport();if(report)render(report);else hide();}
  function boot(){
    if(!document.getElementById('vax-salary-depth-brand-style')){
      const style=document.createElement('link');style.id='vax-salary-depth-brand-style';style.rel='stylesheet';style.media='screen';style.href='../styles/laporan-investor-salary-depth-brand-v2.css?v=20260917-v1';document.head.appendChild(style);
    }
    if(!document.getElementById('vax-salary-money-icon-style')){
      const style=document.createElement('link');style.id='vax-salary-money-icon-style';style.rel='stylesheet';style.media='screen';style.href='../styles/laporan-investor-salary-money-icon-v3.css?v=20260917-v1';document.head.appendChild(style);
    }
    document.addEventListener('laporan-investor:revised-report-applied',event=>accept(event.detail?.report));
    document.addEventListener('laporan-bulanan:investor-share',event=>accept(event.detail));
    document.getElementById('lbBranch')?.addEventListener('change',()=>{lastMatched=null;hide();requestAnimationFrame(sync);});
    document.getElementById('lbMonth')?.addEventListener('change',()=>{lastMatched=null;hide();requestAnimationFrame(sync);});
    window.addEventListener('beforeprint',()=>document.body.classList.remove('vax-salary-diagram-ready'));
    window.addEventListener('afterprint',sync);
    sync();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();