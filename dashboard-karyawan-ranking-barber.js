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
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
