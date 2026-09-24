(()=>{'use strict';
const $=id=>document.getElementById(id);let me=null,tickets=[],current=null,questions=[],selectedPhotos=[];
const token=()=>KaryawanSession.getToken();
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=d=>d?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(d)):'—';
const labelStatus=s=>String(s||'').replaceAll('_',' ');
const PHOTO_MAX=5,PHOTO_MAX_SIZE=5*1024*1024,PHOTO_TYPES=new Set(['image/jpeg','image/png','image/webp']);
function show(id){['homeView','formView','detailView'].forEach(x=>$(x).hidden=x!==id)}
function statusClass(s){return s==='SELESAI'?'done':s==='ESKALASI_OWNER'?'owner':s==='MENUNGGU_SVP'?'wait':''}
function photoEndpoint(ticketId){return SUPABASE_URL+'/functions/v1/pengaduan-photo?ticket_id='+encodeURIComponent(ticketId);}
function employeeHeaders(){return {'x-employee-session-token':token(),'apikey':SUPABASE_KEY};}
async function loadList(){
 const {data,error}=await db.rpc('karyawan_pengaduan_list_self',{p_token:token()});if(error||!data?.ok)throw error||new Error(data?.reason||'LOAD_FAILED');
 tickets=data.items||[];
 $('sumAktif').textContent=tickets.filter(x=>!['SELESAI','DITUTUP_OTOMATIS'].includes(x.status)).length;
 $('sumSvp').textContent=tickets.filter(x=>x.status==='MENUNGGU_SVP').length;
 $('sumOwner').textContent=tickets.filter(x=>x.status==='ESKALASI_OWNER').length;
 $('sumDone').textContent=tickets.filter(x=>['SELESAI','DITUTUP_OTOMATIS'].includes(x.status)).length;
 $('emptyState').hidden=tickets.length>0;
 $('ticketList').innerHTML=tickets.map(x=>'<article class="ticket" data-id="'+x.id+'"><div class="ticket-top"><span class="ticket-no">'+esc(x.ticket_no)+'</span><span class="status '+statusClass(x.status)+'">'+esc(labelStatus(x.status))+'</span></div><h3>'+esc(x.subject)+'</h3><div class="ticket-meta"><span>'+esc(String(x.category).replaceAll('_',' '))+'</span><span>•</span><span>'+x.age_days+' hari</span>'+(x.estimate_at?'<span>• Est. '+fmt(x.estimate_at)+'</span>':'')+'</div></article>').join('');
}
async function loadSchema(){
 const cat=$('kategori').value;if(!cat){$('intakeBox').hidden=true;questions=[];return;}
 const {data,error}=await db.rpc('karyawan_pengaduan_intake_schema',{p_token:token(),p_kategori:cat});if(error||!data?.ok)throw error||new Error(data?.reason||'SCHEMA_FAILED');
 questions=data.questions||[];$('intakeBox').hidden=false;
 $('intakeQuestions').innerHTML=questions.map(q=>'<label class="intake-q">'+esc(q.label)+'<textarea rows="2" data-q="'+esc(q.key)+'" '+(q.required?'required':'')+'></textarea></label>').join('');
}
async function submit(e){
 e.preventDefault();$('btnSubmit').disabled=true;$('formMessage').textContent='Mengirim pengaduan...';
 try{
   const answers={};document.querySelectorAll('[data-q]').forEach(el=>answers[el.dataset.q]=el.value.trim());
   const {data,error}=await db.rpc('karyawan_pengaduan_create',{p_token:token(),p_kategori:$('kategori').value,p_subjek:$('subjek').value.trim(),p_deskripsi:$('deskripsi').value.trim(),p_answers:answers,p_prioritas:$('prioritas').value});
   if(error||!data?.ok)throw error||new Error(data?.reason||'SUBMIT_FAILED');
   $('complaintForm').reset();$('intakeBox').hidden=true;questions=[];$('formMessage').textContent='';
   await loadList();show('homeView');await openDetail(data.id);
 }catch(err){console.error(err);$('formMessage').textContent='Pengaduan belum terkirim. Periksa data dan coba lagi.'}
 finally{$('btnSubmit').disabled=false;}
}
function clearPhotoSelection(){
 selectedPhotos.forEach(x=>{if(x.preview)URL.revokeObjectURL(x.preview)});selectedPhotos=[];$('replyPhotos').value='';renderPhotoSelection();
}
function renderPhotoSelection(){
 const wrap=$('replyPhotoPreview');wrap.replaceChildren();wrap.hidden=selectedPhotos.length===0;
 $('replyPhotoCount').textContent=selectedPhotos.length?selectedPhotos.length+' / 5 foto dipilih':'Maks. 5 foto · JPG/PNG/WebP · 5 MB/foto';
 selectedPhotos.forEach((item,index)=>{
   const card=document.createElement('div');card.className='reply-photo-thumb';
   const img=document.createElement('img');img.src=item.preview;img.alt='Preview foto '+(index+1);
   const remove=document.createElement('button');remove.type='button';remove.setAttribute('aria-label','Hapus foto');remove.innerHTML='×';
   remove.onclick=()=>{URL.revokeObjectURL(item.preview);selectedPhotos.splice(index,1);renderPhotoSelection();};
   card.append(img,remove);wrap.appendChild(card);
 });
}
function addPhotos(fileList){
 const incoming=[...fileList];let error='';
 for(const file of incoming){
   if(selectedPhotos.length>=PHOTO_MAX){error='Maksimal 5 foto dalam satu kali kirim.';break;}
   if(!PHOTO_TYPES.has(file.type)){error='Foto harus berformat JPG, PNG, atau WebP.';continue;}
   if(file.size>PHOTO_MAX_SIZE){error='Ukuran setiap foto maksimal 5 MB.';continue;}
   if(file.size<1)continue;
   selectedPhotos.push({file,preview:URL.createObjectURL(file)});
 }
 $('replyMessage').textContent=error;renderPhotoSelection();$('replyPhotos').value='';
}
function openPhotoViewer(url){
 if(!url)return;$('photoViewerImage').src=url;$('photoViewer').hidden=false;document.body.classList.add('photo-viewer-open');
}
function closePhotoViewer(){
 $('photoViewer').hidden=true;$('photoViewerImage').src='';document.body.classList.remove('photo-viewer-open');
}
async function loadPhotoHistory(ticketId){
 const wrap=$('photoHistoryWrap'),grid=$('photoHistory');grid.replaceChildren();
 try{
   const res=await fetch(photoEndpoint(ticketId),{headers:employeeHeaders()});
   const data=await res.json();if(!res.ok||!data?.ok)throw new Error(data?.reason||'PHOTO_LOAD_FAILED');
   const items=Array.isArray(data.items)?data.items:[];
   wrap.hidden=items.length===0;
   for(const item of items){
     const card=document.createElement('article');card.className='photo-history-item'+(item.deleted?' is-deleted':'');
     if(item.deleted||!item.signed_url){
       card.innerHTML='<div class="photo-expired"><i class="fa-solid fa-image"></i><strong>Foto arsip</strong><span>File foto sudah dihapus otomatis setelah 40 hari. Riwayat tetap tersimpan.</span></div>';
     }else{
       const img=document.createElement('img');img.src=item.signed_url;img.loading='lazy';img.alt='Foto pengaduan';
       img.onclick=()=>openPhotoViewer(item.signed_url);card.appendChild(img);
     }
     const meta=document.createElement('div');meta.className='photo-history-meta';meta.innerHTML='<span>'+esc(fmt(item.created_at))+'</span><small>'+esc(item.original_name||'Foto')+'</small>';card.appendChild(meta);
     grid.appendChild(card);
   }
 }catch(e){console.warn('Gallery pengaduan:',e);wrap.hidden=true;}
}
async function openDetail(id){
 const ticketId=Number(id);
 const {data,error}=await db.rpc('karyawan_pengaduan_detail_self',{p_token:token(),p_pengaduan_id:ticketId});if(error||!data?.ok)throw error||new Error(data?.reason||'DETAIL_FAILED');
 current=data.ticket;$('detailTicket').textContent=current.ticket_no;$('detailSubject').textContent=current.subject;
 $('detailStatus').textContent=labelStatus(current.status);const list=tickets.find(x=>x.id===current.id);$('detailAge').textContent=(list?.age_days??0)+' hari';
 $('detailEstimate').textContent=current.estimate_at?fmt(current.estimate_at):'Belum ditentukan';$('detailPriority').textContent=current.priority;$('detailDescription').textContent=current.description||current.summary||'';
 $('confirmBox').hidden=current.status!=='SELESAI_MENUNGGU_KONFIRMASI';
 const closed=['SELESAI','DITUTUP_OTOMATIS'].includes(current.status);
 $('replyBox').hidden=closed||current.status==='SELESAI_MENUNGGU_KONFIRMASI';
 $('replyTitle').textContent=current.status==='MENUNGGU_INFO'?'SVP meminta informasi tambahan':'Tambahkan informasi';
 $('replyHint').textContent=current.status==='MENUNGGU_INFO'?'Jawab kebutuhan informasi SVP. Bila diminta bukti, lampirkan maksimal 5 foto.':'Gunakan ini bila ada informasi atau foto tambahan untuk SVP.';
 $('replyText').value='';$('replyMessage').textContent='';clearPhotoSelection();
 $('timeline').innerHTML=(data.timeline||[]).map(e=>'<div class="event"><strong>'+esc(labelStatus(e.status_to||e.event))+'</strong><small>'+esc(e.actor)+' · '+fmt(e.created_at)+'</small>'+(e.message?'<p>'+esc(e.message)+'</p>':'')+'</div>').join('');
 await loadPhotoHistory(ticketId);
 try{await db.rpc('karyawan_pengaduan_notifications_mark_ticket',{p_token:token(),p_pengaduan_id:ticketId});}catch(_){}
 show('detailView');
}
async function sendReply(){
 if(!current)return;const message=$('replyText').value.trim();
 if(!message&&!selectedPhotos.length){$('replyMessage').textContent='Tulis informasi atau pilih minimal 1 foto.';return;}
 $('btnReply').disabled=true;$('btnPickPhotos').disabled=true;$('replyMessage').textContent='Mengirim...';
 try{
   if(selectedPhotos.length){
     const form=new FormData();form.append('message',message);selectedPhotos.forEach(x=>form.append('photos',x.file,x.file.name));
     const res=await fetch(photoEndpoint(current.id),{method:'POST',headers:employeeHeaders(),body:form});
     const data=await res.json();if(!res.ok||!data?.ok)throw new Error(data?.reason||'PHOTO_UPLOAD_FAILED');
   }else{
     const {data,error}=await db.rpc('karyawan_pengaduan_reply',{p_token:token(),p_pengaduan_id:current.id,p_message:message});
     if(error||!data?.ok)throw error||new Error(data?.reason||'REPLY_FAILED');
   }
   clearPhotoSelection();await loadList();await openDetail(current.id);$('replyMessage').textContent='Informasi sudah dikirim ke SVP.';
 }catch(e){console.error(e);$('replyMessage').textContent='Informasi/foto belum terkirim. Coba lagi.';}
 finally{$('btnReply').disabled=false;$('btnPickPhotos').disabled=false;}
}
async function confirmResolution(done){
 if(!current)return;const note=done?'Masalah sudah selesai.':'Masalah belum selesai.';
 const {data,error}=await db.rpc('karyawan_pengaduan_confirm_resolution',{p_token:token(),p_pengaduan_id:current.id,p_selesai:done,p_catatan:note});if(error||!data?.ok){alert('Konfirmasi gagal.');return;}
 await loadList();await openDetail(current.id);
}
async function init(){
 me=await KaryawanSession.requirePage();if(!me)return;
 await loadList();
 $('btnNew').onclick=()=>show('formView');$('btnCancel').onclick=()=>show('homeView');$('btnDetailBack').onclick=()=>show('homeView');$('btnRefresh').onclick=loadList;
 $('kategori').addEventListener('change',()=>loadSchema().catch(console.error));$('complaintForm').addEventListener('submit',submit);
 $('ticketList').addEventListener('click',e=>{const card=e.target.closest('[data-id]');if(card)openDetail(card.dataset.id).catch(console.error)});
 $('btnResolvedYes').onclick=()=>confirmResolution(true);$('btnResolvedNo').onclick=()=>confirmResolution(false);$('btnReply').onclick=sendReply;
 $('btnPickPhotos').onclick=()=>$('replyPhotos').click();$('replyPhotos').addEventListener('change',e=>addPhotos(e.target.files||[]));
 $('photoViewerClose').onclick=closePhotoViewer;$('photoViewer').addEventListener('click',e=>{if(e.target===$('photoViewer'))closePhotoViewer();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('photoViewer').hidden)closePhotoViewer();});
 const id=new URLSearchParams(location.search).get('ticket');if(id)openDetail(id).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else void init();
})();