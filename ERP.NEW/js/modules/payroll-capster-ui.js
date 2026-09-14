/* VAX ERP — Unified Payroll / Master Gaji UI */
(() => {
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const rupiahInput=n=>`Rp ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n||0))}`;
  const parseRupiah=value=>Number(String(value??'').replace(/[^0-9]/g,'')||0);
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  let manualMonth=null,selectedMonth='',periodYear=2026,allEmployees=[],salaryData={rows:[],byEmployee:{}};

  function todayMonth(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date());}
  function monthEnd(month){const [y,m]=month.split('-').map(Number);return `${y}-${String(m).padStart(2,'0')}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`;}
  function monthLabel(month){const [y,m]=month.split('-').map(Number);return `${MONTHS[m-1]} ${y}`;}
  function dateLabel(date){const [y,m,d]=String(date||'').split('-').map(Number);return y&&m&&d?`${String(d).padStart(2,'0')} ${MONTHS[m-1]} ${y}`:String(date||'—');}
  function isCapster(row){return String(row?.jabatan||'').trim().toLowerCase()==='capster';}

  function syncHeaderContext(){
    const branch=el('payrollBranch');
    const branchText=branch?.value?branch.selectedOptions?.[0]?.textContent?.trim():'—';
    const hBranch=document.getElementById('erpHeaderCabang'),hPeriod=document.getElementById('erpHeaderPeriode');
    if(hBranch)hBranch.textContent=branchText||'—';
    if(hPeriod)hPeriod.textContent=selectedMonth?monthLabel(selectedMonth):'—';
    if(typeof syncSidebarRoleMeta==='function')syncSidebarRoleMeta();
  }

  function closeFancySelects(except=null){
    document.querySelectorAll('.payroll-select-shell.is-open').forEach(shell=>{
      if(shell===except)return;
      shell.classList.remove('is-open');
      shell.querySelector('.payroll-select-trigger')?.setAttribute('aria-expanded','false');
      const menu=shell.querySelector('.payroll-select-menu');if(menu)menu.hidden=true;
    });
  }

  function renderFancySelect(select){
    if(!select)return;
    const shell=select.closest('.payroll-select-shell');if(!shell)return;
    let trigger=shell.querySelector('.payroll-select-trigger'),menu=shell.querySelector('.payroll-select-menu');
    if(!trigger){
      shell.classList.add('is-enhanced');
      trigger=document.createElement('button');trigger.type='button';trigger.className='payroll-select-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
      menu=document.createElement('div');menu.className='payroll-select-menu';menu.hidden=true;menu.setAttribute('role','listbox');shell.append(trigger,menu);
      trigger.addEventListener('click',()=>{
        if(trigger.disabled)return;
        const open=!shell.classList.contains('is-open');closeFancySelects(shell);shell.classList.toggle('is-open',open);trigger.setAttribute('aria-expanded',open?'true':'false');menu.hidden=!open;
        if(open)requestAnimationFrame(()=>menu.querySelector('.is-selected')?.scrollIntoView({block:'nearest'}));
      });
    }
    const selected=select.selectedOptions?.[0];trigger.textContent=selected?.textContent?.trim()||'Pilih';trigger.disabled=Boolean(select.disabled);shell.classList.toggle('is-disabled',Boolean(select.disabled));
    menu.innerHTML=Array.from(select.options).map(opt=>`<button type="button" class="payroll-select-option${opt.selected?' is-selected':''}" role="option" aria-selected="${opt.selected?'true':'false'}" data-value="${escapeHtml(opt.value)}" ${opt.disabled?'disabled':''}>${escapeHtml(opt.textContent)}</button>`).join('');
    menu.querySelectorAll('.payroll-select-option').forEach(btn=>btn.addEventListener('click',()=>{if(btn.disabled)return;select.value=btn.dataset.value;renderFancySelect(select);closeFancySelects();select.dispatchEvent(new Event('change',{bubbles:true}));}));
  }

  async function loadMaster(){
    const [cabangs,employees,salaries]=await Promise.all([PayrollUnifiedEngine.fetchCabang(),PayrollUnifiedEngine.fetchKaryawan(),PayrollSalaryMasterStore.loadAll()]);
    allEmployees=employees||[];salaryData=salaries||{rows:[],byEmployee:{}};
    el('payrollBranch').innerHTML='<option value="">Pilih Cabang</option>'+(cabangs||[]).map(c=>`<option value="${c.id}">${escapeHtml(c.nama_cabang)}</option>`).join('');
    renderFancySelect(el('payrollBranch'));renderFancySelect(el('payrollEmployee'));
  }

  function refreshEmployeeOptions(){
    const branchId=el('payrollBranch').value,select=el('payrollEmployee');
    if(!branchId){select.disabled=true;select.innerHTML='<option value="">Pilih cabang dulu</option>';renderFancySelect(select);return;}
    const rows=allEmployees.filter(r=>Number(r.cabang_id)===Number(branchId));
    select.disabled=false;
    select.innerHTML='<option value="">Semua Karyawan Cabang</option>'+rows.map(r=>`<option value="${r.id}">${escapeHtml(r.nama_karyawan)} · ${escapeHtml(r.jabatan||'—')}${r.aktif===false?' · nonaktif':''}</option>`).join('');
    renderFancySelect(select);
  }

  function openPeriod(){closeFancySelects();periodYear=Number((selectedMonth||todayMonth()).slice(0,4));renderPeriodGrid();const m=el('payrollPeriodModal');m.hidden=false;m.setAttribute('aria-hidden','false');el('payrollPeriodBtn')?.setAttribute('aria-expanded','true');}
  function closePeriod(){const m=el('payrollPeriodModal');m.hidden=true;m.setAttribute('aria-hidden','true');el('payrollPeriodBtn')?.setAttribute('aria-expanded','false');}
  function renderPeriodGrid(){
    el('payrollYearLabel').textContent=periodYear;const active=selectedMonth;
    el('payrollMonthGrid').innerHTML=MONTHS.map((label,i)=>{const value=`${periodYear}-${String(i+1).padStart(2,'0')}`;return `<button type="button" data-month="${value}" class="${value===active?'is-active':''}"><span>${label}</span><strong>${periodYear}</strong></button>`;}).join('');
    el('payrollMonthGrid').querySelectorAll('[data-month]').forEach(btn=>btn.addEventListener('click',async()=>{selectedMonth=btn.dataset.month;el('payrollPeriodLabel').textContent=monthLabel(selectedMonth);syncHeaderContext();closePeriod();await maybeLoad();}));
  }

  function renderPending(p){
    const box=el('payrollPending');
    if(!p||!p.rows){box.hidden=true;return;}
    box.hidden=false;el('pendingRows').textContent=p.rows;el('pendingServices').textContent=p.service;el('pendingShare').textContent=money(p.providerShare);
  }

  function salaryRateFor(row){
    if(row.isCapster)return null;
    return PayrollSalaryMasterStore.rateAt(salaryData,row.employeeId,monthEnd(selectedMonth||todayMonth()));
  }

  function salaryMasterHtml(row){
    if(row.isCapster)return `<div class="payroll-salary-source"><span>SUMBER GAJI POKOK</span><strong>Minutes · provider_share</strong><small>LOCK — mengikuti share service Capster.</small></div>`;
    const rate=salaryRateFor(row),basis=rate?.payBasis||'',amount=rate?.amount||0,start=rate?.effectiveFrom||`${selectedMonth||todayMonth()}-01`;
    return `<div class="payroll-salary-master${row.salaryMissing?' is-missing':''}">
      <div class="payroll-salary-head"><div><span>MASTER GAJI POKOK</span><strong>${rate?`${rate.payBasis==='MONTHLY'?'Bulanan':'Harian'} · ${money(rate.amount)}`:'Belum diset'}</strong></div>${row.salaryMissing?'<em>WAJIB DIISI</em>':''}</div>
      <div class="payroll-salary-form">
        <label><span>Basis</span><select class="js-salary-basis"><option value="">Pilih basis</option><option value="MONTHLY" ${basis==='MONTHLY'?'selected':''}>Bulanan</option><option value="DAILY" ${basis==='DAILY'?'selected':''}>Harian</option></select></label>
        <label><span>Gaji Pokok</span><input class="js-salary-amount js-money-input" inputmode="numeric" autocomplete="off" value="${rupiahInput(amount)}"></label>
        <label><span>Berlaku Mulai</span><input class="js-salary-start" type="date" value="${start}"></label>
        <button type="button" class="payroll-salary-save">Simpan Master Gaji</button>
        <p class="payroll-salary-msg"></p>
      </div>
    </div>`;
  }

  function renderCard(row){
    const s=row.summary||{},daily=row.daily||[];
    const rows=daily.length?daily.map(d=>`<tr>
      <td>${escapeHtml(dateLabel(d.tanggal))}</td><td>${escapeHtml(d.cabang)}</td>
      <td class="num">${row.isCapster?Number(d.service||0):'—'}</td>
      <td class="num">${money(Math.round(d.gajiPokok||0))}</td>
      <td class="num is-denda">${money(d.denda)}</td>
      <td class="num is-kasbon">${money(d.kasbon)}</td>
      <td class="num is-product" title="Sumber harian: product_sales_source.revenue_share">${money(d.bonusProduk||0)}</td>
    </tr>`).join(''):'<tr><td colspan="7" class="payroll-empty">Tidak ada aktivitas pada periode ini.</td></tr>';
    return `<article class="payroll-employee-card" data-employee-id="${row.employeeId}" data-base-net="${Number(s.gajiBersih||0)}" data-base-insentif="${Number(s.bonusInsentif||0)}" data-base-kpi="${Number(s.bonusKpi||0)}">
      <div class="payroll-card-head"><div class="payroll-person"><h3>${escapeHtml(row.namaKaryawan)}</h3><p>${escapeHtml(row.homeCabang)} · ${escapeHtml(row.jabatan)}${row.aktif?'':' · nonaktif'}</p></div><div class="payroll-net"><span>Gaji Bersih</span><strong class="js-net-value">${money(s.gajiBersih)}</strong></div></div>
      ${salaryMasterHtml(row)}
      <div class="payroll-table-wrap"><table class="payroll-table"><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th class="num">Service</th><th class="num">Gaji Pokok</th><th class="num">Denda</th><th class="num">Kasbon</th><th class="num" title="Share produk per hari dari product_sales_source">Share Produk</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="payroll-summary payroll-summary-unified">
        <div class="payroll-sum"><span>Gaji Pokok</span><strong>${money(s.gajiPokok)}</strong></div>
        <div class="payroll-sum is-denda-card"><span>Denda</span><strong>${money(s.denda)}</strong></div>
        <div class="payroll-sum is-kasbon-card"><span>Kasbon</span><strong>${money(s.kasbon)}</strong></div>
        <div class="payroll-sum is-insentif-card"><span>Bonus Insentif</span><strong class="js-sum-insentif">${money(s.bonusInsentif)}</strong></div>
        <div class="payroll-sum is-kpi-card"><span>Bonus KPI</span><strong class="js-sum-kpi">${money(s.bonusKpi)}</strong></div>
        <div class="payroll-sum is-product-card"><span>Share Produk</span><strong>${money(s.bonusProduk)}</strong></div>
        <div class="payroll-sum is-net"><span>Gaji Bersih</span><strong class="js-sum-net">${money(s.gajiBersih)}</strong></div>
      </div>
      <div class="payroll-manual"><label><span>Bonus Insentif</span><input class="js-insentif js-money-input" inputmode="numeric" autocomplete="off" value="${rupiahInput(s.bonusInsentif)}"></label><label><span>Bonus KPI</span><input class="js-kpi js-money-input" inputmode="numeric" autocomplete="off" value="${rupiahInput(s.bonusKpi)}"></label><label><span>Catatan</span><input class="js-note" value="${escapeHtml(manualMonth?.byEmployee?.[String(row.employeeId)]?.note||'')}"></label><button type="button" class="payroll-save">Simpan Bonus</button><p class="payroll-save-msg"></p></div>
    </article>`;
  }

  function formatMoneyInput(input){input.value=rupiahInput(parseRupiah(input.value));}
  function updateLivePreview(card){
    const baseNet=Number(card.dataset.baseNet||0),baseIns=Number(card.dataset.baseInsentif||0),baseKpi=Number(card.dataset.baseKpi||0);
    const ins=parseRupiah(card.querySelector('.js-insentif')?.value),kpi=parseRupiah(card.querySelector('.js-kpi')?.value);
    const preview=baseNet-baseIns-baseKpi+ins+kpi;
    const netText=money(preview);
    const net=card.querySelector('.js-net-value'),sumNet=card.querySelector('.js-sum-net');if(net)net.textContent=netText;if(sumNet)sumNet.textContent=netText;
    const sumIns=card.querySelector('.js-sum-insentif'),sumKpi=card.querySelector('.js-sum-kpi');if(sumIns)sumIns.textContent=money(ins);if(sumKpi)sumKpi.textContent=money(kpi);
  }

  function bindMoneyInputs(){
    document.querySelectorAll('.js-money-input').forEach(input=>{
      const onInput=()=>{formatMoneyInput(input);const card=input.closest('.payroll-employee-card');if(card&&input.matches('.js-insentif,.js-kpi'))updateLivePreview(card);};
      input.addEventListener('input',onInput);input.addEventListener('blur',onInput);input.addEventListener('focus',()=>requestAnimationFrame(()=>input.select()));formatMoneyInput(input);
    });
  }

  function bindSalarySave(){
    document.querySelectorAll('.payroll-employee-card').forEach(card=>card.querySelector('.payroll-salary-save')?.addEventListener('click',async e=>{
      const btn=e.currentTarget,box=card.querySelector('.payroll-salary-master'),msg=card.querySelector('.payroll-salary-msg');
      try{
        btn.disabled=true;msg.className='payroll-salary-msg';msg.textContent='Menyimpan master gaji…';
        const basis=box.querySelector('.js-salary-basis').value,amount=parseRupiah(box.querySelector('.js-salary-amount').value),effectiveFrom=box.querySelector('.js-salary-start').value;
        if(!basis)throw new Error('Pilih basis gaji Bulanan atau Harian.');
        await PayrollSalaryMasterStore.save({employeeId:Number(card.dataset.employeeId),payBasis:basis,amount,effectiveFrom});
        salaryData=await PayrollSalaryMasterStore.loadAll();msg.className='payroll-salary-msg ok';msg.textContent='Master gaji tersimpan.';await loadPayroll(false);
      }catch(err){msg.className='payroll-salary-msg err';msg.textContent=err?.message||'Gagal menyimpan master gaji.';}finally{btn.disabled=false;}
    }));
  }

  function bindBonusSave(month){
    document.querySelectorAll('.payroll-employee-card').forEach(card=>card.querySelector('.payroll-save')?.addEventListener('click',async e=>{
      const btn=e.currentTarget,msg=card.querySelector('.payroll-save-msg');
      try{
        btn.disabled=true;msg.textContent='Menyimpan…';
        await PayrollManualAdjustmentStore.save({employeeId:Number(card.dataset.employeeId),periodMonth:month,bonusInsentif:parseRupiah(card.querySelector('.js-insentif').value),bonusKpi:parseRupiah(card.querySelector('.js-kpi').value),note:card.querySelector('.js-note').value});
        msg.className='payroll-save-msg ok';msg.textContent='Tersimpan.';await loadPayroll(false);
      }catch(err){msg.className='payroll-save-msg err';msg.textContent=err?.message||'Gagal menyimpan.';}finally{btn.disabled=false;}
    }));
  }

  async function maybeLoad(){syncHeaderContext();if(!el('payrollBranch').value){el('payrollList').innerHTML='';el('payrollPending').hidden=true;el('payrollStatus').textContent='Pilih cabang untuk melihat payroll.';return;}await loadPayroll();}

  async function loadPayroll(showLoading=true){
    const branchId=el('payrollBranch').value,employeeId=el('payrollEmployee').value||null,month=selectedMonth||todayMonth(),start=`${month}-01`,end=monthEnd(month);
    if(showLoading)el('payrollStatus').textContent='Memuat payroll…';
    try{
      manualMonth=await PayrollManualAdjustmentStore.loadMonth(month);const adjustments=PayrollManualAdjustmentStore.toEngineAdjustments(manualMonth);
      const result=await PayrollUnifiedEngine.loadPeriod({start,end,branchId,employeeId,adjustments});salaryData=result.salaryData||salaryData;
      renderPending(result.pendingSummary);el('payrollList').innerHTML=result.payroll.length?result.payroll.map(renderCard).join(''):'<div class="payroll-empty">Tidak ada payroll pada filter ini.</div>';
      bindMoneyInputs();bindSalarySave();bindBonusSave(month);
      const branchName=el('payrollBranch').selectedOptions[0]?.textContent||'—',missing=result.payroll.filter(r=>r.salaryMissing).length;
      el('payrollStatus').className='payroll-status';el('payrollStatus').textContent=`${branchName} · ${result.payroll.length} karyawan · ${monthLabel(month)} · Gaji Pokok ${money(result.totals.gajiPokok)} · Denda ${money(result.totals.denda)} · Kasbon ${money(result.totals.kasbon)} · Gaji Bersih ${money(result.totals.gajiBersih)}${missing?` · ${missing} master gaji belum diset`:''}`;syncHeaderContext();
    }catch(err){el('payrollStatus').className='payroll-status is-error';el('payrollStatus').textContent=err?.message||'Gagal memuat payroll.';el('payrollList').innerHTML='';}
  }

  async function init(){
    if(!el('payrollBranch'))return;selectedMonth=todayMonth();el('payrollPeriodLabel').textContent=monthLabel(selectedMonth);periodYear=Number(selectedMonth.slice(0,4));
    try{await loadMaster();}catch(err){el('payrollStatus').className='payroll-status is-error';el('payrollStatus').textContent=err?.message||'Gagal memuat master payroll.';return;}
    el('payrollBranch').addEventListener('change',async()=>{refreshEmployeeOptions();renderFancySelect(el('payrollBranch'));syncHeaderContext();await maybeLoad();});
    el('payrollEmployee').addEventListener('change',()=>{renderFancySelect(el('payrollEmployee'));maybeLoad();});el('payrollRefresh').addEventListener('click',()=>maybeLoad());
    el('payrollPeriodBtn').addEventListener('click',openPeriod);el('payrollYearPrev').addEventListener('click',()=>{periodYear--;renderPeriodGrid();});el('payrollYearNext').addEventListener('click',()=>{periodYear++;renderPeriodGrid();});
    document.querySelectorAll('[data-payroll-period-close]').forEach(x=>x.addEventListener('click',closePeriod));document.addEventListener('click',e=>{if(!e.target.closest('.payroll-select-shell'))closeFancySelects();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFancySelects();if(!el('payrollPeriodModal').hidden)closePeriod();}});
    el('payrollPrint').addEventListener('click',()=>window.PayrollCapsterPrint?.open('print'));el('payrollPdf').addEventListener('click',()=>window.PayrollCapsterPrint?.open('pdf'));syncHeaderContext();setTimeout(syncHeaderContext,250);
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
