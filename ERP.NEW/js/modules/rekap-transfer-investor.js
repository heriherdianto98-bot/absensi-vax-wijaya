(()=>{'use strict';
const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v);
const key=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
let branches=[],master=[],groups=new Map(),busy=false,ready=null,masterSeq=0;
function monthLabel(month){return new Date(month+'-15T12:00:00+07:00').toLocaleDateString('id-ID',{month:'long',year:'numeric',timeZone:'Asia/Jakarta'});}
function invalidate(){ready=null;el('rtResult').hidden=true;el('rtPrint').disabled=true;el('rtPdf').disabled=true;}
function locked(value){busy=value;['lbMonth','rtMonthButton','rtInvestor','rtRefresh'].forEach(id=>el(id).disabled=value);}
function status(s){el('rtStatus').textContent=s;}
async function masters(){
 const seq=++masterSeq;invalidate();locked(true);
 try{
  const month=el('lbMonth').value;if(!/^\d{4}-\d{2}$/.test(month))throw new Error('Pilih bulan yang valid.');
  status('Memuat investor periode '+monthLabel(month)+'…');
  const [y,m]=month.split('-').map(Number),end=LaporanBulananEngine.monthRange(y,m).end;
  const {data,error}=await db.rpc('erp_master_finance_get');if(error)throw error;
  if(seq!==masterSeq)return;
  master=(data?.investor||[]).filter(r=>(!r.effective_from||String(r.effective_from).slice(0,10)<=end)&&(!r.effective_to||String(r.effective_to).slice(0,10)>=end));
  groups=new Map();
  for(const branch of branches){
   const row=LaporanBulananEngine.pickBranchMaster(master,branch.nama_cabang);
   if(!row?.investor_name||Number(row.investor_percent??row.persentase??0)<0)continue;
   const k=key(row.investor_name);if(!groups.has(k))groups.set(k,{name:row.investor_name,branches:[]});
   groups.get(k).branches.push(branch);
  }
  el('rtInvestor').innerHTML='<option value="">Pilih investor</option>'+[...groups.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'id')).map(([k,g])=>'<option value="'+esc(k)+'">'+esc(g.name)+'</option>').join('');
  status(groups.size?'Pilih investor untuk menampilkan rekap transfer.':'Tidak ada investor pada periode ini.');
 }catch(e){status('Gagal membaca master investor: '+e.message);}
 finally{if(seq===masterSeq)locked(false);}
}
async function reportFor(branch,month){
 el('lbBranch').innerHTML='<option value="'+Number(branch.id)+'">'+esc(branch.nama_cabang)+'</option>';
 const [year,mon]=month.split('-').map(Number);
 const response=await fetch('/api/investor-revised/investor/snapshot-latest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({branch:branch.nama_cabang,month})});
 if(!response.ok)throw new Error('Sumber laporan tidak dapat diperiksa (HTTP '+response.status+').');
 const snapshot=await response.json();if(snapshot.ok!==true)throw new Error(snapshot.error||'Gagal membaca sumber laporan.');
 let report;
 if(snapshot.found&&snapshot.snapshot?.payload){
  const snap=snapshot.snapshot;
  if(snap.period_month&&String(snap.period_month).slice(0,7)!==month)throw new Error('Periode snapshot tidak cocok.');
  report=await window.LaporanBulananInvestorRevisedDataBridge.applyPayload(snap.payload);
 }else{
  report=await window.LaporanBulananConsumer.loadMonth({client:db,year,month:mon,cabangId:Number(branch.id)});
  const bridge=window.LaporanBulananOperasionalPayrollDedupBridge;
  if(bridge){
   bridge.apply(report);
   const [mess,free]=await Promise.all([bridge.cashOutTunjanganMessFromSource(report),bridge.cashOutFreePointFromSource(report)]);
   if(Number(mess?.total)>0)bridge.applyMessReclassification(report,mess);
   if(Number(free?.total)>0)bridge.applyFreePointReclassification(report,free);
  }
 }
 if(Number(report?.branch?.id)!==Number(branch.id)||String(report?.range?.start||'').slice(0,7)!==month)throw new Error('Cabang atau periode hasil laporan tidak cocok.');
 if(!report.investor)throw new Error('Investor cabang belum tersedia dalam laporan.');
 for(const field of ['nilaiInvestor','sewaDibayar','totalHakBulanIni'])if(!Number.isFinite(Number(report.investor[field])))throw new Error('Nominal '+field+' tidak valid.');
 return report;
}
function table(rows,total){
 return '<div class="rt-table-wrap"><table class="rt-table"><thead><tr><th>Cabang</th><th class="num">Nilai Investor</th><th class="num">Sewa Dibayar</th><th class="num">Total Transfer</th><th>Keterangan</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.branch.name)+'</td><td class="num">'+money(Number(r.investor.nilaiInvestor))+'</td><td class="num">'+money(Number(r.investor.sewaDibayar))+'</td><td class="num"><strong>'+money(Number(r.investor.totalHakBulanIni))+'</strong></td><td><span class="badge '+(r.readiness?.finalReady===true?'':'pending')+'">'+(r.readiness?.finalReady===true?'FINAL READY':'BELUM FINAL')+'</span>'+(r.readiness?.finalReady===true?'':(r.readiness?.issues||[]).map(i=>'<small>'+esc(i.message||i.code)+'</small>').join(''))+'</td></tr>').join('')+'</tbody><tfoot><tr><td colspan="3">TOTAL TRANSFER INVESTOR</td><td class="num">'+money(total)+'</td><td>'+rows.length+' cabang</td></tr></tfoot></table></div>';
}
async function load(){
 if(busy)return;invalidate();
 const selected=el('rtInvestor').value,group=groups.get(selected),month=el('lbMonth').value;
 if(!group){status('Pilih investor terlebih dahulu.');return;}
 locked(true);
 try{
  const reports=[];
  for(const [index,branch]of group.branches.entries()){
   status('Memuat '+(index+1)+'/'+group.branches.length+' · '+branch.nama_cabang+'…');
   const r=await reportFor(branch,month);
   if(key(r.investor.nama)!==selected)throw new Error('Investor hasil laporan '+branch.nama_cabang+' tidak cocok dengan pilihan.');
   reports.push(r);
  }
  if(reports.length!==group.branches.length||!reports.length)throw new Error('Laporan cabang belum lengkap.');
  const total=reports.reduce((sum,r)=>sum+Number(r.investor.totalHakBulanIni),0);
  const pending=reports.some(r=>r.readiness?.finalReady!==true);
  const period=monthLabel(month),markup=table(reports,total);
  ready={name:group.name,month,period,total:money(total),amount:total,pending,table:markup,reports};
  el('rtName').textContent=group.name;el('rtPeriod').textContent=period;
  el('rtCount').textContent=reports.length+' cabang';el('rtTotal').textContent=money(total);el('rtWords').textContent=window.RekapTransferInvestorPrint.terbilang(total);
  el('rtFinal').textContent=pending?'TERDAPAT CABANG BELUM FINAL':'FINAL READY';
  el('rtTable').innerHTML=markup;el('rtResult').hidden=false;
  el('rtPrint').disabled=false;el('rtPdf').disabled=false;
  status('Rekap '+period+' selesai. Angka mengikuti Laporan Bulanan Investor.');
 }catch(e){invalidate();status('Rekap belum dapat ditampilkan: '+e.message);}
 finally{locked(false);}
}
function print(){
 if(!ready||ready.month!==el('lbMonth').value||key(ready.name)!==el('rtInvestor').value)return;
 try{window.RekapTransferInvestorPrint.open(ready);}catch(e){status(e.message);}
}

function setupCalendar(){
 const names=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
 const dialog=el('rtMonthDialog');let year=Number(el('lbMonth').value.slice(0,4));
 const label=()=>el('rtMonthButton').textContent=monthLabel(el('lbMonth').value)+' ▣';
 const render=()=>{
  el('rtMonthTitle').textContent=String(year);
  el('rtMonthGrid').innerHTML=names.map((n,i)=>'<button type="button" data-month="'+(i+1)+'" '+(el('lbMonth').value===year+'-'+String(i+1).padStart(2,'0')?'aria-pressed="true"':'aria-pressed="false"')+'>'+n+'</button>').join('');
 };
 label();
 el('rtMonthButton').addEventListener('click',()=>{year=Number(el('lbMonth').value.slice(0,4));render();dialog.showModal();});
 el('rtYearPrev').addEventListener('click',()=>{if(year>2000)year--;render();});
 el('rtYearNext').addEventListener('click',()=>{if(year<2100)year++;render();});
 el('rtMonthClose').addEventListener('click',()=>dialog.close());
 el('rtMonthGrid').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-month]');if(!b)return;
  const value=year+'-'+String(b.dataset.month).padStart(2,'0');
  dialog.close();if(value===el('lbMonth').value)return;
  el('lbMonth').value=value;label();el('lbMonth').dispatchEvent(new Event('change',{bubbles:true}));
 });
 dialog.addEventListener('click',ev=>{if(ev.target===dialog){const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)dialog.close();}});
}
async function init(){
 try{
  const allowed=await OwnerAuth.requireOwnerOnly();if(!allowed)return;
  document.body.classList.remove('owner-auth-pending');
  await Promise.all([loadComponent('sidebar','../components/sidebar.html'),loadComponent('header','../components/header.html')]);
  OwnerAuth.bindUi?.();OwnerAuth.syncHeader?.();OwnerAuth.applyAccessControl?.();
  document.querySelector('[data-erp-nav="rekap-transfer-investor"]')?.classList.add('active');
  if(typeof setLaporanMenuOpen==='function')setLaporanMenuOpen(true);
  const {data,error}=await db.from('cabang').select('id,nama_cabang').order('id',{ascending:true});if(error)throw error;
  branches=(data||[]).filter(c=>!String(c.nama_cabang||'').toLowerCase().includes('floating'));
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  el('lbMonth').value=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
  setupCalendar();
  el('lbMonth').addEventListener('change',()=>void masters());
  el('rtInvestor').addEventListener('change',()=>void load());
  el('rtRefresh').addEventListener('click',()=>void load());
  el('rtPrint').addEventListener('click',print);el('rtPdf').addEventListener('click',print);
  await masters();
 }catch(e){document.body.classList.remove('owner-auth-pending');status('Modul belum dapat dibuka: '+e.message);}
}
document.addEventListener('DOMContentLoaded',init,{once:true});
})();
