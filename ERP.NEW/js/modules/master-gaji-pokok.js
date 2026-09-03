/* ERP VAX — Standalone Master Gaji Pokok Controller */
(() => {
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const rupiah=n=>`Rp ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n||0))}`;
  const parseRupiah=v=>Number(String(v??'').replace(/[^0-9]/g,'')||0);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const MONTHS_LONG=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  let cabangs=[],employees=[],selectedEmployee=null,history=[],calendarYear=0,calendarMonth=0;

  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function isCapster(r){return String(r?.jabatan||'').trim().toLowerCase()==='capster';}
  function isBackupFloating(r){const role=String(r?.jabatan||'').toLowerCase();return role.includes('kasir')&&role.includes('backup')&&role.includes('floating');}
  function dateLabel(date){const [y,m,d]=String(date||'').split('-').map(Number);return y&&m&&d?`${String(d).padStart(2,'0')} ${MONTHS[m-1]} ${y}`:'—';}
  function effectivePeriod(row){if(!row)return '—';return `${dateLabel(row.effectiveFrom)} — ${row.effectiveTo?dateLabel(row.effectiveTo):'seterusnya'}`;}
  function monthRange(date=today()){const [y,m]=String(date).split('-').map(Number),end=new Date(Date.UTC(y,m,0)).getUTCDate();return {start:`${y}-${String(m).padStart(2,'0')}-01`,end:`${y}-${String(m).padStart(2,'0')}-${String(end).padStart(2,'0')}`};}

  async function loadBase(){
    [cabangs,employees]=await Promise.all([PayrollUnifiedEngine.fetchCabang(),PayrollUnifiedEngine.fetchKaryawan()]);
    const branch=el('salaryBranch');
    branch.innerHTML='<option value="">Pilih Cabang</option>'+cabangs.map(c=>`<option value="${c.id}">${esc(c.nama_cabang)}</option>`).join('');
    refreshEmployees();
  }

  function refreshEmployees(){
    const branchId=el('salaryBranch').value,select=el('salaryEmployee');selectedEmployee=null;history=[];renderEmpty();
    if(!branchId){select.disabled=true;select.innerHTML='<option value="">Pilih cabang dulu</option>';el('salaryStatus').textContent='Pilih cabang dan karyawan.';return;}
    const rows=employees.filter(r=>Number(r.cabang_id)===Number(branchId)&&!isCapster(r));
    select.disabled=false;select.innerHTML='<option value="">Pilih Karyawan</option>'+rows.map(r=>`<option value="${r.id}">${esc(r.nama_karyawan)} · ${esc(r.jabatan||'—')}${r.aktif===false?' · nonaktif':''}</option>`).join('');
    const backupCount=rows.filter(isBackupFloating).length;
    el('salaryStatus').textContent=backupCount?`${rows.length} karyawan tersedia. ${backupCount} Kasir Backup / Floating memakai gaji otomatis dari Cash Out Minutes semua cabang.`:`${rows.length} karyawan fixed salary tersedia. Capster tidak masuk master ini karena gaji pokoknya dari provider_share Minutes.`;
  }

  function renderEmpty(){
    el('salaryEmployeeTitle').textContent='Belum memilih karyawan';el('salaryRole').textContent='—';el('salaryCurrentAmount').textContent='—';el('salaryCurrentBasis').textContent='—';el('salaryCurrentPeriod').textContent='—';
    el('salaryHistory').innerHTML='<div class="salary-empty">Pilih karyawan untuk melihat histori gaji.</div>';
  }

  async function renderBackupFloating(){
    const range=monthRange(),result=await PayrollUnifiedEngine.loadPeriod({start:range.start,end:range.end,employeeId:selectedEmployee.id});
    const payroll=(result.payroll||[])[0]||null,daily=(payroll?.daily||[]).filter(r=>Number(r.gajiPokok||0)>0),total=Number(payroll?.summary?.gajiPokok||0),pending=(result.pendingBackupAssignments||[]);
    el('salaryEmployeeTitle').textContent=selectedEmployee.nama_karyawan||'—';
    el('salaryRole').textContent=selectedEmployee.jabatan||'Kasir Backup / Floating';
    el('salaryCurrentAmount').textContent=money(total);
    el('salaryCurrentBasis').textContent='Harian · Cash Out';
    el('salaryCurrentPeriod').textContent=`${dateLabel(range.start)} — ${dateLabel(range.end)}`;
    el('salaryBasis').value='DAILY';el('salaryAmount').value=rupiah(0);el('salaryNote').value='Otomatis dari Backup Cashier Assignment Engine';setEffectiveDate(today());
    el('salaryBasis').disabled=true;el('salaryAmount').disabled=true;el('salaryEffectiveBtn').disabled=true;el('salaryNote').disabled=true;el('salarySave').disabled=true;

    if(!daily.length){
      el('salaryHistory').innerHTML='<div class="salary-empty">Belum ada gaji backup kasir yang berhasil ter-assign untuk karyawan ini pada bulan berjalan.</div>';
    }else{
      el('salaryHistory').innerHTML=`<table><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th>Basis</th><th class="num">Gaji Pokok</th><th>Deteksi</th></tr></thead><tbody>${daily.map(r=>{const meta=(r.cashOutSalaryItems||[])[0]||{};const det=meta.reason==='CASHOUT_NAME'?'Nama Cash Out':meta.reason==='ABSENSI_BRANCH'?'Absensi':meta.reason==='BRANCH_CONTINUITY'?'Continuity Cabang':meta.reason==='REMAINDER_PAIR'?'Pasangan Sisa':'Cash Out Minutes';return `<tr><td>${esc(dateLabel(r.tanggal))}</td><td>${esc(r.cabang||'—')}</td><td>Harian</td><td class="num">${money(r.gajiPokok)}</td><td>${esc(det)}</td></tr>`;}).join('')}</tbody></table>`;
    }
    el('salaryStatus').textContent=`${selectedEmployee.nama_karyawan} otomatis dari Cash Out Minutes semua cabang. Total bulan berjalan ${money(total)} dari ${daily.length} pembayaran terdeteksi.${pending.length?` Ada ${pending.length} transaksi backup yang masih ambigu dan tidak dimasukkan ke siapa pun.`:''}`;
  }

  async function loadEmployee(){
    const id=Number(el('salaryEmployee').value||0);selectedEmployee=employees.find(r=>Number(r.id)===id)||null;if(!selectedEmployee){renderEmpty();return;}
    el('salaryStatus').textContent='Memuat master gaji…';
    if(isBackupFloating(selectedEmployee)){history=[];await renderBackupFloating();return;}
    el('salaryBasis').disabled=false;el('salaryAmount').disabled=false;el('salaryEffectiveBtn').disabled=false;el('salaryNote').disabled=false;el('salarySave').disabled=false;
    history=await PayrollSalaryMasterStore.loadEmployee(id);
    const current=PayrollSalaryMasterStore.rateAt(history,id,today()) || history.slice().sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
    el('salaryEmployeeTitle').textContent=selectedEmployee.nama_karyawan||'—';el('salaryRole').textContent=selectedEmployee.jabatan||'—';el('salaryCurrentAmount').textContent=current?money(current.amount):'Belum diset';el('salaryCurrentBasis').textContent=current?(current.payBasis==='MONTHLY'?'Bulanan':'Harian'):'—';el('salaryCurrentPeriod').textContent=current?effectivePeriod(current):'—';
    if(current){el('salaryBasis').value=current.payBasis;el('salaryAmount').value=rupiah(current.amount);el('salaryNote').value=current.note||'';setEffectiveDate(current.effectiveFrom);}else{el('salaryBasis').value='MONTHLY';el('salaryAmount').value='Rp 0';el('salaryNote').value='';setEffectiveDate(today());}
    renderHistory();el('salaryStatus').textContent=current?`${selectedEmployee.nama_karyawan} · ${selectedEmployee.jabatan} · master aktif ${money(current.amount)} (${current.payBasis==='MONTHLY'?'bulanan':'harian'}). Payroll akan memakai master ini otomatis sesuai tanggal berlaku.`:`${selectedEmployee.nama_karyawan} belum memiliki Master Gaji Pokok.`;
  }

  function renderHistory(){if(!history.length){el('salaryHistory').innerHTML='<div class="salary-empty">Belum ada histori master gaji.</div>';return;}const rows=history.slice().sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom));el('salaryHistory').innerHTML=`<table><thead><tr><th>Berlaku Mulai</th><th>Berlaku Sampai</th><th>Basis</th><th class="num">Nominal</th><th>Catatan</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(dateLabel(r.effectiveFrom))}</td><td>${esc(r.effectiveTo?dateLabel(r.effectiveTo):'Seterusnya')}</td><td>${r.payBasis==='MONTHLY'?'Bulanan':'Harian'}</td><td class="num">${money(r.amount)}</td><td>${esc(r.note||'—')}</td></tr>`).join('')}</tbody></table>`;}
  function setEffectiveDate(date){const v=String(date||'');el('salaryEffectiveDate').value=v;el('salaryEffectiveLabel').textContent=dateLabel(v);}
  function openCalendar(){if(el('salaryEffectiveBtn').disabled)return;const base=el('salaryEffectiveDate').value||today(),[y,m]=base.split('-').map(Number);calendarYear=y;calendarMonth=m-1;renderCalendar();const modal=el('salaryDateModal');modal.hidden=false;modal.setAttribute('aria-hidden','false');el('salaryEffectiveBtn').setAttribute('aria-expanded','true');}
  function closeCalendar(){const modal=el('salaryDateModal');modal.hidden=true;modal.setAttribute('aria-hidden','true');el('salaryEffectiveBtn').setAttribute('aria-expanded','false');}
  function moveMonth(delta){calendarMonth+=delta;if(calendarMonth<0){calendarMonth=11;calendarYear--;}if(calendarMonth>11){calendarMonth=0;calendarYear++;}renderCalendar();}
  function renderCalendar(){el('salaryCalLabel').textContent=`${MONTHS_LONG[calendarMonth]} ${calendarYear}`;const first=new Date(Date.UTC(calendarYear,calendarMonth,1)),days=new Date(Date.UTC(calendarYear,calendarMonth+1,0)).getUTCDate(),mondayIndex=(first.getUTCDay()+6)%7,selected=el('salaryEffectiveDate').value;let html='';for(let i=0;i<mondayIndex;i++)html+='<button type="button" class="salary-day is-muted" tabindex="-1"></button>';for(let d=1;d<=days;d++){const value=`${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;html+=`<button type="button" class="salary-day${selected===value?' is-selected':''}" data-date="${value}">${d}</button>`;}el('salaryDays').innerHTML=html;el('salaryDays').querySelectorAll('[data-date]').forEach(btn=>btn.addEventListener('click',()=>{setEffectiveDate(btn.dataset.date);closeCalendar();}));}
  function bindMoney(){const input=el('salaryAmount'),format=()=>{input.value=rupiah(parseRupiah(input.value));};input.addEventListener('input',format);input.addEventListener('blur',format);input.addEventListener('focus',()=>requestAnimationFrame(()=>input.select()));format();}

  async function save(e){e.preventDefault();const msg=el('salaryFormMsg'),btn=el('salarySave');try{if(!selectedEmployee)throw new Error('Pilih karyawan terlebih dahulu.');if(isBackupFloating(selectedEmployee))throw new Error('Kasir Backup / Floating memakai gaji otomatis dari Cash Out Minutes semua cabang.');const effectiveFrom=el('salaryEffectiveDate').value;if(!effectiveFrom)throw new Error('Pilih tanggal Berlaku Mulai.');btn.disabled=true;msg.className='salary-form-msg';msg.textContent='Menyimpan master gaji…';await PayrollSalaryMasterStore.save({employeeId:selectedEmployee.id,payBasis:el('salaryBasis').value,amount:parseRupiah(el('salaryAmount').value),effectiveFrom,note:el('salaryNote').value});msg.className='salary-form-msg ok';msg.textContent='Master gaji tersimpan. Payroll akan mengambilnya otomatis sesuai periode berlaku.';await loadEmployee();}catch(err){msg.className='salary-form-msg err';msg.textContent=err?.message||'Gagal menyimpan master gaji.';}finally{if(!isBackupFloating(selectedEmployee))btn.disabled=false;}}

  async function init(){if(!el('salaryBranch'))return;setEffectiveDate(today());bindMoney();try{await loadBase();}catch(err){el('salaryStatus').textContent=err?.message||'Gagal memuat master.';return;}el('salaryBranch').addEventListener('change',refreshEmployees);el('salaryEmployee').addEventListener('change',loadEmployee);el('salaryRefresh').addEventListener('click',()=>selectedEmployee?loadEmployee():loadBase());el('salaryForm').addEventListener('submit',save);el('salaryEffectiveBtn').addEventListener('click',openCalendar);el('salaryCalPrev').addEventListener('click',()=>moveMonth(-1));el('salaryCalNext').addEventListener('click',()=>moveMonth(1));document.querySelectorAll('[data-salary-date-close]').forEach(x=>x.addEventListener('click',closeCalendar));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('salaryDateModal').hidden)closeCalendar();});}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
