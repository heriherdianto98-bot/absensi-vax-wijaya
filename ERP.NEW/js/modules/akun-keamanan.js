/* Owner/SPV self-service credentials using canonical Supabase Auth. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const notice = (message, error=false) => {
    const el=$('aksGlobalNotice'); if(!el)return;
    el.textContent=message||''; el.hidden=!message; el.classList.toggle('is-error',error);
  };
  const cleanEmail = value => String(value||'').trim().toLowerCase();
  const photoPlaceholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='80' fill='%23111111'/%3E%3Ccircle cx='80' cy='58' r='26' fill='%23d4a017'/%3E%3Cpath d='M36 142c5-31 28-47 44-47s39 16 44 47' fill='%23d4a017'/%3E%3C/svg%3E";
  let selectedPhoto = null;

  async function currentUser(){
    const {data,error}=await db.auth.getUser();
    if(error||!data?.user)throw new Error('Sesi Auth tidak tersedia. Login ulang.');
    return data.user;
  }

  async function reauthenticate(password){
    const user=await currentUser();
    const email=cleanEmail(user.email);
    if(!email)throw new Error('Email login aktif tidak ditemukan.');
    const {data,error}=await db.auth.signInWithPassword({email,password:String(password||'')});
    if(error)throw new Error('Password saat ini tidak cocok.');
    if(String(data?.user?.id||'')!==String(user.id))throw new Error('Identitas sesi berubah. Login ulang.');
    return data.user;
  }

  async function renderIdentity(){
    const user=await currentUser();
    $('aksName').textContent=OwnerAuth.profile?.nama||'—';
    $('aksRoleBadge').textContent=(OwnerAuth.isOwnerRole(OwnerAuth.profile?.role)?'OWNER':'SPV');
    $('aksEmail').textContent=user.email||'—';
    $('aksPendingEmail').textContent=user.new_email||'Tidak ada';
    const preview=$('aksPhotoPreview');
    if(preview){
      const avatar=String(user.user_metadata?.avatar_url||'').trim();
      preview.src=avatar||photoPlaceholder;
      preview.onerror=()=>{preview.onerror=null;preview.src=photoPlaceholder;};
    }
    if($('aksPhotoName'))$('aksPhotoName').textContent=OwnerAuth.profile?.nama||'—';
    if($('aksPhotoRole'))$('aksPhotoRole').textContent=(OwnerAuth.isOwnerRole(OwnerAuth.profile?.role)?'OWNER':'SPV');
    return user;
  }

  function bindPhotoControls(){
    const input=$('aksPhotoInput'),choose=$('aksPhotoChoose'),save=$('aksPhotoSave'),preview=$('aksPhotoPreview');
    if(!input||!choose||!save||!preview)return;
    choose.addEventListener('click',()=>input.click());
    input.addEventListener('change',()=>{
      const file=input.files?.[0]||null;
      selectedPhoto=null;save.disabled=true;
      if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){input.value='';notice('Gunakan foto JPG, PNG, atau WEBP.',true);return;}
      if(file.size>5*1024*1024){input.value='';notice('Ukuran foto maksimal 5 MB.',true);return;}
      selectedPhoto=file;
      const objectUrl=URL.createObjectURL(file);
      preview.src=objectUrl;
      preview.onload=()=>URL.revokeObjectURL(objectUrl);
      save.disabled=false;notice('Foto siap disimpan.');
    });
    save.addEventListener('click',async()=>{
      if(!selectedPhoto)return;
      choose.disabled=true;save.disabled=true;notice('Mengunggah foto…');
      try{
        const user=await currentUser();
        const ext=selectedPhoto.type==='image/png'?'png':selectedPhoto.type==='image/webp'?'webp':'jpg';
        const path=`owner-spv/${user.id}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}.${ext}`;
        const upload=await db.storage.from('foto-karyawan').upload(path,selectedPhoto,{cacheControl:'3600',contentType:selectedPhoto.type,upsert:false});
        if(upload.error)throw upload.error;
        const publicUrl=db.storage.from('foto-karyawan').getPublicUrl(path)?.data?.publicUrl;
        if(!publicUrl)throw new Error('URL foto tidak terbentuk.');
        const {error}=await db.auth.updateUser({data:{...(user.user_metadata||{}),avatar_url:publicUrl}});
        if(error)throw error;
        preview.src=publicUrl;selectedPhoto=null;input.value='';notice('Foto profil berhasil diperbarui.');
      }catch(err){notice(err?.message||'Gagal mengganti foto.',true);}
      finally{choose.disabled=false;save.disabled=!selectedPhoto;}
    });
  }

  async function init(){
    const ok=await OwnerAuth.requireFinance();
    if(!ok)return;

    await Promise.all([
      loadComponent('sidebar','../components/sidebar.html'),
      loadComponent('header','../components/header.html')
    ]).catch(()=>{});

    OwnerAuth.bindUi?.(); OwnerAuth.syncHeader?.(); OwnerAuth.applyAccessControl?.();
    initErpShellChrome?.();
    document.querySelectorAll('.sidebar .menu-item').forEach(el=>el.classList.remove('active'));
    document.querySelector('.sidebar [data-erp-nav="akun-keamanan"]')?.classList.add('active');
    const hc=$('erpHeaderCabang'); if(hc)hc.textContent='Akun & Keamanan';
    const hp=$('erpHeaderPeriode'); if(hp)hp.textContent=(OwnerAuth.isOwnerRole(OwnerAuth.profile?.role)?'Owner':'SPV');
    await renderIdentity();
    bindPhotoControls();

    $('aksEmailForm')?.addEventListener('submit',async e=>{
      e.preventDefault(); notice('');
      const btn=$('aksEmailSubmit'),newEmail=cleanEmail($('aksNewEmail').value),currentPassword=$('aksEmailCurrentPassword').value;
      let old=''; try{old=cleanEmail((await currentUser()).email);}catch(err){notice(err.message,true);return;}
      if(!newEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)){notice('Format email baru tidak valid.',true);return;}
      if(newEmail===old){notice('Email baru sama dengan email login aktif.',true);return;}
      btn.disabled=true;btn.textContent='Memproses…';
      try{
        await reauthenticate(currentPassword);
        const redirectTo=new URL('akun-keamanan.html',window.location.href).href;
        const {data,error}=await db.auth.updateUser({email:newEmail},{emailRedirectTo:redirectTo});
        if(error)throw error;
        $('aksEmailCurrentPassword').value='';$('aksNewEmail').value='';
        await renderIdentity();
        if(data?.user?.new_email){
          notice('Permintaan ganti email dikirim. Selesaikan konfirmasi email sebelum memakai email baru untuk login.');
        }else if(cleanEmail(data?.user?.email)===newEmail){
          notice('Email login berhasil diubah.');
        }else{
          notice('Permintaan perubahan email diproses. Periksa inbox email untuk konfirmasi.');
        }
      }catch(err){
        const raw=String(err?.message||err);
        notice(/already|registered|exists/i.test(raw)?'Email tersebut sudah digunakan akun lain.':/password|credentials/i.test(raw)?'Password saat ini tidak cocok.':raw,true);
      }finally{btn.disabled=false;btn.textContent='Kirim Permintaan Ganti Email';}
    });

    $('aksPasswordForm')?.addEventListener('submit',async e=>{
      e.preventDefault();notice('');
      const btn=$('aksPasswordSubmit'),current=$('aksCurrentPassword').value,next=$('aksNewPassword').value,confirm=$('aksConfirmPassword').value;
      if(next!==confirm){notice('Konfirmasi password baru tidak sama.',true);return;}
      if(next.length<12||next.length>128){notice('Password baru harus 12–128 karakter.',true);return;}
      if(next===current){notice('Password baru harus berbeda dari password saat ini.',true);return;}
      btn.disabled=true;btn.textContent='Memproses…';
      try{
        await reauthenticate(current);
        const {error}=await db.auth.updateUser({password:next});
        if(error)throw error;
        $('aksCurrentPassword').value='';$('aksNewPassword').value='';$('aksConfirmPassword').value='';
        notice('Password berhasil diganti. Gunakan password baru untuk login berikutnya.');
      }catch(err){
        const raw=String(err?.message||err);
        notice(/password|credentials/i.test(raw)?'Password saat ini tidak cocok atau password baru ditolak.':raw,true);
      }finally{btn.disabled=false;btn.textContent='Ganti Password';}
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();