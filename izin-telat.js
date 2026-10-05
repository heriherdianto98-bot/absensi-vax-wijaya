/* Employee-only late-arrival notice: additive; existing Izin/Libur and attendance engines untouched. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const wibDay = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let employee=null,busy=false;
  const state = (message,error=false) => {const el=$('izinTelatState');el.textContent=message;el.style.color=error?'#ff9e9e':'#f3cd77';};
  function validFile(file) {return file && ['image/jpeg','image/png','image/webp'].includes(file.type) && file.size>0 && file.size<=5*1024*1024;}
  async function boot() {
    $('izinTelatTanggal').textContent=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'full'}).format(new Date());
    if(typeof db==='undefined'||typeof KaryawanSession==='undefined'){state('Koneksi ERP belum siap.',true);return;}
    try{
      employee=await KaryawanSession.requirePage();
      const token=KaryawanSession.getToken();
      if(!employee||!token){state('Sesi karyawan tidak tersedia. Login ulang terlebih dahulu.',true);return;}
      if(!['capster','kasir'].includes(String(employee.jabatan||'').trim().toLowerCase())){state('Izin telat hanya tersedia untuk capster dan kasir.',true);return;}
      $('izinTelatNama').textContent=`${employee.nama_karyawan} · ${employee.jabatan}`;
      $('izinTelatSend').disabled=false;
    }catch(err){state(err?.message||'Gagal memuat sesi karyawan.',true);}
  }
  $('izinTelatPhoto').addEventListener('change',()=>{
    const file=$('izinTelatPhoto').files?.[0];
    if(!file){$('izinTelatPreview').hidden=true;return;}
    if(!validFile(file)) {state('Pilih foto JPG, PNG atau WebP maksimal 5 MB.',true);$('izinTelatPhoto').value='';return;}
    $('izinTelatPreview').src=URL.createObjectURL(file);$('izinTelatPreview').hidden=false;state('Foto siap dikirim.');
  });
  $('izinTelatForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!employee)return;
    const reason=$('izinTelatReason').value.trim(),file=$('izinTelatPhoto').files?.[0];
    if(reason.length<5){state('Alasan wajib minimal 5 karakter.',true);return;}
    if(!validFile(file)){state('Foto bukti karyawan wajib, JPG/PNG/WebP maksimal 5 MB.',true);return;}
    const token=KaryawanSession.getToken();if(!token){state('Sesi habis. Login ulang.',true);return;}
    busy=true;$('izinTelatSend').disabled=true;
    try{
      const today=wibDay(),ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type];
      const path=`${employee.id}/telat/${today}/${crypto.randomUUID()}.${ext}`;
      state('Mengunggah foto bukti…');
      const {error:uploadError}=await db.storage.from('izin-proofs').upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      state('Mendaftarkan pengajuan ke server…');
      const {data,error}=await db.rpc('absensi_izin_telat_submit_v2',{p_session_token:token,p_alasan:reason,p_bukti_path:path});
      if(error)throw error;
      if(data?.status!=='TERKIRIM')throw Error('Status pengajuan perlu diperiksa ulang.');
      // Only leave the form after the server confirms the submission.
      window.location.replace(new URL('absensi.html',window.location.href).href);
    }catch(err){state(err?.message||'Pengajuan gagal. Periksa status sebelum mengirim ulang.',true);$('izinTelatSend').disabled=false;}
    finally{busy=false;}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();