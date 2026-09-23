/* Employee profile actions restored: photo + secure logout. */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (typeof KaryawanSession === 'undefined' || typeof db === 'undefined') return;

  const employee = await KaryawanSession.requirePage();
  if (!employee) return;

  const photo = $('profilePhotoPreview');
  const input = $('profilePhotoInput');
  const choose = $('profilePhotoChoose');
  const save = $('profilePhotoSave');
  const logout = $('profileLogout');
  const notice = $('profileActionNotice');

  const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='80' fill='%23111111'/%3E%3Ccircle cx='80' cy='58' r='26' fill='%23d4a017'/%3E%3Cpath d='M36 142c5-31 28-47 44-47s39 16 44 47' fill='%23d4a017'/%3E%3C/svg%3E";
  if (photo) {
    photo.src = String(employee.foto || '').trim() || placeholder;
    photo.onerror = () => { photo.onerror = null; photo.src = placeholder; };
  }

  const say = (message, error=false) => {
    if (!notice) return;
    notice.textContent = message || '';
    notice.hidden = !message;
    notice.classList.toggle('error', error);
  };

  let selected = null;
  choose?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const file = input.files?.[0] || null;
    selected = null;
    save.disabled = true;
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      input.value = '';
      say('Gunakan foto JPG, PNG, atau WEBP.', true);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      input.value = '';
      say('Ukuran foto maksimal 5 MB.', true);
      return;
    }
    selected = file;
    const objectUrl = URL.createObjectURL(file);
    photo.src = objectUrl;
    photo.onload = () => URL.revokeObjectURL(objectUrl);
    save.disabled = false;
    say('Foto siap disimpan.');
  });

  save?.addEventListener('click', async () => {
    if (!selected) return;
    save.disabled = true;
    choose.disabled = true;
    say('Mengunggah foto…');
    try {
      const ext = selected.type === 'image/png' ? 'png' : selected.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `employee/${employee.id}/${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${ext}`;
      const upload = await db.storage.from('foto-karyawan').upload(path, selected, {
        cacheControl: '3600',
        contentType: selected.type,
        upsert: false
      });
      if (upload.error) throw upload.error;
      const publicUrl = db.storage.from('foto-karyawan').getPublicUrl(path)?.data?.publicUrl;
      if (!publicUrl) throw new Error('URL foto tidak terbentuk.');
      const res = await db.rpc('karyawan_profile_photo_update_self', {
        p_token: KaryawanSession.getToken(),
        p_foto_url: publicUrl
      });
      if (res.error || res.data?.ok !== true) throw new Error(res.data?.reason || res.error?.message || 'Foto gagal disimpan.');
      selected = null;
      input.value = '';
      photo.src = publicUrl;
      say('Foto profil berhasil diperbarui.');
    } catch (error) {
      say(error?.message || 'Gagal mengganti foto.', true);
    } finally {
      choose.disabled = false;
      save.disabled = !selected;
    }
  });

  logout?.addEventListener('click', async () => {
    if (logout.disabled) return;
    logout.disabled = true;
    logout.textContent = 'Keluar…';
    try {
      await KaryawanSession.logout();
    } catch (_) {
      KaryawanSession.clear?.();
      window.location.replace(KaryawanSession.loginUrl());
    }
  });
})();