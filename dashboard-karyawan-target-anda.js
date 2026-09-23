/* Employee Personal Income Target V1 — Capster only; isolated from Owner/Payroll engines. */
(()=>{'use strict';
if(window.__vaxEmployeePersonalTargetV1)return;
window.__vaxEmployeePersonalTargetV1=true;
let root=null,busy=false,observer=null;
const money=n=>'Rp'+Math.round(Number(n||0)).toLocaleString('id-ID');
const monthLabel=iso=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return 'bulan ini';return new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(String(iso)+'T12:00:00Z'));};
const reviewText=reason=>({PROVIDER_UNVERIFIED:'Data provider masih menunggu verifikasi.',PRODUCT_UNVERIFIED:'Data share produk masih menunggu verifikasi.',FINE_NOT_FINAL:'Denda belum final; progress masih sementara.',KASBON_MONTHLY_REVIEW:'Kasbon bulanan masih dalam review; progress sementara.'}[String(reason||'')]||'');
function findAnchor(){return document.querySelector('.employee-monthly-kpi');}
function mount(){
 if(root&&root.isConnected)return root;
 const anchor=findAnchor();if(!anchor)return null;
 root=document.createElement('section');
 root.id='employeePersonalTarget';
 root.className='employee-personal-target stage-red is-loading';
 root.hidden=true;
 root.setAttribute('aria-label','Target pendapatan pribadi Capster');
 root.innerHTML='<div class="employee-personal-target-head"><div class="employee-personal-target-title"><span class="employee-personal-target-icon"><i class="fa-solid fa-star" aria-hidden="true"></i></span><div><h3>TARGET ANDA</h3><small>Target pendapatan otomatis</small></div></div><div class="employee-personal-target-pct"><strong id="personalTargetPct">…</strong><span>Pencapaian</span></div></div><div class="employee-personal-target-money"><div><span>Hak Dibayar</span><strong id="personalTargetRealization">—</strong></div><div><span>Target</span><strong id="personalTargetAmount">—</strong></div></div><div class="employee-personal-target-track-wrap"><div class="employee-personal-target-track" role="progressbar" aria-label="Progress Target Anda" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="employee-personal-target-fill"></span><i class="fa-solid fa-star employee-personal-target-star" aria-hidden="true"></i></div><div class="employee-personal-target-milestones"><span>0%</span><span>50%</span><span>100%</span></div></div><div id="personalTargetStatus" class="employee-personal-target-status">Memuat target Anda…</div><p id="personalTargetNote" class="employee-personal-target-note"></p>';
 anchor.insertAdjacentElement('afterend',root);
 return root;
}
function setUnavailable(message){
 const box=mount();if(!box)return;box.hidden=false;box.className='employee-personal-target stage-red is-unavailable';
 box.querySelector('#personalTargetPct').textContent='—';
 box.querySelector('#personalTargetRealization').textContent='—';
 box.querySelector('#personalTargetAmount').textContent='—';
 box.querySelector('.employee-personal-target-fill').style.width='0%';
 box.querySelector('.employee-personal-target-star').style.left='0%';
 box.querySelector('#personalTargetStatus').textContent=message;
 box.querySelector('#personalTargetNote').textContent='';
}
function render(data){
 const box=mount();if(!box)return;
 const pct=Math.max(0,Number(data.achievement_pct||0));
 const visual=Math.min(100,pct);
 const stage=pct>=100?'finish':pct>=80?'blue':pct>=50?'teal':'red';
 box.hidden=false;box.className='employee-personal-target stage-'+stage;
 box.querySelector('#personalTargetPct').textContent=Math.round(pct)+'%';
 box.querySelector('#personalTargetRealization').textContent=money(data.realization_amount);
 box.querySelector('#personalTargetAmount').textContent=money(data.target_amount);
 const fill=box.querySelector('.employee-personal-target-fill'),star=box.querySelector('.employee-personal-target-star'),track=box.querySelector('.employee-personal-target-track');
 fill.style.width=visual+'%';star.style.left=visual+'%';track.setAttribute('aria-valuenow',String(Math.round(visual)));track.setAttribute('aria-valuetext',Math.round(pct)+'%');
 const status=box.querySelector('#personalTargetStatus');
 if(data.reached){
   status.innerHTML='<strong>FINISH · Target tercapai.</strong> Selamat atas pencapaian Anda bulan ini. Manfaatkan hasil kerja dengan bijak; sisihkan sebagian untuk kebutuhan kerja seperti alat cukur, pakaian kerja, perawatan perlengkapan, atau peningkatan keterampilan, lalu atur sisanya sesuai prioritas Anda.';
 }else{
   const remain=money(data.remaining_amount);
   if(data.evaluation_required){status.innerHTML='<strong>EVALUASI · '+Number(data.miss_streak||3)+' bulan berturut-turut belum mencapai target.</strong> Target tetap dipertahankan. Evaluasi ritme kerja, jumlah customer, kehadiran, dan kondisi cabang bersama SVP.';}else{status.innerHTML=pct>=50?'<strong>Progress '+Math.round(pct)+'%.</strong> Pertahankan ritme kerja. Sisa '+remain+' untuk mencapai target bulan ini.':'<strong>Progress '+Math.round(pct)+'%.</strong> Sisa '+remain+' untuk mencapai target. Fokus pada kualitas layanan dan konsistensi kerja.';}
 }
 const source=data.source_type==='LEGACY_NET_INCOME_SEED'?'Target awal dari Pendapatan Bersih Agustus 2026.':data.source_type==='NEW_EMPLOYEE_HAK_DIBAYAR_SEED'?'Target awal dari 1 bulan kerja valid berdasarkan Hak Dibayar final.':'Target otomatis dari hasil bulan sebelumnya.';
 const review=reviewText(data.review_reason);
 const streak=Number(data.miss_streak||0)>0&&!data.evaluation_required?' '+String(data.evaluation_message||''):''; box.querySelector('#personalTargetNote').textContent=source+(review?' '+review:'')+(data.seasonal_flag?' Bulan sumber ditandai musiman; lonjakan tidak dijadikan baseline normal.':'')+streak;
}
async function refresh(){
 if(busy)return;busy=true;
 try{
   if(typeof KaryawanSession==='undefined'||typeof db==='undefined')return;
   const employee=await KaryawanSession.requirePage();
   const isCapster=String(employee?.jabatan||'').trim().toLowerCase()==='capster';
   const box=mount();if(!box)return;box.hidden=!isCapster;if(!isCapster)return;
   box.classList.add('is-loading');
   const token=KaryawanSession.getToken();
   const res=await db.rpc('karyawan_income_target_status_self',{p_token:token,p_month:null});
   const data=Array.isArray(res.data)?res.data[0]:res.data;
   if(res.error)throw res.error;
   if(!data||data.ok===false){
     if(data?.reason==='BASELINE_UNAVAILABLE'||data?.reason==='NEW_EMPLOYEE_BASELINE_WAIT'){setUnavailable('Target belum aktif. Untuk Capster baru, ERP menunggu minimal 1 bulan kerja valid (sekurangnya 20 hari aktif), data Hak Dibayar final lengkap, dan bulan non-seasonal.');return;}
     throw new Error(data?.reason||'TARGET_UNAVAILABLE');
   }
   render(data);
 }catch(error){console.error('TARGET ANDA failed:',error);setUnavailable('Target Anda belum dapat dimuat dari ERP.');}
 finally{busy=false;}
}
function boot(){
 const tryMount=()=>{if(findAnchor()){observer?.disconnect();observer=null;void refresh();return true;}return false;};
 if(tryMount())return;
 observer=new MutationObserver(()=>{tryMount();});
 observer.observe(document.body,{childList:true,subtree:true});
 setTimeout(()=>{if(!root)void refresh();},1200);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 setInterval(()=>{if(!document.hidden)void refresh();},60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
