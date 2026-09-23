(()=>{'use strict';
const $=id=>document.getElementById(id);
let items=[],busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(v+'T12:00:00Z')):'—';
function status(msg,type=''){const el=$('seasonalStatus');if(!el)return;el.textContent=msg||'';el.className='sc-status'+(type?' is-'+type:'');}
function reset(){ $('seasonalId').value='';$('seasonalName').value='';$('seasonalStart').value='';$('seasonalEnd').value='';$('seasonalNotes').value='';$('seasonalEnabled').checked=true;$('seasonalFormTitle').textContent='Tambah Periode Seasonal';status('');}
function render(){
 const host=$('seasonalList');if(!host)return;
 if(!items.length){host.innerHTML='<div class="sc-empty">Belum ada periode seasonal.</div>';return;}
 host.innerHTML=items.map(row=>'<article class="sc-item'+(row.enabled?'':' is-off')+'" data-id="'+row.id+'"><div><h4>'+esc(row.event_name)+'</h4><div class="sc-item-meta"><strong>'+fmtDate(row.start_date)+' — '+fmtDate(row.end_date)+'</strong><span>'+esc(row.source_type||'—')+'</span><span>'+(row.enabled?'AKTIF':'NONAKTIF')+'</span></div>'+(row.notes?'<p>'+esc(row.notes)+'</p>':'')+'</div><div class="sc-item-actions"><button class="sc-action" data-act="edit">Edit</button><button class="sc-action'+(row.enabled?' is-danger':'')+'" data-act="toggle">'+(row.enabled?'Nonaktifkan':'Aktifkan')+'</button></div></article>').join('');
}
async function load(){
 const host=$('seasonalList');if(host)host.innerHTML='<div class="sc-empty">Memuat kalender seasonal…</div>';
 try{const {data,error}=await db.rpc('owner_income_target_seasonal_list');if(error)throw error;const payload=Array.isArray(data)?data[0]:data;if(!payload?.ok)throw new Error(payload?.reason||'LOAD_FAILED');items=Array.isArray(payload.items)?payload.items:[];render();}
 catch(err){console.error('Seasonal calendar load failed:',err);if(host)host.innerHTML='<div class="sc-empty">Gagal memuat kalender seasonal.</div>';}
}
async function save(event){
 event.preventDefault();if(busy)return;
 const id=Number($('seasonalId').value)||null,name=$('seasonalName').value.trim(),start=$('seasonalStart').value,end=$('seasonalEnd').value,notes=$('seasonalNotes').value.trim(),enabled=$('seasonalEnabled').checked;
 if(!name||!start||!end){status('Nama event dan tanggal wajib diisi.','error');return;}
 busy=true;$('seasonalSave').disabled=true;status('Menyimpan…');
 try{const {data,error}=await db.rpc('owner_income_target_seasonal_save',{p_id:id,p_event_name:name,p_start_date:start,p_end_date:end,p_notes:notes||null,p_enabled:enabled});if(error)throw error;const payload=Array.isArray(data)?data[0]:data;if(!payload?.ok)throw new Error(payload?.reason||'SAVE_FAILED');reset();status('Periode seasonal tersimpan.','ok');await load();}
 catch(err){console.error('Seasonal calendar save failed:',err);status('Gagal menyimpan: '+String(err.message||err),'error');}
 finally{busy=false;$('seasonalSave').disabled=false;}
}
async function toggle(id,enabled){
 if(busy)return;busy=true;
 try{const {data,error}=await db.rpc('owner_income_target_seasonal_set_enabled',{p_id:id,p_enabled:enabled});if(error)throw error;const payload=Array.isArray(data)?data[0]:data;if(!payload?.ok)throw new Error(payload?.reason||'UPDATE_FAILED');await load();}
 catch(err){console.error('Seasonal calendar toggle failed:',err);status('Gagal mengubah status periode.','error');}
 finally{busy=false;}
}
function edit(id){
 const row=items.find(x=>Number(x.id)===Number(id));if(!row)return;
 $('seasonalId').value=String(row.id);$('seasonalName').value=row.event_name||'';$('seasonalStart').value=row.start_date||'';$('seasonalEnd').value=row.end_date||'';$('seasonalNotes').value=row.notes||'';$('seasonalEnabled').checked=row.enabled!==false;$('seasonalFormTitle').textContent='Edit Periode Seasonal';status('');window.scrollTo({top:0,behavior:'smooth'});
}
async function init(){
 const ok=await OwnerAuth.requireOwnerOnly();if(!ok)return;
 await Promise.all([loadComponent('sidebar','../components/sidebar.html'),loadComponent('header','../components/header.html')]).catch(()=>{});
 OwnerAuth.bindUi?.();OwnerAuth.syncHeader?.();OwnerAuth.applyAccessControl?.();initErpShellChrome?.();
 document.querySelectorAll('.sidebar .menu-item').forEach(el=>el.classList.remove('active'));document.querySelector('.sidebar [data-erp-nav="settings"]')?.classList.add('active');
 const hc=$('erpHeaderCabang');if(hc)hc.textContent='Kalender Seasonal';const hp=$('erpHeaderPeriode');if(hp)hp.textContent='Owner';
 $('seasonalForm')?.addEventListener('submit',save);$('seasonalReset')?.addEventListener('click',reset);$('seasonalRefresh')?.addEventListener('click',load);
 $('seasonalList')?.addEventListener('click',e=>{const btn=e.target.closest('[data-act]'),card=btn?.closest('[data-id]');if(!btn||!card)return;const id=Number(card.dataset.id),row=items.find(x=>Number(x.id)===id);if(btn.dataset.act==='edit')edit(id);if(btn.dataset.act==='toggle'&&row)void toggle(id,!row.enabled);});
 await load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else void init();
})();