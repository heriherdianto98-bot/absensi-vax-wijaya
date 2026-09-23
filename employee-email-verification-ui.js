/* Additive employee email verification. Unverified email never grants login or recovery. */
(async () => {
  'use strict';
  const form=document.getElementById('credentialForm');
  if(!form || typeof db==='undefined' || typeof KaryawanSession==='undefined')return;
  const card=document.createElement('section');card.className='card';
  card.innerHTML='<h2>Verifikasi Email</h2><p>Setelah menyimpan email di atas, kirim kode ke alamat tersebut. Email baru dapat dipakai untuk login dan pemulihan password setelah diverifikasi.</p><p id="vaxEmailVerifyState" class="hint" role="status">Memeriksa email…</p><button type="button" id="vaxEmailVerifySend" class="btn" disabled>Kirim Verifikasi Email</button><p id="vaxEmailVerifyNotice" class="notice hidden" aria-live="polite"></p><p style="margin-top:13px"><a href="verifikasi-email-karyawan.html" style="color:#f4d088">Sudah menerima kode? Verifikasi di sini</a></p>';
  form.closest('.card')?.insertAdjacentElement('afterend',card);
  const $=id=>document.getElementById(id);
  async function refresh(){
    const token=KaryawanSession.getToken();if(!token)return;
    const {data,error}=await db.rpc('karyawan_credential_profile_self',{p_token:token});
    if(error || data?.ok!==true){$('vaxEmailVerifyState').textContent='Login ulang diperlukan.';$('vaxEmailVerifySend').disabled=true;return;}
    if(!data.email){$('vaxEmailVerifyState').textContent='Email belum diisi. Simpan email dan password melalui formulir di atas terlebih dahulu.';$('vaxEmailVerifySend').disabled=true;return;}
    if(data.email_verified){$('vaxEmailVerifyState').textContent=`${data.email} · Terverifikasi. Email dapat dipakai untuk login dan pemulihan password.`;$('vaxEmailVerifySend').disabled=true;return;}
    $('vaxEmailVerifyState').textContent=`${data.email} · Belum terverifikasi.`;$('vaxEmailVerifySend').disabled=false;
  }
  $('vaxEmailVerifySend').addEventListener('click',async()=>{
    const btn=$('vaxEmailVerifySend');btn.disabled=true;
    $('vaxEmailVerifyNotice').classList.remove('hidden','error');$('vaxEmailVerifyNotice').textContent='Mengirim email…';
    try{
      const {data,error}=await db.functions.invoke('karyawan-email-auth',{body:{purpose:'VERIFY',session_token:KaryawanSession.getToken()}});
      if(error || !data?.ok)throw new Error(data?.reason==='MAIL_NOT_CONFIGURED'?'Layanan pengiriman email belum dikonfigurasi. Hubungi Owner.':data?.reason==='MAIL_DELIVERY_FAILED'?'Email gagal dikirim. Periksa layanan email.':data?.reason==='WAIT_TWO_MINUTES'?'Tunggu 2 menit sebelum mengirim ulang.':data?.reason||error?.message||'Pengiriman gagal.');
      $('vaxEmailVerifyNotice').textContent='Email verifikasi dikirim. Buka email lalu klik tautan atau tempel kode pada halaman verifikasi.';
    }catch(e){$('vaxEmailVerifyNotice').classList.add('error');$('vaxEmailVerifyNotice').textContent=e.message||'Gagal mengirim.';}finally{await refresh();}
  });
  await refresh();
  document.addEventListener('vax:employee-credential-updated',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();