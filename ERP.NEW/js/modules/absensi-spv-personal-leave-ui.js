/* Isolated SPV personal leave UI. Existing attendance, approval and payroll engines are untouched. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let role='',me=null,busy=false,booted=false;
const css=document.createElement('style');css.textContent=`
#spvPersonalLeave,#ownerSpvPersonalLeave{margin:16px 0;padding:19px;border:1px solid #806527;border-radius:17px;background:#1c2229;color:#e8edf3}
#spvPersonalLeave h3,#ownerSpvPersonalLeave h3{margin:0 0 8px;color:#f5d27a;font-size:21px}
#spvPersonalLeave p,#ownerSpvPersonalLeave p{margin:7px 0;color:#c7d0dc}
#spvPersonalLeave .vax-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:13px 0}
#spvPersonalLeave label{display:grid;gap:5px;font-size:14px;font-weight:700}
#spvPersonalLeave input,#spvPersonalLeave textarea,#ownerSpvPersonalLeave textarea{width:100%;padding:11px;border:1px solid #62522c;border-radius:10px;background:#11171e;color:#fff;font:inherit}
#spvPersonalLeave textarea{min-height:76px;grid-column:1/-1}
#spvPersonalLeave button,#ownerSpvPersonalLeave button{padding:10px 14px;border:1px solid #c7a344;border-radius:10px;background:#d8ae36;color:#171717;font-weight:800;cursor:pointer}
#spvPersonalLeave button:disabled,#ownerSpvPersonalLeave button:disabled{opacity:.5;cursor:wait}
#ownerSpvPersonalLeave article{padding:14px;margin-top:12px;border:1px solid #4b5563;border-radius:12px}
#ownerSpvPersonalLeave .vax-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:9px}
#ownerSpvPersonalLeave .vax-reject{background:#57272b;color:#fff;border-color:#94454b}
@media(max-width:650px){#spvPersonalLeave .vax-fields{grid-template-columns:1fr}}
`;document.head.appendChild(css);
function status(id,text){const e=$(id);if(e)e.textContent=text;}
async function identity(){
 const {data:{session},error:e}=await db.auth.getSession();if(e||!session)return null;
 const {data:p,error:pe}=await db.from('profiles').select('role,aktif,karyawan_id').eq('id',session.user.id).maybeSingle();
 if(pe||!p||p.aktif!==true)return null;
 return {role:String(p.role||'').toLowerCase().trim(),karyawan_id:p.karyawan_id};
}
async function myRequests(){
 if(!me?.karyawan_id)return;
 const {data,error}=await db.from('pengajuan_izin').select('tanggal,tanggal_selesai,jenis,status,alasan,created_at').eq('karyawan_id',me.karyawan_id).eq('jenis','LIBUR').order('created_at',{ascending:false}).limit(8);
 status('spvLeaveHistory',error?'Riwayat tidak dapat dimuat: '+error.message:(data?.length?data.map(r=>`${esc(r.tanggal)} s.d. ${esc(r.tanggal_selesai||r.tanggal)} — ${esc(r.status)}`).join(' | '):'Belum ada pengajuan libur pribadi.'));
}
async function submit(event){
 event.preventDefault();if(busy||role!=='spv'&&role!=='svp'||!me?.karyawan_id)return;
 const a=$('spvLeaveStart').value,b=$('spvLeaveEnd').value,reason=$('spvLeaveReason').value.trim();
 if(!a||!b||a<day()||b<a||reason.length<3){status('spvLeaveStatus','Periksa tanggal dan alasan minimal 3 karakter.');return;}
 busy=true;$('spvLeaveSend').disabled=true;status('spvLeaveStatus','Mengirim pengajuan...');
 try{
  const {data:k,error:ke}=await db.from('karyawan').select('id,cabang_id,aktif').eq('id',me.karyawan_id).maybeSingle();
  if(ke||!k||k.aktif!==true||!k.cabang_id)throw new Error('Identitas atau cabang SPV belum valid.');
  const {data,error}=await db.rpc('submit_pengajuan_izin',{p_karyawan_id:k.id,p_cabang_id:k.cabang_id,p_tanggal:a,p_tanggal_selesai:b,p_jenis:'LIBUR',p_alasan:reason,p_bukti_path:null});
  if(error)throw error;
  if(data?.status!=='MENUNGGU_OWNER')throw new Error('Status pengajuan tidak sesuai jalur Owner. Periksa data sebelum mengirim ulang.');
  status('spvLeaveStatus','Pengajuan terkirim. Menunggu keputusan Owner.');$('spvLeaveReason').value='';await myRequests();
 }catch(e){status('spvLeaveStatus','Gagal: '+(e.message||e));}
 finally{busy=false;$('spvLeaveSend').disabled=false;}
}
async function loadOwner(){
 if(role!=='owner')return;status('ownerSpvLeaveState','Memuat pengajuan SPV...');
 const {data,error}=await db.from('pengajuan_izin').select('id,karyawan_id,tanggal,tanggal_selesai,alasan,status,karyawan:karyawan_id(nama_karyawan,jabatan)').eq('jenis','LIBUR').eq('status','MENUNGGU_OWNER').order('created_at',{ascending:true}).limit(60);
 if(error){status('ownerSpvLeaveState','Gagal memuat: '+error.message);return;}
 const ids=[...new Set((data||[]).map(r=>r.karyawan_id))];
 const {data:spvs,error:pe}=ids.length?await db.from('profiles').select('karyawan_id,role,aktif').in('karyawan_id',ids):{data:[],error:null};
 if(pe){status('ownerSpvLeaveState','Gagal memeriksa role pemohon: '+pe.message);return;}
 const allowed=new Set((spvs||[]).filter(p=>p.aktif===true&&['spv','svp'].includes(String(p.role||'').toLowerCase())).map(p=>String(p.karyawan_id)));
 const rows=(data||[]).filter(r=>allowed.has(String(r.karyawan_id))||/(^|[^a-z])(spv|svp|supervisor)([^a-z]|$)/i.test(r.karyawan?.jabatan||''));
 status('ownerSpvLeaveState',rows.length?`${rows.length} pengajuan libur SPV menunggu keputusan Owner.`:'Tidak ada pengajuan libur SPV menunggu Owner.');
 $('ownerSpvLeaveList').innerHTML=rows.map(r=>`<article><strong>${esc(r.karyawan?.nama_karyawan||'SPV')}</strong><p>${esc(r.tanggal)} s.d. ${esc(r.tanggal_selesai||r.tanggal)}</p><p>${esc(r.alasan)}</p><label>Catatan keputusan Owner (wajib)<textarea data-note="${r.id}" maxlength="300" placeholder="Alasan keputusan"></textarea></label><div class="vax-actions"><button type="button" data-review="${r.id}" data-action="APPROVE">ACC Libur</button><button type="button" class="vax-reject" data-review="${r.id}" data-action="REJECT">Tolak</button></div><p role="status" data-message="${r.id}"></p></article>`).join('');
}
async function decide(button){
 if(role!=='owner'||busy)return;const id=Number(button.dataset.review),action=button.dataset.action;
 const card=button.closest('article'),note=card?.querySelector('[data-note]')?.value.trim(),msg=card?.querySelector('[data-message]');
 if(!id||!['APPROVE','REJECT'].includes(action)||!note||note.length<3){if(msg)msg.textContent='Catatan minimal 3 karakter wajib diisi.';return;}
 if(!window.confirm(action==='APPROVE'?'Setujui libur SPV ini?':'Tolak libur SPV ini?'))return;
 busy=true;card.querySelectorAll('button').forEach(b=>b.disabled=true);if(msg)msg.textContent='Menyimpan keputusan...';
 try{const {error}=await db.rpc('review_pengajuan_izin_owner',{p_pengajuan_id:id,p_action:action,p_catatan:note});if(error)throw error;await loadOwner();}
 catch(e){if(msg)msg.textContent='Gagal: '+(e.message||e);card.querySelectorAll('button').forEach(b=>b.disabled=false);}
 finally{busy=false;}
}
async function boot(){
 if(booted||typeof db==='undefined')return;const user=await identity();if(!user)return;
 role=user.role;me=user;if(!['owner','spv','svp'].includes(role))return;
 const host=$('izinSpvEmbed');if(!host)return;booted=true;
 if(role==='owner'){
  const panel=document.createElement('section');panel.id='ownerSpvPersonalLeave';panel.innerHTML='<h3>Persetujuan Libur Pribadi SPV</h3><p>Hanya Owner yang dapat memutuskan pengajuan SPV.</p><button type="button" id="ownerSpvLeaveRefresh">Refresh pengajuan</button><p id="ownerSpvLeaveState" role="status"></p><div id="ownerSpvLeaveList"></div>';
  host.after(panel);$('ownerSpvLeaveRefresh').addEventListener('click',loadOwner);
  $('ownerSpvLeaveList').addEventListener('click',e=>{const btn=e.target.closest('[data-review]');if(btn)decide(btn);});await loadOwner();
 }else{
  const panel=document.createElement('section');panel.id='spvPersonalLeave';panel.innerHTML='<h3>Pengajuan Libur Pribadi SPV</h3><p>Pengajuan pribadi langsung kepada Owner dan tidak dapat disetujui sendiri.</p><form id="spvLeaveForm"><div class="vax-fields"><label>Tanggal mulai<input id="spvLeaveStart" type="date" required></label><label>Tanggal selesai<input id="spvLeaveEnd" type="date" required></label><label style="grid-column:1/-1">Alasan<textarea id="spvLeaveReason" maxlength="300" required placeholder="Tulis alasan libur pribadi"></textarea></label></div><button id="spvLeaveSend" type="submit">Kirim ke Owner</button><p id="spvLeaveStatus" role="status"></p></form><p id="spvLeaveHistory"></p>';
  host.before(panel);$('spvLeaveStart').min=day();$('spvLeaveEnd').min=day();$('spvLeaveStart').addEventListener('change',()=>{$('spvLeaveEnd').min=$('spvLeaveStart').value;if($('spvLeaveEnd').value<$('spvLeaveStart').value)$('spvLeaveEnd').value=$('spvLeaveStart').value;});$('spvLeaveForm').addEventListener('submit',submit);await myRequests();
 }
}
document.addEventListener('erp:finance-ready',()=>{boot().catch(e=>console.error('SPV personal leave UI:',e));});
})();