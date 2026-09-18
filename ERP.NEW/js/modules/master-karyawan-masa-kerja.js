/* ERP VAX Task 2 — additive Owner-only attendance/tenure read and MANUAL salary history.
   Never writes to locked absensi, jadwal, Minutes, or payroll engines. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const owner=()=>!!(window.OwnerAuth?.ready&&window.OwnerAuth?.profile?.aktif===true&&window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role));
const nowDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatDate=s=>s?new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',day:'2-digit',month:'long',year:'numeric'}).format(new Date(s+'T12:00:00Z')):'Belum lengkap';
const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
let active=null,seq=0,busy=false,saved=null;
function tenure(join){
 const out=$('mkwTenure');if(!out)return;
 if(!join){out.textContent='Belum lengkap';return;}
 const current=nowDate();if(join>current){out.textContent='Tanggal belum valid';return;}
 const a=join.split('-').map(Number),b=current.split('-').map(Number);let y=b[0]-a[0],m=b[1]-a[1],d=b[2]-a[2];
 if(d<0){m--;d+=new Date(Date.UTC(b[0],b[1]-1,0)).getUTCDate();}if(m<0){y--;m+=12;}
 out.textContent=`${y} th ${m} bln ${d} hr`;
}
const css=`.mkw-section{margin-top:22px;padding:18px;border:1px solid #665027;border-radius:14px;background:linear-gradient(150deg,#1c2128,#11171d);color:#f4f1e9}.mkw-section h4{color:#f5d47a;font-size:18px;margin:0 0 5px}.mkw-desc{font-size:12px;color:#aeb8c4;margin:0 0 14px;line-height:1.5}.mkw-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.mkw-card{border:1px solid #3b414b;border-radius:10px;padding:12px;background:#141b23;min-width:0}.mkw-card span{display:block;font-size:12px;color:#b5c0cc}.mkw-card strong{display:block;font-size:20px;color:#f6d16c;line-height:1.45;overflow-wrap:anywhere}.mkw-meta{color:#bbc5d0;font-size:12px;line-height:1.55;margin:13px 0 0}.mkw-salary{margin-top:16px;padding-top:15px;border-top:1px solid #50432b}.mkw-salary strong{font-size:18px;color:#f4d078}.mkw-salary label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#c8d0dc;font-weight:700;margin-top:10px}.mkw-salary input,.mkw-salary textarea{box-sizing:border-box;width:100%;background:#111820;border:1px solid #424954;border-radius:9px;color:#fff;padding:10px 12px;font:600 14px 'Source Sans 3',sans-serif;min-height:42px}.mkw-salary textarea{resize:vertical;min-height:58px}.mkw-salary button{margin-top:12px;background:#cfa638;border:1px solid #e7c662;border-radius:9px;padding:9px 14px;color:#201800;font-weight:800;cursor:pointer}.mkw-salary button:disabled{opacity:.5;cursor:wait}.mkw-info{font-size:12px;line-height:1.5;color:#c9d3de;margin:10px 0 0}@media(max-width:620px){.mkw-section{padding:13px}.mkw-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
function init(){
 const form=$('mkiForm');if(!form||$('mkwPanel'))return;
 const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
 const panel=document.createElement('section');panel.id='mkwPanel';panel.className='mkw-section';panel.hidden=true;
 panel.innerHTML=`<h4>Riwayat masa kerja</h4><p class="mkw-desc">Berdasarkan ID karyawan yang sama meskipun pindah cabang. Riwayat ERP mungkin belum mencakup seluruh masa kerja.</p><div class="mkw-cards"><div class="mkw-card"><span>Lama kerja</span><strong id="mkwTenure">—</strong></div><div class="mkw-card"><span>Hadir tercatat</span><strong id="mkwHadir">—</strong></div><div class="mkw-card"><span>Terlambat tercatat</span><strong id="mkwLate">—</strong></div><div class="mkw-card"><span>Libur tercatat</span><strong id="mkwLibur">—</strong></div><div class="mkw-card"><span>Sakit tercatat</span><strong id="mkwSakit">—</strong></div><div class="mkw-card"><span>Izin tercatat</span><strong id="mkwIzin">—</strong></div></div><p id="mkwCoverage" class="mkw-meta" aria-live="polite">Memuat riwayat…</p><div class="mkw-salary"><h4>Total gaji selama masa kerja</h4><p class="mkw-desc">Ledger pembayaran payroll lengkap belum tersedia. Total di bawah hanya input historis manual yang diverifikasi Owner, bukan hasil payroll otomatis atau bukti transfer.</p><strong id="mkwSalaryDisplay">Belum tersedia</strong><p id="mkwSalarySource" class="mkw-info"></p><div id="mkwSalaryControls"><label>Total gaji historis manual (Rp)<input id="mkwSalaryAmount" type="number" min="0" step="1" inputmode="numeric" placeholder="Isi jika total sudah diverifikasi"></label><label>Perhitungan sampai tanggal<input id="mkwSalaryUntil" type="date"></label><label>Catatan / sumber verifikasi<textarea id="mkwSalaryNote" maxlength="1000" placeholder="Contoh: rekap pembayaran manual sampai Agustus 2026"></textarea></label><button type="button" id="mkwSalarySave">Simpan data historis</button><p id="mkwSalaryMessage" class="mkw-info" aria-live="polite"></p></div></div>`;
 form.insertBefore(panel,$('mkiStatus'));
 document.addEventListener('click',event=>{const trigger=event.target.closest?.('#mkBody [data-mki-profile]');if(!trigger||!owner())return;const id=Number(trigger.dataset.mkiProfile);if(!id)return;queueMicrotask(()=>{if($('mkiOverlay')?.classList.contains('is-open'))open(id);});},true);
 document.querySelectorAll('#mkiOverlay [data-mki-close]').forEach(el=>el.addEventListener('click',()=>{active=null;seq++;panel.hidden=true;}));
 $('mkiJoin')?.addEventListener('change',()=>{if(active)tenure($('mkiJoin').value);});
 $('mkwSalarySave').addEventListener('click',save);
}
async function getRows(table,columns,id){const rows=[];for(let start=0;start<10000;start+=1000){const {data,error}=await db.from(table).select(columns).eq('karyawan_id',id).order('tanggal',{ascending:true}).range(start,start+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)return {rows,limited:false};}return {rows,limited:true};}
function status(row,schedule){let code=String((schedule?row.status_canonical:row.status_absensi)||'').trim().toUpperCase();if('HLISOA'.includes(code)&&code.length===1)return code;const legacy=String(row.status||'').trim().toUpperCase();return {HADIR:'H',TERLAMBAT:'H',LIBUR:'L',IZIN:'I',SAKIT:'S',OFF:'O',ALFA:'A'}[legacy]||null;}
async function open(id){
 active=id;const token=++seq;busy=true;saved=null;$('mkwPanel').hidden=false;
 ['mkwTenure','mkwHadir','mkwLate','mkwLibur','mkwSakit','mkwIzin'].forEach(key=>$(key).textContent='—');
 $('mkwCoverage').textContent='Memuat data Absensi dan Jadwal…';$('mkwSalaryDisplay').textContent='Memuat…';$('mkwSalarySource').textContent='';$('mkwSalaryAmount').value='';$('mkwSalaryUntil').value='';$('mkwSalaryNote').value='';$('mkwSalaryMessage').textContent='';
 try{
  const [ident,attendance,schedule,salary]=await Promise.all([db.from('karyawan_identitas').select('tanggal_bergabung').eq('karyawan_id',id).maybeSingle(),getRows('absensi','tanggal,status_absensi,status,terlambat_menit',id),getRows('jadwal_libur','tanggal,status_canonical,status',id),db.from('karyawan_riwayat_gaji_manual').select('total_gaji,periode_sampai,catatan').eq('karyawan_id',id).maybeSingle()]);
  if(active!==id||seq!==token)return;if(ident.error)throw ident.error;if(salary.error)throw salary.error;
  const join=ident.data?.tanggal_bergabung||'';tenure(join);
  const days=new Map(),late=new Set();for(const row of schedule.rows){const code=status(row,true);if(row.tanggal&&code&&code!=='H')days.set(row.tanggal,code);}
  for(const row of attendance.rows){const code=status(row,false);if(row.tanggal&&code)days.set(row.tanggal,code);if(row.tanggal&&code==='H'&&Number(row.terlambat_menit)>0)late.add(row.tanggal);}
  const eligible=[...days.entries()].filter(([date])=>!join||date>=join);const count=code=>eligible.filter(([,val])=>val===code).length;
  $('mkwHadir').textContent=String(count('H'));$('mkwLate').textContent=String([...late].filter(date=>!join||date>=join).length);$('mkwLibur').textContent=String(count('L'));$('mkwSakit').textContent=String(count('S'));$('mkwIzin').textContent=String(count('I'));
  const dates=eligible.map(([date])=>date).sort();$('mkwCoverage').textContent=dates.length?`Catatan ERP ${formatDate(dates[0])} – ${formatDate(dates[dates.length-1])}; ${eligible.length} tanggal unik, tanpa hitung ganda. ${join?'Sejak tanggal bergabung.':'Tanggal bergabung belum terisi.'} ${attendance.limited||schedule.limited?'Data melebihi batas baca — hitungan belum lengkap.':''} Hari tanpa catatan tidak dihitung hadir atau alfa.`:'Belum ada catatan Absensi/Jadwal. Angka 0 bukan berarti nol sepanjang masa kerja.';
  saved=salary.data||null;if(saved){$('mkwSalaryDisplay').textContent=rupiah(Number(saved.total_gaji));$('mkwSalarySource').textContent=`Input manual Owner sampai ${formatDate(saved.periode_sampai)}. Bukan Payroll otomatis. ${saved.catatan||''}`;$('mkwSalaryAmount').value=String(saved.total_gaji);$('mkwSalaryUntil').value=saved.periode_sampai;$('mkwSalaryNote').value=saved.catatan||'';}
  else{$('mkwSalaryDisplay').textContent='Belum tersedia';$('mkwSalarySource').textContent='Belum ada total gaji historis yang terverifikasi.';}
 }catch(err){if(active!==id||seq!==token)return;console.error('Riwayat karyawan gagal dibaca',err?.code||err?.message);$('mkwCoverage').textContent='Riwayat belum dapat dimuat; angka tidak ditampilkan agar tidak menyesatkan.';$('mkwSalaryDisplay').textContent='Belum dapat dimuat';$('mkwSalarySource').textContent='Periksa koneksi atau akses Owner.';}finally{if(seq===token)busy=false;}
}
async function save(event){event.preventDefault();event.stopPropagation();if(!active||!owner()||busy)return;
 const raw=$('mkwSalaryAmount').value.trim(),until=$('mkwSalaryUntil').value,note=$('mkwSalaryNote').value.trim(),message=$('mkwSalaryMessage');
 if(raw===''||!Number.isSafeInteger(Number(raw))||Number(raw)<0||!until||until>nowDate()||note.length<3){message.textContent='Isi nominal bulat ≥ 0, tanggal sampai hari ini, dan catatan minimal 3 karakter.';return;}
 if(saved&&Number(saved.total_gaji)===Number(raw)&&saved.periode_sampai===until&&saved.catatan===note){message.textContent='Tidak ada perubahan.';return;}
 const id=active,token=seq,btn=$('mkwSalarySave');btn.disabled=true;message.textContent='Menyimpan historis manual…';
 try{const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user?.id)throw authError||new Error('Sesi Owner tidak valid');const {error}=await db.from('karyawan_riwayat_gaji_manual').upsert({karyawan_id:id,total_gaji:Number(raw),periode_sampai:until,catatan:note,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'karyawan_id'});if(error)throw error;if(active!==id||seq!==token)return;saved={total_gaji:Number(raw),periode_sampai:until,catatan:note};$('mkwSalaryDisplay').textContent=rupiah(Number(raw));$('mkwSalarySource').textContent=`Input manual Owner sampai ${formatDate(until)}. Bukan Payroll otomatis. ${note}`;message.textContent='Historis manual tersimpan. Payroll dan transaksi keuangan tidak berubah.';}
 catch(err){console.error('Simpan historis gaji gagal',err?.code||err?.message);if(active===id&&seq===token)message.textContent='Gagal menyimpan. Periksa sesi Owner dan koneksi.';}finally{btn.disabled=false;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();