(()=>{'use strict';
const $=id=>document.getElementById(id);
let role='',items=[],selectedId=null,detail=null,loading=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
const label=s=>String(s||'').replaceAll('_',' ');
const eventTone=s=>({MENUNGGU_SVP:'waiting',DITERIMA_SVP:'accepted',DALAM_PENANGANAN:'handling',MENUNGGU_INFO:'info',MENUNGGU_TINDAKAN:'action',ESKALASI_OWNER:'owner',SELESAI_MENUNGGU_KONFIRMASI:'confirm',SELESAI:'done',DITUTUP_OTOMATIS:'done',DIBUKA_KEMBALI:'reopened'}[String(s||'').toUpperCase()]||'neutral');
const now=()=>Date.now();
const statusTone=s=>s==='SELESAI'?'done':s==='ESKALASI_OWNER'?'owner':s==='MENUNGGU_SVP'?'waiting':'';
const priorityTone=p=>p==='KRITIS'?'critical':p==='TINGGI'?'high':'';
const isClosed=s=>['SELESAI','DITUTUP_OTOMATIS'].includes(String(s||''));
function filters(){
 return {
   status:$('filterStatus').value,
   priority:$('filterPriority').value,
   branch:$('filterBranch').value,
   search:$('filterSearch').value.trim().toLowerCase()
 };
}
function filteredItems(){
 const f=filters();
 return items.filter(x=>
   (!f.status||x.status===f.status)&&
   (!f.priority||x.priority===f.priority)&&
   (!f.branch||String(x.cabang_id)===f.branch)&&
   (!f.search||[x.ticket_no,x.employee_name,x.subject,x.cabang_name,x.category].some(v=>String(v||'').toLowerCase().includes(f.search)))
 );
}
function renderStats(){
 $('heroOpen').textContent=items.filter(x=>!isClosed(x.status)).length;
 $('heroEscalated').textContent=items.filter(x=>x.status==='ESKALASI_OWNER').length;
 $('sumWaiting').textContent=items.filter(x=>x.status==='MENUNGGU_SVP').length;
 $('sumHandling').textContent=items.filter(x=>['DITERIMA_SVP','DALAM_PENANGANAN','MENUNGGU_INFO','MENUNGGU_TINDAKAN','DIBUKA_KEMBALI'].includes(x.status)).length;
 $('sumSla').textContent=items.filter(x=>!isClosed(x.status)&&new Date(x.sla_due_at).getTime()<now()).length;
 $('sumEscalated').textContent=items.filter(x=>x.status==='ESKALASI_OWNER').length;
 $('sumDone').textContent=items.filter(x=>isClosed(x.status)).length;
}
function renderBranches(){
 const select=$('filterBranch'),current=select.value;
 const map=new Map();
 items.forEach(x=>{if(x.cabang_id!=null)map.set(String(x.cabang_id),x.cabang_name||('Cabang '+x.cabang_id));});
 select.innerHTML='<option value="">Semua Cabang</option>'+[...map.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
 if([...map.keys()].includes(current))select.value=current;
}
function renderList(){
 const list=filteredItems();
 $('listCount').textContent=list.length+' tiket';
 $('emptyTickets').hidden=list.length>0;
 $('ticketList').innerHTML=list.map(x=>{
   const overdue=!isClosed(x.status)&&new Date(x.sla_due_at).getTime()<now();
   return '<article class="pgs-ticket '+(Number(x.id)===Number(selectedId)?'is-active':'')+'" data-id="'+x.id+'" role="button" tabindex="0" aria-label="Buka '+esc(x.ticket_no)+'">'+
     '<div class="pgs-ticket-top"><span class="pgs-ticket-no">'+esc(x.ticket_no)+'</span><span class="pgs-mini '+statusTone(x.status)+'">'+esc(label(x.status))+'</span></div>'+
     '<h3>'+esc(x.subject)+'</h3>'+
     '<div class="pgs-ticket-person">'+esc(x.employee_name)+' · '+esc(x.cabang_name||'—')+'</div>'+
     '<div class="pgs-ticket-meta"><span class="pgs-mini '+priorityTone(x.priority)+'">'+esc(x.priority)+'</span><span>'+esc(label(x.category))+'</span><span>'+x.age_days+' hari</span>'+(overdue?'<span class="pgs-mini critical">LEWAT SLA</span>':'')+'</div>'+
   '</article>';
 }).join('');
}
function renderAll(){renderStats();renderBranches();renderList();}
async function loadQueue(){
 if(loading)return;loading=true;
 try{
   const {data,error}=await db.rpc('erp_pengaduan_queue',{p_status:null});
   if(error||!data?.ok)throw error||new Error(data?.reason||'QUEUE_FAILED');
   role=String(data.role||'').toUpperCase();items=data.items||[];
   $('pgsRoleLabel').textContent=role==='OWNER'?'OWNER · PENGADUAN':'SVP · PENGADUAN';
   renderAll();
 }finally{loading=false;}
}
function answerLabel(k){
 const m={item:'Alat / kebutuhan',since:'Sejak kapan',duration:'Durasi masalah',self_fix:'Upaya perbaikan sendiri',current_condition:'Kondisi saat ini',reported_before:'Pernah diadukan sebelumnya',impact:'Dampak ke pekerjaan',facility:'Fasilitas',temporary_action:'Tindakan sementara',issue:'Masalah',frequency:'Frekuensi kejadian',direct_resolution:'Upaya penyelesaian langsung',expected_help:'Bantuan yang diharapkan',action_taken:'Tindakan yang sudah dilakukan'};
 return m[k]||String(k).replaceAll('_',' ');
}
function actionButtons(){
 if(!detail)return '';
 const s=detail.status;
 if(isClosed(s))return '<span class="pgs-mini done">TIKET SUDAH DITUTUP</span>';
 if(s==='SELESAI_MENUNGGU_KONFIRMASI')return '<span class="pgs-mini high">MENUNGGU KONFIRMASI KARYAWAN</span>';
 if(role==='SVP'){
   const btn=[];
   if(s==='MENUNGGU_SVP'||s==='DIBUKA_KEMBALI')btn.push(['ACCEPT','Terima Pengaduan','primary']);
   if(['DITERIMA_SVP','MENUNGGU_INFO','MENUNGGU_TINDAKAN','DIBUKA_KEMBALI'].includes(s))btn.push(['START','Mulai / Lanjut Tangani','primary']);
   if(['DITERIMA_SVP','DALAM_PENANGANAN','MENUNGGU_TINDAKAN'].includes(s))btn.push(['WAIT_INFO','Minta Info Tambahan','warning']);
   if(['DITERIMA_SVP','DALAM_PENANGANAN','MENUNGGU_INFO'].includes(s))btn.push(['WAIT_ACTION','Menunggu Tindakan','warning']);
   if(['DITERIMA_SVP','DALAM_PENANGANAN','MENUNGGU_INFO','MENUNGGU_TINDAKAN','DIBUKA_KEMBALI'].includes(s))btn.push(['RESOLVE','Nyatakan Selesai','success']);
   if(s!=='ESKALASI_OWNER')btn.push(['ESCALATE_OWNER','Eskalasi ke Owner','danger']);
   return btn.map(([a,t,c])=>'<button type="button" data-action="'+a+'" class="'+c+'">'+t+'</button>').join('');
 }
 if(role==='OWNER'){
   if(s!=='ESKALASI_OWNER'&&s!=='DIBUKA_KEMBALI')return '<span class="pgs-mini">MONITORING OWNER · BELUM DIEskalasi</span>';
   return [
     '<button type="button" data-action="START" class="primary">Ambil Alih / Mulai Tangani</button>',
     '<button type="button" data-action="WAIT_ACTION" class="warning">Menunggu Tindakan</button>',
     '<button type="button" data-action="WAIT_INFO" class="warning">Minta Info Tambahan</button>',
     '<button type="button" data-action="RESOLVE" class="success">Nyatakan Selesai</button>'
   ].join('');
 }
 return '';
}
function setEstimateInput(v){
 const el=$('actionEstimate');
 if(!v){el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));return;}
 const d=new Date(v);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
 const g=t=>parts.find(x=>x.type===t)?.value||'00';
 el.value=g('year')+'-'+g('month')+'-'+g('day')+'T'+g('hour')+':'+g('minute');el.dispatchEvent(new Event('input',{bubbles:true}));
}
function setDetailMode(open){document.querySelector('.pgs-shell')?.classList.toggle('is-detail-open',!!open);}
function closeDetail(){
 selectedId=null;detail=null;renderList();setDetailMode(false);
 $('detailContent').hidden=true;$('detailEmpty').hidden=false;
 $('detailEmpty').innerHTML='<div class="pgs-empty-icon">⚑</div><strong>Pilih tiket pengaduan</strong><p>Detail, rangkuman ERP, tindakan, SLA, dan timeline akan tampil di sini.</p>';
 history.replaceState(null,'','pengaduan.html');
 window.scrollTo({top:0,behavior:'smooth'});
}
function openStaffPhotoViewer(url){
 if(!url)return;
 $('staffPhotoViewerImage').src=url;
 $('staffPhotoViewer').hidden=false;
 document.body.classList.add('pgs-photo-viewer-open');
}
function closeStaffPhotoViewer(){
 $('staffPhotoViewer').hidden=true;
 $('staffPhotoViewerImage').src='';
 document.body.classList.remove('pgs-photo-viewer-open');
}
async function loadStaffPhotos(ticketId){
 const section=$('staffPhotoSection'),gallery=$('staffPhotoGallery');
 gallery.replaceChildren();section.hidden=true;
 try{
   const {data:{session}}=await db.auth.getSession();
   const access=session?.access_token||'';
   if(!access)return;
   const res=await fetch(SUPABASE_URL+'/functions/v1/pengaduan-photo?ticket_id='+encodeURIComponent(ticketId),{
     headers:{Authorization:'Bearer '+access,apikey:SUPABASE_KEY}
   });
   const payload=await res.json();
   if(!res.ok||!payload?.ok)throw new Error(payload?.reason||'PHOTO_LOAD_FAILED');
   const items=Array.isArray(payload.items)?payload.items:[];
   if(!items.length)return;
   section.hidden=false;
   for(const item of items){
     const card=document.createElement('article');card.className='pgs-photo-card'+(item.deleted?' is-deleted':'');
     if(item.deleted||!item.signed_url){
       card.innerHTML='<div class="pgs-photo-expired"><span>▧</span><strong>Foto arsip</strong><small>File dihapus otomatis setelah 40 hari. History tetap tersimpan.</small></div>';
     }else{
       const img=document.createElement('img');img.src=item.signed_url;img.loading='lazy';img.alt='Foto pengaduan';
       img.addEventListener('click',()=>openStaffPhotoViewer(item.signed_url));card.appendChild(img);
     }
     const meta=document.createElement('div');meta.className='pgs-photo-meta';
     meta.innerHTML='<span>'+esc(fmt(item.created_at))+'</span><small>'+esc(item.original_name||'Foto')+'</small>';
     card.appendChild(meta);gallery.appendChild(card);
   }
 }catch(e){console.warn('[Pengaduan gallery]',e);section.hidden=true;}
}
function renderDetail(data){
 detail=data.ticket;setDetailMode(true);
 $('detailEmpty').hidden=true;$('detailContent').hidden=false;
 $('detailTicketNo').textContent=detail.ticket_no;
 $('detailSubject').textContent=detail.subject;
 $('detailPerson').textContent=[detail.employee_name,detail.employee_job,detail.cabang_name].filter(Boolean).join(' · ');
 $('detailPriority').textContent=detail.priority;
 $('detailStatus').textContent=label(detail.status);
 $('detailAge').textContent=detail.age_days+' hari';
 $('detailSla').textContent=fmt(detail.sla_due_at);
 $('detailEscalateAt').textContent=fmt(detail.owner_escalate_at);
 $('detailEstimate').textContent=detail.estimate_at?fmt(detail.estimate_at):'Belum ditentukan';
 $('detailSummary').textContent=detail.summary||detail.description||'—';
 $('detailSensitive').hidden=!detail.sensitive;
 const answers=detail.answers||{};
 $('answerGrid').innerHTML=Object.entries(answers).map(([k,v])=>'<div class="pgs-answer"><span>'+esc(answerLabel(k))+'</span><strong>'+esc(v)+'</strong></div>').join('')||'<div class="pgs-answer"><strong>Tidak ada jawaban intake.</strong></div>';
 setEstimateInput(detail.estimate_at);
 $('actionButtons').innerHTML=actionButtons();
 $('actionNote').value='';
 $('actionMessage').textContent='';
 $('timeline').innerHTML=(data.timeline||[]).map(e=>{const s=e.status_to||e.event;return '<div class="pgs-event tone-'+eventTone(s)+'"><strong>'+esc(label(s))+'</strong><small>'+esc(e.actor)+' · '+fmt(e.created_at)+'</small>'+(e.message?'<p>'+esc(e.message)+'</p>':'')+'</div>';}).join('');
 void loadStaffPhotos(detail.id);
}
async function openTicket(id){
 selectedId=Number(id);renderList();
 try{
   const {data,error}=await db.rpc('erp_pengaduan_detail',{p_pengaduan_id:selectedId});
   if(error||!data?.ok)throw error||new Error(data?.reason||'DETAIL_FAILED');
   renderDetail(data);
   try{await db.rpc('erp_pengaduan_notifications_mark_ticket',{p_pengaduan_id:selectedId});}catch(_){}
   try{window.ERPGlobalNotifications?.refresh?.();}catch(_){}
   history.replaceState(null,'','pengaduan.html?ticket='+encodeURIComponent(selectedId));
 }catch(e){
   console.error('[Pengaduan detail]',e);
   $('detailContent').hidden=true;$('detailEmpty').hidden=false;
   $('detailEmpty').innerHTML='<div class="pgs-detail-error"><div><strong>Detail pengaduan gagal dimuat</strong><p>'+esc(e?.message||'Terjadi kesalahan saat membuka tiket.')+'</p></div></div>';
   throw e;
 }
}
function estimateIso(){
 const v=$('actionEstimate').value;
 if(!v)return null;
 return new Date(v).toISOString();
}
async function performAction(action){
 if(!selectedId)return;
 const note=$('actionNote').value.trim();
 const estimate=estimateIso();
 if(action==='START'&&!estimate&&!detail?.estimate_at){
   $('actionMessage').textContent='Estimasi selesai wajib ditentukan sebelum mulai penanganan.';
   document.querySelector('.pgs-estimate-trigger')?.click();
   return;
 }
 if(action==='ESCALATE_OWNER'&&!note){$('actionMessage').textContent='Alasan eskalasi ke Owner wajib diisi.';return;}
 if(['WAIT_INFO','WAIT_ACTION','RESOLVE'].includes(action)&&!note){$('actionMessage').textContent='Catatan tindakan wajib diisi untuk status ini.';return;}
 const btns=[...$('actionButtons').querySelectorAll('button')];btns.forEach(b=>b.disabled=true);
 $('actionMessage').textContent='Menyimpan tindakan...';
 try{
   const {data,error}=await db.rpc('erp_pengaduan_action',{
     p_pengaduan_id:selectedId,p_action:action,p_catatan:note||null,p_estimasi_selesai_at:estimate
   });
   if(error||!data?.ok)throw error||new Error(data?.reason||'ACTION_FAILED');
   await loadQueue();await openTicket(selectedId);
   $('actionMessage').textContent='Tindakan berhasil disimpan.';
 }catch(e){console.error(e);$('actionMessage').textContent='Tindakan gagal disimpan: '+(e?.message||'error');}
 finally{btns.forEach(b=>b.disabled=false);}
}
function bind(){
 ['filterStatus','filterPriority','filterBranch'].forEach(id=>$(id).addEventListener('change',renderList));
 $('filterSearch').addEventListener('input',renderList);
 $('btnReload').addEventListener('click',async()=>{await loadQueue();if(selectedId)await openTicket(selectedId);});
 $('ticketList').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(row)openTicket(row.dataset.id).catch(()=>{});});
 $('ticketList').addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const row=e.target.closest('[data-id]');if(!row)return;e.preventDefault();openTicket(row.dataset.id).catch(()=>{});});
 $('btnBackToList').addEventListener('click',closeDetail);
 $('staffPhotoViewerClose').addEventListener('click',closeStaffPhotoViewer);
 $('staffPhotoViewer').addEventListener('click',e=>{if(e.target===$('staffPhotoViewer'))closeStaffPhotoViewer();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('staffPhotoViewer').hidden)closeStaffPhotoViewer();});
 $('actionButtons').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)performAction(b.dataset.action);});
}
async function init(){
 const ok=await OwnerAuth.requireDashboard();if(!ok)return;
 await Promise.all([loadComponent('sidebar','../components/sidebar.html'),loadComponent('header','../components/header.html')]).catch(()=>{});
 OwnerAuth.bindUi?.();OwnerAuth.syncHeader?.();OwnerAuth.applyAccessControl?.();initErpShellChrome?.();
 document.querySelectorAll('.sidebar .menu-item').forEach(el=>el.classList.remove('active'));
 document.querySelector('[data-erp-nav="pengaduan"]')?.classList.add('active');
 const hc=$('erpHeaderCabang');if(hc)hc.textContent='Semua Cabang';
 const hp=$('erpHeaderPeriode');if(hp)hp.textContent='Pengaduan';
 bind();await loadQueue();
 const q=new URLSearchParams(location.search),ticket=q.get('ticket');
 if(ticket){try{await openTicket(ticket);}catch(e){console.error('[Pengaduan deeplink]',e);}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else void init();
})();