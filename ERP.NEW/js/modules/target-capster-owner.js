(()=>{'use strict';
const $=id=>document.getElementById(id);let items=[],pickerYear=2026;
const money=n=>n==null?'—':'Rp'+Math.round(Number(n||0)).toLocaleString('id-ID');
const pct=n=>n==null?'—':Math.round(Number(n))+'%';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const monthNow=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).formatToParts(new Date());const y=parts.find(x=>x.type==='year')?.value,m=parts.find(x=>x.type==='month')?.value;return y+'-'+m;};
const monthNames=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function statusClass(s){return s==='FINISH'?'finish':s==='EVALUASI'?'eval':s==='MENUNGGU_BASELINE'?'wait':s==='DATA_REVIEW'?'review':''}
function syncMonthLabel(){
 const value=$('tcoMonth').value||monthNow(),[y,m]=value.split('-').map(Number);
 $('tcoMonthLabel').textContent=(monthNames[m-1]||'Bulan')+' '+y;
 pickerYear=y;$('tcoYearLabel').textContent=String(pickerYear);
}
function renderMonthGrid(){
 const grid=$('tcoMonthGrid'),current=monthNow(),selected=$('tcoMonth').value||current;
 const [cy,cm]=current.split('-').map(Number);
 grid.innerHTML=monthNames.map((name,i)=>{
   const month=i+1,value=pickerYear+'-'+String(month).padStart(2,'0');
   const future=pickerYear>cy||(pickerYear===cy&&month>cm);
   const beforeStart=pickerYear<2026||(pickerYear===2026&&month<9);
   const disabled=future||beforeStart;
   return '<button type="button" class="tco-month-option'+(value===selected?' is-active':'')+'" data-month="'+value+'" '+(disabled?'disabled':'')+'>'+name.slice(0,3)+'</button>';
 }).join('');
 $('tcoYearLabel').textContent=String(pickerYear);
 $('tcoYearPrev').disabled=pickerYear<=2026;
 $('tcoYearNext').disabled=pickerYear>=cy;
}
function toggleMonthPicker(force){
 const pop=$('tcoMonthPopover'),trigger=$('tcoMonthTrigger');
 const open=typeof force==='boolean'?force:pop.hidden;
 pop.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
 if(open){const y=Number(($('tcoMonth').value||monthNow()).slice(0,4));pickerYear=y;renderMonthGrid();}
}
function initMonthPicker(){
 $('tcoMonthTrigger').addEventListener('click',e=>{e.stopPropagation();toggleMonthPicker();});
 $('tcoYearPrev').addEventListener('click',e=>{e.stopPropagation();if(pickerYear>2026){pickerYear--;renderMonthGrid();}});
 $('tcoYearNext').addEventListener('click',e=>{e.stopPropagation();const cy=Number(monthNow().slice(0,4));if(pickerYear<cy){pickerYear++;renderMonthGrid();}});
 $('tcoMonthGrid').addEventListener('click',e=>{const btn=e.target.closest('[data-month]');if(!btn||btn.disabled)return;$('tcoMonth').value=btn.dataset.month;syncMonthLabel();toggleMonthPicker(false);void load();});
 document.addEventListener('click',e=>{if(!$('tcoMonthPopover').hidden&&!e.target.closest('.tco-toolbar label:first-child'))toggleMonthPicker(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleMonthPicker(false);});
}
function render(){
 const body=$('tcoBody'); if(!items.length){body.innerHTML='<tr><td colspan="8" class="tco-empty">Tidak ada data Capster.</td></tr>';return;}
 body.innerHTML=items.map(x=>{const p=x.achievement_pct==null?null:Number(x.achievement_pct),cls=p==null?'':p<50?'is-low':p<100?(p>=80?'is-near':''):'is-finish';const width=p==null?0:Math.min(100,Math.max(0,p));return '<tr><td><span class="tco-name">'+esc(x.name)+'</span></td><td><span class="tco-branch">'+esc(String(x.cabang_name||'').replace(/vax\s*wijaya/ig,'').trim())+'</span></td><td class="tco-money">'+money(x.target_amount)+'</td><td class="tco-money">'+money(x.realization_amount)+'</td><td><div class="tco-progress '+cls+'"><div class="tco-progress-top"><strong>'+pct(p)+'</strong><span>'+((x.seasonal_flag)?'Seasonal':'')+'</span></div><div class="tco-progress-bar"><span class="tco-progress-fill" style="width:'+width+'%"></span></div></div></td><td class="tco-money">'+money(x.remaining_amount)+'</td><td>'+Number(x.miss_streak||0)+' bln</td><td><span class="tco-status '+statusClass(x.status)+'">'+esc(x.status)+'</span>'+(x.seasonal_event?'<span class="tco-seasonal">'+esc(x.seasonal_event)+'</span>':'')+'</td></tr>'}).join('');
 $('sumTotal').textContent=items.length;$('sumActive').textContent=items.filter(x=>x.target_amount!=null).length;$('sumFinish').textContent=items.filter(x=>x.status==='FINISH').length;$('sumEval').textContent=items.filter(x=>x.status==='EVALUASI').length;$('sumWait').textContent=items.filter(x=>x.status==='MENUNGGU_BASELINE').length;
}
async function load(){
 $('tcoBody').innerHTML='<tr><td colspan="8" class="tco-empty">Memuat data…</td></tr>';
 const month=($('tcoMonth').value||monthNow())+'-01',branch=$('tcoBranch').value?Number($('tcoBranch').value):null;
 try{const {data,error}=await db.rpc('owner_capster_target_monitor',{p_month:month,p_cabang_id:branch});if(error)throw error;const p=Array.isArray(data)?data[0]:data;if(!p?.ok)throw new Error(p?.reason||'LOAD_FAILED');items=Array.isArray(p.items)?p.items:[];if(!$('tcoBranch').dataset.ready){$('tcoBranch').innerHTML='<option value="">Semua Cabang</option>'+p.branches.map(b=>'<option value="'+b.id+'">'+esc(b.name)+'</option>').join('');$('tcoBranch').dataset.ready='1';$('tcoBranch').value=branch??'';}$('tcoAsOf').textContent='Data s.d. '+String(p.as_of||'—');render();}
 catch(e){console.error(e);$('tcoBody').innerHTML='<tr><td colspan="8" class="tco-empty">Gagal memuat data Target Capster.</td></tr>';}
}
async function init(){
 const ok=await OwnerAuth.requireOwnerOnly();if(!ok)return;
 await Promise.all([loadComponent('sidebar','../components/sidebar.html'),loadComponent('header','../components/header.html')]).catch(()=>{});
 OwnerAuth.bindUi?.();OwnerAuth.syncHeader?.();OwnerAuth.applyAccessControl?.();initErpShellChrome?.();
 document.querySelectorAll('.sidebar .menu-item').forEach(el=>el.classList.remove('active'));document.querySelector('[data-erp-nav="target-capster"]')?.classList.add('active');
 const hc=$('erpHeaderCabang');if(hc)hc.textContent='Target Capster';const hp=$('erpHeaderPeriode');if(hp)hp.textContent='Owner';
 $('tcoMonth').value=monthNow();syncMonthLabel();initMonthPicker();
 $('tcoRefresh').addEventListener('click',load);$('tcoBranch').addEventListener('change',load);
 await load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else void init();
})();