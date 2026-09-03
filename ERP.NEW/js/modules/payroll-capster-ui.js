/* VAX ERP — Payroll Capster UI */
(() => {
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const rupiahInput=n=>`Rp ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n||0))}`;
  const parseRupiah=value=>{
    const digits=String(value??'').replace(/[^0-9]/g,'');
    return Number(digits||0);
  };
  const escapeHtml=s=>String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  let manualMonth=null, selectedMonth='', periodYear=2026, allCapsters=[];

  function todayMonth(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date()); }
  function monthEnd(month){ const [y,m]=month.split('-').map(Number); return `${y}-${String(m).padStart(2,'0')}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`; }
  function monthLabel(month){ const [y,m]=month.split('-').map(Number); return `${MONTHS[m-1]} ${y}`; }

  function syncHeaderContext(){
    const branch=el('payrollBranch');
    const branchText=branch?.value ? branch.selectedOptions?.[0]?.textContent?.trim() : '—';
    const hBranch=document.getElementById('erpHeaderCabang');
    const hPeriod=document.getElementById('erpHeaderPeriode');
    if(hBranch) hBranch.textContent=branchText||'—';
    if(hPeriod) hPeriod.textContent=selectedMonth ? monthLabel(selectedMonth) : '—';
    if(typeof syncSidebarRoleMeta==='function') syncSidebarRoleMeta();
  }

  function closeFancySelects(except=null){
    document.querySelectorAll('.payroll-select-shell.is-open').forEach(shell=>{
      if(shell===except) return;
      shell.classList.remove('is-open');
      const trigger=shell.querySelector('.payroll-select-trigger');
      const menu=shell.querySelector('.payroll-select-menu');
      trigger?.setAttribute('aria-expanded','false');
      if(menu) menu.hidden=true;
    });
  }

  function renderFancySelect(select){
    if(!select) return;
    const shell=select.closest('.payroll-select-shell');
    if(!shell) return;
    let trigger=shell.querySelector('.payroll-select-trigger');
    let menu=shell.querySelector('.payroll-select-menu');
    if(!trigger){
      shell.classList.add('is-enhanced');
      trigger=document.createElement('button');
      trigger.type='button';
      trigger.className='payroll-select-trigger';
      trigger.setAttribute('aria-haspopup','listbox');
      trigger.setAttribute('aria-expanded','false');
      menu=document.createElement('div');
      menu.className='payroll-select-menu';
      menu.hidden=true;
      menu.setAttribute('role','listbox');
      shell.append(trigger,menu);
      trigger.addEventListener('click',()=>{
        if(trigger.disabled) return;
        const willOpen=!shell.classList.contains('is-open');
        closeFancySelects(shell);
        shell.classList.toggle('is-open',willOpen);
        trigger.setAttribute('aria-expanded',willOpen?'true':'false');
        menu.hidden=!willOpen;
        if(willOpen){
          const active=menu.querySelector('.is-selected');
          requestAnimationFrame(()=>active?.scrollIntoView({block:'nearest'}));
        }
      });
    }

    const selected=select.selectedOptions?.[0];
    trigger.textContent=selected?.textContent?.trim()||'Pilih';
    trigger.disabled=Boolean(select.disabled);
    shell.classList.toggle('is-disabled',Boolean(select.disabled));
    menu.innerHTML=Array.from(select.options).map(opt=>`<button type="button" class="payroll-select-option${opt.selected?' is-selected':''}" role="option" aria-selected="${opt.selected?'true':'false'}" data-value="${escapeHtml(opt.value)}" ${opt.disabled?'disabled':''}>${escapeHtml(opt.textContent)}</button>`).join('');
    menu.querySelectorAll('.payroll-select-option').forEach(btn=>btn.addEventListener('click',()=>{
      if(btn.disabled) return;
      select.value=btn.dataset.value;
      renderFancySelect(select);
      closeFancySelects();
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }));
  }

  async function loadMaster(){
    const [cabangs,capsters]=await Promise.all([PayrollCapsterEngine.fetchCabang(),PayrollCapsterEngine.fetchKaryawan()]);
    allCapsters=(capsters||[]).filter(x=>PayrollCapsterEngine.isCapster(x));
    el('payrollBranch').innerHTML='<option value="">Pilih Cabang</option>'+(cabangs||[]).map(c=>`<option value="${c.id}">${escapeHtml(c.nama_cabang)}</option>`).join('');
    renderFancySelect(el('payrollBranch'));
    renderFancySelect(el('payrollEmployee'));
  }
  function refreshEmployeeOptions(){
    const branchId=el('payrollBranch').value;
    const select=el('payrollEmployee');
    if(!branchId){
      select.disabled=true;
      select.innerHTML='<option value="">Pilih cabang dulu</option>';
      renderFancySelect(select);
      return;
    }
    const rows=allCapsters.filter(r=>Number(r.cabang_id)===Number(branchId));
    select.disabled=false;
    select.innerHTML='<option value="">Semua Capster Cabang</option>'+rows.map(r=>`<option value="${r.id}">${escapeHtml(r.nama_karyawan)}${r.aktif===false?' · nonaktif':''}</option>`).join('');
    renderFancySelect(select);
  }

  function openPeriod(){
    closeFancySelects();
    periodYear=Number((selectedMonth||todayMonth()).slice(0,4));
    renderPeriodGrid();
    const m=el('payrollPeriodModal');
    m.hidden=false;
    m.setAttribute('aria-hidden','false');
    el('payrollPeriodBtn')?.setAttribute('aria-expanded','true');
  }
  function closePeriod(){
    const m=el('payrollPeriodModal');
    m.hidden=true;
    m.setAttribute('aria-hidden','true');
    el('payrollPeriodBtn')?.setAttribute('aria-expanded','false');
  }
  function renderPeriodGrid(){
    el('payrollYearLabel').textContent=periodYear;
    const active=selectedMonth;
    el('payrollMonthGrid').innerHTML=MONTHS.map((label,i)=>{
      const value=`${periodYear}-${String(i+1).padStart(2,'0')}`;
      return `<button type="button" data-month="${value}" class="${value===active?'is-active':''}"><span>${label}</span><strong>${periodYear}</strong></button>`;
    }).join('');
    el('payrollMonthGrid').querySelectorAll('[data-month]').forEach(btn=>btn.addEventListener('click',async()=>{
      selectedMonth=btn.dataset.month;
      el('payrollPeriodLabel').textContent=monthLabel(selectedMonth);
      syncHeaderContext();
      closePeriod();
      await maybeLoad();
    }));
  }

  function renderPending(p){
    const box=el('payrollPending'); if(!p||!p.rows){ box.hidden=true; return; }
    box.hidden=false; el('pendingRows').textContent=p.rows; el('pendingServices').textContent=p.service; el('pendingShare').textContent=money(p.providerShare);
  }

  function bindRupiahInputs(){
    document.querySelectorAll('.payroll-manual .js-money-input').forEach(input=>{
      const format=()=>{ input.value=rupiahInput(parseRupiah(input.value)); };
      input.addEventListener('input',format);
      input.addEventListener('blur',format);
      input.addEventListener('focus',()=>requestAnimationFrame(()=>input.select()));
      format();
    });
  }

  function renderCard(row){
    const s=row.summary||{},daily=row.daily||[];
    const rows=daily.length?daily.map(d=>`<tr><td>${escapeHtml(d.tanggal)}</td><td>${escapeHtml(d.cabang)}</td><td class="num">${Number(d.service||0)}</td><td class="num">${money(d.gajiHarian)}</td><td class="num">${money(d.bonusProduk)}</td></tr>`).join(''):'<tr><td colspan="5" class="payroll-empty">Tidak ada aktivitas pada periode ini.</td></tr>';
    return `<article class="payroll-employee-card" data-employee-id="${row.employeeId}">
      <div class="payroll-card-head"><div class="payroll-person"><h3>${escapeHtml(row.namaKaryawan)}</h3><p>${escapeHtml(row.homeCabang)} · ${escapeHtml(row.jabatan)}${row.aktif?'':' · nonaktif'}</p></div><div class="payroll-net"><span>Gaji Bersih</span><strong>${money(s.gajiBersih)}</strong></div></div>
      <div class="payroll-table-wrap"><table class="payroll-table"><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th class="num">Service</th><th class="num">Gaji Kotor Harian</th><th class="num">Bonus Produk</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="payroll-summary">
        <div class="payroll-sum"><span>Gaji Kotor</span><strong>${money(s.gajiKotor)}</strong></div><div class="payroll-sum"><span>Denda</span><strong>${money(s.denda)}</strong></div><div class="payroll-sum"><span>Bonus Insentif</span><strong>${money(s.bonusInsentif)}</strong></div><div class="payroll-sum"><span>Bonus KPI</span><strong>${money(s.bonusKpi)}</strong></div><div class="payroll-sum"><span>Bonus Produk</span><strong>${money(s.bonusProduk)}</strong></div><div class="payroll-sum is-net"><span>Gaji Bersih</span><strong>${money(s.gajiBersih)}</strong></div>
      </div>
      <div class="payroll-manual"><label><span>Bonus Insentif</span><input class="js-insentif js-money-input" inputmode="numeric" autocomplete="off" value="${rupiahInput(s.bonusInsentif)}"></label><label><span>Bonus KPI</span><input class="js-kpi js-money-input" inputmode="numeric" autocomplete="off" value="${rupiahInput(s.bonusKpi)}"></label><label><span>Catatan</span><input class="js-note" value="${escapeHtml(manualMonth?.byEmployee?.[String(row.employeeId)]?.note||'')}"></label><button type="button" class="payroll-save">Simpan Bonus</button><p class="payroll-save-msg"></p></div>
    </article>`;
  }
  function bindSave(month){
    document.querySelectorAll('.payroll-employee-card').forEach(card=>card.querySelector('.payroll-save')?.addEventListener('click',async e=>{
      const btn=e.currentTarget,msg=card.querySelector('.payroll-save-msg');
      try{
        btn.disabled=true;
        msg.textContent='Menyimpan…';
        await PayrollManualAdjustmentStore.save({
          employeeId:Number(card.dataset.employeeId),
          periodMonth:month,
          bonusInsentif:parseRupiah(card.querySelector('.js-insentif').value),
          bonusKpi:parseRupiah(card.querySelector('.js-kpi').value),
          note:card.querySelector('.js-note').value
        });
        msg.className='payroll-save-msg ok';
        msg.textContent='Tersimpan.';
        await loadPayroll(false);
      }catch(err){
        msg.className='payroll-save-msg err';
        msg.textContent=err?.message||'Gagal menyimpan.';
      }finally{btn.disabled=false;}
    }));
  }
  async function maybeLoad(){
    syncHeaderContext();
    if(!el('payrollBranch').value){ el('payrollList').innerHTML=''; el('payrollPending').hidden=true; el('payrollStatus').textContent='Pilih cabang untuk melihat payroll.'; return; }
    await loadPayroll();
  }
  async function loadPayroll(showLoading=true){
    const branchId=el('payrollBranch').value,employeeId=el('payrollEmployee').value||null,month=selectedMonth||todayMonth();
    const start=`${month}-01`,end=monthEnd(month);
    if(showLoading) el('payrollStatus').textContent='Memuat payroll…';
    try{
      manualMonth=await PayrollManualAdjustmentStore.loadMonth(month);
      const adjustments=PayrollManualAdjustmentStore.toEngineAdjustments(manualMonth);
      const result=await PayrollCapsterEngine.loadPeriod({start,end,branchId,employeeId,adjustments});
      renderPending(result.pendingSummary);
      el('payrollList').innerHTML=result.payroll.length?result.payroll.map(renderCard).join(''):'<div class="payroll-empty">Tidak ada payroll pada filter ini.</div>';
      bindRupiahInputs();
      bindSave(month);
      const branchName=el('payrollBranch').selectedOptions[0]?.textContent||'—';
      el('payrollStatus').className='payroll-status';
      el('payrollStatus').textContent=`${branchName} · ${result.payroll.length} capster · ${monthLabel(month)} · Gaji Kotor ${money(result.totals.gajiKotor)} · Gaji Bersih ${money(result.totals.gajiBersih)}`;
      syncHeaderContext();
    }catch(err){ el('payrollStatus').className='payroll-status is-error'; el('payrollStatus').textContent=err?.message||'Gagal memuat payroll.'; el('payrollList').innerHTML=''; }
  }
  async function init(){
    if(!el('payrollBranch'))return;
    selectedMonth=todayMonth(); el('payrollPeriodLabel').textContent=monthLabel(selectedMonth); periodYear=Number(selectedMonth.slice(0,4));
    try{await loadMaster();}catch(err){el('payrollStatus').className='payroll-status is-error';el('payrollStatus').textContent=err?.message||'Gagal memuat master payroll.';return;}
    el('payrollBranch').addEventListener('change',async()=>{refreshEmployeeOptions();renderFancySelect(el('payrollBranch'));syncHeaderContext();await maybeLoad();});
    el('payrollEmployee').addEventListener('change',()=>{renderFancySelect(el('payrollEmployee'));maybeLoad();});
    el('payrollRefresh').addEventListener('click',()=>maybeLoad());
    el('payrollPeriodBtn').addEventListener('click',openPeriod);
    el('payrollYearPrev').addEventListener('click',()=>{periodYear--;renderPeriodGrid();});
    el('payrollYearNext').addEventListener('click',()=>{periodYear++;renderPeriodGrid();});
    document.querySelectorAll('[data-payroll-period-close]').forEach(x=>x.addEventListener('click',closePeriod));
    document.addEventListener('click',e=>{if(!e.target.closest('.payroll-select-shell')) closeFancySelects();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFancySelects();if(!el('payrollPeriodModal').hidden) closePeriod();}});
    el('payrollPrint').addEventListener('click',()=>window.PayrollCapsterPrint?.open('print'));
    el('payrollPdf').addEventListener('click',()=>window.PayrollCapsterPrint?.open('pdf'));
    syncHeaderContext();
    setTimeout(syncHeaderContext,250);
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();