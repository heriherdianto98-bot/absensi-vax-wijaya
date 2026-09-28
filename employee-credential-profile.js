/* Standalone employee password self-service.
   Login identity remains employee code. Existing email value is preserved but not exposed or edited here. */
(async function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const say = (message, error=false) => {
    const el=$('notice');
    if(!el) return;
    el.textContent=message;
    el.classList.remove('hidden');
    el.classList.toggle('error',error);
  };
  try {
    if (typeof KaryawanSession==='undefined' || typeof db==='undefined') throw new Error('Layanan sesi tidak tersedia.');
    const employee=await KaryawanSession.requirePage();
    if(!employee) return;
    const token=KaryawanSession.getToken();
    if(!token){
      $('status').textContent='Login ulang diperlukan untuk mengatur password.';
      $('status').classList.remove('hidden');
      $('credentialForm').classList.add('hidden');
      return;
    }

    const {data,error}=await db.rpc('karyawan_credential_profile_self',{p_token:token});
    if(error || data?.ok!==true) throw new Error('Sesi tidak valid. Silakan login ulang.');

    const code=data.kode_login || 'Belum tersedia';
    const codeNode=$('profileLoginCode');
    if(codeNode) codeNode.textContent=code;

    const preservedEmail=String(data.email||'').trim();
    $('status').textContent='Kode login '+code+' digunakan untuk masuk ke akun karyawan dengan password pribadi.';
    $('status').classList.remove('hidden');

    $('credentialForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const current=$('currentPassword').value;
      const newPassword=$('newPassword').value;
      const confirmed=$('confirmPassword').value;
      if(newPassword!==confirmed){say('Konfirmasi password tidak sama.',true);return;}
      if(newPassword.length<12 || newPassword.length>128 || newPassword===current){
        say('Gunakan password baru yang berbeda, 12–128 karakter.',true);return;
      }
      const button=$('save');
      button.disabled=true;
      say('Mengganti password…');
      try{
        const res=await db.rpc('karyawan_credential_update_self',{
          p_token:KaryawanSession.getToken(),
          p_current_password:current,
          p_new_password:newPassword,
          p_email:preservedEmail || null
        });
        if(res.error) throw res.error;
        const reply=res.data||{};
        if(reply.ok!==true){
          const reasons={
            SESSION_INVALID:'Sesi berakhir. Login ulang.',
            PASSWORD_LAMA_SALAH:'Password saat ini tidak cocok.',
            PASSWORD_BARU_TIDAK_VALID:'Password baru harus berbeda dan minimal 12 karakter.'
          };
          throw new Error(reasons[reply.reason] || 'Perubahan tidak berhasil.');
        }
        $('currentPassword').value='';
        $('newPassword').value='';
        $('confirmPassword').value='';
        $('status').textContent='Kode login '+code+' tetap digunakan. Password pribadi berhasil diperbarui.';
        say('Password berhasil diganti.');
        document.dispatchEvent(new Event('vax:employee-credential-updated'));
      }catch(err){
        say(err.message || 'Perubahan gagal.',true);
      }finally{
        button.disabled=false;
      }
    });
  }catch(error){
    const codeNode=$('profileLoginCode');
    if(codeNode) codeNode.textContent='Belum dapat dimuat';
    if($('status')){
      $('status').textContent=error.message || 'Gagal memuat pengaturan akun.';
      $('status').classList.remove('hidden');
    }
    $('credentialForm')?.classList.add('hidden');
  }
})();