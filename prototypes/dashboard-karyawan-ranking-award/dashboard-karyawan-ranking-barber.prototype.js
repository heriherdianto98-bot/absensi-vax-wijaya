/* Employee-only Barber Ranking. Uses employee-scoped RPC; no Owner engine dependency. */
(()=>{'use strict';
if(window.__vaxEmployeeBarberRankingV1)return;
window.__vaxEmployeeBarberRankingV1=true;
const byId=id=>document.getElementById(id);
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const shortBranch=value=>String(value||'').replace(/vax\s*wijaya/ig,'').replace(/barbershop/ig,'').trim()||String(value||'Cabang');
const isoWib=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(x=>x.type===t)?.value||'';return part('year')+'-'+part('month')+'-'+part('day');};
const selectedDate=()=>byId('employeeDatePicker')?.value||isoWib();
const medal=rank=>rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':String(rank||'—');
let scope='CABANG',requestSeq=0,root=null;
/* Ranking #1 company award notification + one-time celebration 2026-09-26 */
const AWARD_TITLE='SELAMAT, ANDA RANGKING 1 DI SEMUA CABANG';
const AWARD_BODY='Selamat, Anda berhasil meraih Ranking 1 di Semua Cabang. Semoga hasil kerja hari ini membawa rezeki yang baik dan menambah semangat Anda. Gunakan sebagian hasil tersebut untuk menunjang penampilan kerja atau kebutuhan alat kerja agar performa tetap optimal.';
const awardKey=(kind,date,employeeId)=>'vax:ranking1-global:'+kind+':'+String(employeeId||'me')+':'+date;
const storeGet=key=>{try{return localStorage.getItem(key);}catch(_){return null;}};
const storeSet=(key,value='1')=>{try{localStorage.setItem(key,value);return true;}catch(_){return false;}};
const pad2=n=>String(n).padStart(2,'0');
function wibNow(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=t=>parts.find(x=>x.type===t)?.value||'';
  return {date:get('year')+'-'+get('month')+'-'+get('day'),hour:Number(get('hour')||0),minute:Number(get('minute')||0)};
}
function previousIsoDate(iso){
  const d=new Date(iso+'T12:00:00+07:00');d.setDate(d.getDate()-1);
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}
function awardActivityDate(){
  const now=wibNow();
  return now.hour>=22?now.date:previousIsoDate(now.date);
}
async function rankingGlobalFor(date){
  const t=typeof KaryawanSession!=='undefined'?KaryawanSession.getToken():'';
  if(!t||typeof db==='undefined')return null;
  const res=await db.rpc('karyawan_barber_ranking_self',{p_token:t,p_scope:'GLOBAL',p_date:date});
  const payload=Array.isArray(res.data)?res.data[0]:res.data;
  if(res.error||!payload||payload.ok===false)return null;
  return payload;
}
async function ensureRankingNotificationPermission(){
  if(!('Notification' in window)||!window.isSecureContext)return 'unsupported';
  if(Notification.permission!=='default')return Notification.permission;
  try{return await Notification.requestPermission();}catch(_){return Notification.permission;}
}
async function rankingAwardSw(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return null;
  try{return await navigator.serviceWorker.register('dashboard-karyawan-ranking-award-sw.js',{scope:'./'});}catch(error){console.warn('Ranking award service worker:',error);return null;}
}
async function showRankingSystemNotification(payload,date){
  const employeeId=payload?.employee_id||'me';
  const notifiedKey=awardKey('notified',date,employeeId);
  if(storeGet(notifiedKey))return false;
  if(!('Notification' in window)||Notification.permission!=='granted')return false;
  const url=new URL('dashboard-karyawan.html',location.href);
  url.searchParams.set('ranking_award',date);
  const options={
    body:'Anda berhasil menjadi Ranking 1 di Semua Cabang. Ketuk untuk membuka apresiasi.',
    icon:new URL('ERP.NEW/assets/brand/erp-vax-wijaya.png',location.href).href,
    badge:new URL('ERP.NEW/assets/brand/erp-vax-wijaya.png',location.href).href,
    tag:'vax-ranking1-global-'+date+'-'+employeeId,
    renotify:true,
    requireInteraction:true,
    silent:false,
    vibrate:[220,120,220,120,420],
    data:{url:url.href,awardDate:date}
  };
  try{
    const reg=await rankingAwardSw();
    if(reg&&typeof reg.showNotification==='function')await reg.showNotification(AWARD_TITLE,options);
    else new Notification(AWARD_TITLE,options);
    try{if(navigator.vibrate)navigator.vibrate([220,120,220,120,420]);}catch(_){}
    storeSet(notifiedKey);
    return true;
  }catch(error){console.warn('Ranking award notification:',error);return false;}
}
function removeRankingAwardOverlay(){
  document.getElementById('vaxRankingAwardCelebration')?.remove();
  try{if(navigator.vibrate)navigator.vibrate(0);}catch(_){}
}
function showRankingAwardCelebration(payload,date){
  const employeeId=payload?.employee_id||'me';
  const openedKey=awardKey('opened',date,employeeId);
  if(storeGet(openedKey))return;
  storeSet(openedKey);
  const overlay=document.createElement('section');
  overlay.id='vaxRankingAwardCelebration';
  overlay.className='vax-ranking-award';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Apresiasi Ranking 1 Semua Cabang');
  overlay.innerHTML='<div class="vax-ranking-award-confetti" aria-hidden="true"></div><div class="vax-ranking-award-card"><div class="vax-ranking-award-trophy"><i class="fa-solid fa-trophy" aria-hidden="true"></i></div><div class="vax-ranking-award-kicker">PRESTASI HARI INI</div><h2>SELAMAT, ANDA RANGKING 1<br>DI SEMUA CABANG</h2><p>Selamat, Anda berhasil meraih Ranking 1 di Semua Cabang.</p><p>Semoga hasil kerja hari ini membawa rezeki yang baik dan menambah semangat Anda.</p><p>Gunakan sebagian hasil tersebut untuk menunjang penampilan kerja atau kebutuhan alat kerja agar performa tetap optimal.</p><button type="button" class="vax-ranking-award-close">Terima kasih</button></div>';
  const confetti=overlay.querySelector('.vax-ranking-award-confetti');
  const glyphs=['■','●','▲','◆','✦'];
  for(let i=0;i<70;i++){
    const bit=document.createElement('i');
    bit.textContent=glyphs[i%glyphs.length];
    bit.style.setProperty('--x',String((i*37)%101)+'%');
    bit.style.setProperty('--delay',String((i%17)*-0.14)+'s');
    bit.style.setProperty('--dur',String(2.9+(i%9)*0.18)+'s');
    bit.style.setProperty('--drift',String(((i*23)%90)-45)+'px');
    bit.style.setProperty('--rot',String((i*71)%360)+'deg');
    bit.style.setProperty('--hue',String((i*47)%360));
    confetti.appendChild(bit);
  }
  document.body.appendChild(overlay);
  overlay.querySelector('.vax-ranking-award-close')?.addEventListener('click',removeRankingAwardOverlay,{once:true});
  overlay.addEventListener('click',event=>{if(event.target===overlay)removeRankingAwardOverlay();});
  try{if(navigator.vibrate)navigator.vibrate([120,80,120]);}catch(_){}
  const u=new URL(location.href);u.searchParams.delete('ranking_award');history.replaceState(null,'',u.pathname+u.search+u.hash);
  setTimeout(()=>{overlay.classList.add('is-settled');},8000);
}
async function maybeHandleRankingAward(){
  const now=wibNow();
  const queryDate=new URL(location.href).searchParams.get('ranking_award');
  const date=/^\d{4}-\d{2}-\d{2}$/.test(queryDate||'')?queryDate:awardActivityDate();
  if(!queryDate&&now.hour<22&&date===now.date)return;
  const payload=await rankingGlobalFor(date);
  if(!payload||Number(payload.self_rank)!==1||Number(payload.self_total_service||0)<=0)return;
  if(queryDate){showRankingAwardCelebration(payload,date);return;}
  await showRankingSystemNotification(payload,date);
}
function armRankingAwardPermission(){
  if(!('Notification' in window)||Notification.permission!=='default')return;
  const ask=()=>{void ensureRankingNotificationPermission();document.removeEventListener('pointerdown',ask,true);document.removeEventListener('keydown',ask,true);};
  document.addEventListener('pointerdown',ask,true);
  document.addEventListener('keydown',ask,true);
}

function mount(){
 if(root)return root;
 const anchor=document.querySelector('.comm-row')||document.querySelector('.ai-hero');
 if(!anchor)return null;
 root=document.createElement('section');
 root.id='employeeBarberRanking';
 root.className='employee-barber-ranking';
 root.hidden=true;
 root.setAttribute('aria-label','Ranking Barber');
 root.innerHTML='<div class="employee-barber-ranking-head"><div class="employee-barber-ranking-title"><span class="employee-barber-ranking-icon"><i class="fa-solid fa-ranking-star" aria-hidden="true"></i></span><div><h3>Ranking Barber</h3><small>Berdasarkan jumlah service</small></div></div><div class="employee-barber-ranking-self"><strong id="employeeBarberSelfRank">—</strong><span>Posisi Anda</span></div></div><div class="employee-barber-ranking-tabs" role="tablist" aria-label="Lingkup ranking barber"><button type="button" class="employee-barber-ranking-tab is-active" data-ranking-scope="CABANG" role="tab" aria-selected="true">Cabang Saya</button><button type="button" class="employee-barber-ranking-tab" data-ranking-scope="GLOBAL" role="tab" aria-selected="false">Semua Cabang</button></div><p id="employeeBarberRankingStatus" class="employee-barber-ranking-status">Memuat ranking…</p><div id="employeeBarberRankingList" class="employee-barber-ranking-list" role="list"></div>';
 anchor.insertAdjacentElement('beforebegin',root);
 root.addEventListener('click',event=>{const btn=event.target.closest('[data-ranking-scope]');if(!btn)return;const next=btn.getAttribute('data-ranking-scope');if(next===scope)return;scope=next==='GLOBAL'?'GLOBAL':'CABANG';root.querySelectorAll('[data-ranking-scope]').forEach(el=>{const on=el.getAttribute('data-ranking-scope')===scope;el.classList.toggle('is-active',on);el.setAttribute('aria-selected',on?'true':'false');});void refresh();});
 return root;
}
function render(payload){
 const list=byId('employeeBarberRankingList'),status=byId('employeeBarberRankingStatus'),self=byId('employeeBarberSelfRank');
 if(!list||!status||!self)return;
 const items=Array.isArray(payload?.items)?payload.items:[];
 self.textContent=payload?.self_rank?'#'+payload.self_rank:'—';
 status.textContent=(scope==='GLOBAL'?'Semua cabang · ':'Cabang Anda · ')+(payload.activity_date||selectedDate());
 if(!items.length){list.innerHTML='<div class="employee-barber-ranking-empty">Belum ada service barber pada tanggal ini.</div>';return;}
 list.innerHTML=items.map(item=>{const rank=Number(item.rank||0),isSelf=item.is_self===true;const branch=scope==='GLOBAL'?'<span class="employee-barber-ranking-branch">'+esc(shortBranch(item.cabang_name))+'</span>':'';return '<div class="employee-barber-ranking-row'+(isSelf?' is-self':'')+'" role="listitem"><span class="employee-barber-ranking-rank">'+medal(rank)+'</span><div class="employee-barber-ranking-main"><div class="employee-barber-ranking-name"><span>'+esc(item.name||'—')+'</span>'+(isSelf?'<span class="employee-barber-ranking-you">ANDA</span>':'')+'</div>'+branch+'</div><span class="employee-barber-ranking-service">'+Number(item.total_service||0).toLocaleString('id-ID')+' svc</span></div>';}).join('');
}
async function refresh(){
 if(!root||root.hidden)return;
 const seq=++requestSeq,status=byId('employeeBarberRankingStatus'),list=byId('employeeBarberRankingList'),self=byId('employeeBarberSelfRank');
 if(status)status.textContent='Memuat ranking…';if(list)list.innerHTML='';if(self)self.textContent='—';
 const token=typeof KaryawanSession!=='undefined'?KaryawanSession.getToken():'';
 if(!token||typeof db==='undefined'){if(status)status.textContent='Sesi karyawan tidak tersedia.';return;}
 try{const res=await db.rpc('karyawan_barber_ranking_self',{p_token:token,p_scope:scope,p_date:selectedDate()});if(seq!==requestSeq)return;const payload=Array.isArray(res.data)?res.data[0]:res.data;if(res.error||!payload||payload.ok===false)throw res.error||new Error(payload?.reason||'RANKING_UNAVAILABLE');render(payload);}
 catch(error){if(seq!==requestSeq)return;console.error('Employee Barber Ranking failed:',error);if(status)status.textContent='Ranking belum dapat dimuat.';if(list)list.innerHTML='<div class="employee-barber-ranking-empty">Data ranking tidak tersedia.</div>';}
}
async function boot(){
 try{if(typeof KaryawanSession==='undefined')return;const employee=await KaryawanSession.requirePage();const isCapster=String(employee?.jabatan||'').trim().toLowerCase()==='capster';const section=mount();if(!section)return;section.hidden=!isCapster;if(!isCapster)return;await refresh();byId('employeeDatePicker')?.addEventListener('change',()=>{void refresh();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});}
 catch(error){console.error('Employee Barber Ranking boot failed:',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{armRankingAwardPermission();void boot().then(()=>maybeHandleRankingAward());},{once:true});else{armRankingAwardPermission();void boot().then(()=>maybeHandleRankingAward());}
setInterval(()=>{if(!document.hidden)void maybeHandleRankingAward();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void maybeHandleRankingAward();});
})();
