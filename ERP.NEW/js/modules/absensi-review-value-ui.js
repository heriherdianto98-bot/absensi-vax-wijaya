/* UI ONLY: animate changed Owner review KPI values; never changes their data. */
(function(){
  'use strict';
  const known=new WeakMap();

  // Read the same calculated fine records displayed by the monthly attendance matrix.
  // Do not recalculate or change the attendance, SPV decision, or payroll engines.
  function syncFineCards(){
    const owner=window.AbsensiOwner;
    const report=window.AbsensiLaporanBulanan;
    const rows=report?._rows;
    if(!owner||!report||!Array.isArray(rows)||!rows.length)return;
    const selected=String(owner.selectedDate?.()||'');
    const parts=selected.split('-');
    if(parts.length!==3||Number(parts[0])!==Number(report.selectedYear?.())||Number(parts[1])!==Number(report.selectedMonth?.()))return;

    // The monthly module may be loading a different branch. Never show a partial total.
    const ownerBranch=String(owner.selectedCabangName?.()||'').trim().toLowerCase();
    const reportBranchId=String(report.selectedCabangId?.()||'');
    const reportBranch=reportBranchId?String((report._cabangList||[]).find(c=>String(c.id)===reportBranchId)?.nama_cabang||'').trim().toLowerCase():'';
    if(ownerBranch!==reportBranch)return;

    const employeeId=String(owner.selectedEmployeeId?.()||'');
    const scoped=rows.filter(row=>(!ownerBranch||String(row.cabang||'').trim().toLowerCase()===ownerBranch)&&(!employeeId||String(row.id)===employeeId));
    let today=0,month=0;
    scoped.forEach(row=>(row.dendaRecords||[]).forEach(rec=>{
      const amount=Number(rec.dendaSementara||0);
      if(!Number.isFinite(amount)||amount<=0)return;
      month+=amount;
      if(rec.iso===selected)today+=amount;
    }));
    const fmt=n=>'Rp'+n.toLocaleString('id-ID');
    [['totalDendaHariIni',today],['totalDendaBulanan',month]].forEach(([id,value])=>{
      const el=document.getElementById(id);
      if(el&&el.textContent!==fmt(value))el.textContent=fmt(value);
    });
  }

  function check(){
    syncFineCards();
    const panel=document.getElementById('izinSpvEmbed');
    if(!panel)return;
    panel.querySelectorAll('.izin-spv-summary-card strong').forEach(function(value){
      const current=value.textContent.trim();
      if(!known.has(value)){known.set(value,current);return;}
      if(known.get(value)===current)return;
      known.set(value,current);
      value.classList.remove('vax-review-value-changing');
      void value.offsetWidth;
      value.classList.add('vax-review-value-changing');
    });
  }
  function boot(){
    const root=document.getElementById('absensiRoot');
    if(!root)return;
    check();
    root.addEventListener('animationend',function(event){
      if(event.animationName==='vax-kpi-value-change')event.target.classList.remove('is-counting');
      if(event.animationName==='vax-review-number-pop')event.target.classList.remove('vax-review-value-changing');
    },true);
    const observer=new MutationObserver(check);
    observer.observe(root,{subtree:true,childList:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
