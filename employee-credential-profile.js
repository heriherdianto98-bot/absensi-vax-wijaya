/* Standalone employee self-service. Never query or expose legacy secret columns. */
(async function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const say = (message, error=false) => {const el=$('notice');el.textContent=message;el.classList.remove('hidden');el.classList.toggle('error',error);};
  try {
    if (typeof KaryawanSession==='undefined' || typeof db==='undefined') throw new Error('Layanan sesi tidak tersedia.');
    const employee=await KaryawanSession.requirePage();
    if(!employee) return;
    const token=KaryawanSession.getToken();
    if(!token){$('status').textContent='Login ulang diperlukan untuk mengatur password.';$('status').classList.remove('hidden');$('credentialForm').classList.add('hidden');return;}
    const {data,error}=await db.rpc('karyawan_credential_profile_self',{p_token:token});
    if(error || data?.ok!==true) throw new Error('Sesi tidak valid. Silakan login ulang.');
    const id=$('identity'); id.textContent='';
    const name=document.createElement('strong');name.textContent=data.nama || employee.nama_karyawan || 'Karyawan';id.append(name,document.createElement('br'));
    const code=document.createElement('span');code.textContent='Kode Login: '+(data.kode_login || 'Belum tersedia');id.append(code);
    $('email').value=data.email || '';
    const statusMessage = data.email_verified
      ? 'Email sudah terverifikasi. Gunakan email atau kode login untuk masuk dengan password yang sama.'
      : data.email
        ? 'Email kontak tersimpan tetapi belum diverifikasi. Klik Kirim Verifikasi Email di bawah agar email dapat digunakan untuk login dan pemulihan password.'
        : 'Lengkapi email pribadi dan ganti password awal. Email harus diverifikasi sebelum digunakan untuk login.';
    $('status').textContent=statusMessage;$('status').classList.remove('hidden');
    $('credentialForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const current=$('currentPassword').value,newPassword=$('newPassword').value,confirmed=$('confirmPassword').value,email=$('email').value.trim();
      if(newPassword!==confirmed){say('Konfirmasi password tidak sama.',true);return;}
      if(newPassword.length<12 || newPassword.length>128 || newPassword===current){say('Gunakan password baru yang berbeda, 12–128 karakter.',true);return;}
      const button=$('save');button.disabled=true;say('Menyimpan perubahan…');
      try{
        const res=await db.rpc('karyawan_credential_update_self',{p_token:KaryawanSession.getToken(),p_current_password:current,p_new_password:newPassword,p_email:email});
        if(res.error)throw res.error;
        const reply=res.data||{};
        if(reply.ok!==true){const reasons={SESSION_INVALID:'Sesi berakhir. Login ulang.',PASSWORD_LAMA_SALAH:'Password saat ini tidak cocok.',PASSWORD_BARU_TIDAK_VALID:'Password baru harus berbeda dan minimal 12 karakter.',EMAIL_TIDAK_VALID:'Format email tidak valid.',EMAIL_SUDAH_DIPAKAI:'Email sudah digunakan akun lain.'};throw new Error(reasons[reply.reason] || 'Perubahan tidak berhasil.');}
        $('currentPassword').value='';$('newPassword').value='';$('confirmPassword').value='';
        $('status').textContent=reply.email_verified?'Email tetap terverifikasi. Email atau kode login bisa digunakan untuk masuk.':'Password pribadi aktif. Email kontak perlu diverifikasi agar dapat dipakai login.';
        say(reply.email_verified?'Password berhasil diganti; email terverifikasi tetap aktif.':'Password berhasil diganti. Password awal/PIN lama dinonaktifkan. Selanjutnya verifikasi email Anda.');
        document.dispatchEvent(new Event('vax:employee-credential-updated'));
      }catch(err){say(err.message || 'Perubahan gagal.',true);}finally{button.disabled=false;}
    });
  }catch(error){$('identity').textContent='Profil belum dapat dimuat.';$('status').textContent=error.message || 'Gagal memuat profil.';$('status').classList.remove('hidden');$('credentialForm').classList.add('hidden');}
})();