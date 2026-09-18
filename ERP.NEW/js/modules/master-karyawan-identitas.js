/* ERP VAX — optional owner-only identity panel. No changes to canonical Master/Minutes engine. */
(() => {
  'use strict';
  const TABLE = 'karyawan_identitas';
  const $ = id => document.getElementById(id);
  const el = (tag, className, value) => { const node = document.createElement(tag); if(className) node.className = className; if(value !== undefined) node.textContent = value; return node; };
  const text = value => String(value ?? '').trim();
  const isOwner = () => !!(window.OwnerAuth?.ready && window.OwnerAuth?.profile?.aktif === true && window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role));
  let currentId = null;
  let loading = false;
  const columns = 'karyawan_id,nama_lengkap_ktp,nik,tanggal_lahir,tempat_lahir,alamat_ktp,tanggal_bergabung,status_verifikasi,catatan';
  function showNotice(message, error = false){ const node = $('mkiNotice'); if(node){ node.textContent = message; node.classList.toggle('is-error', error); node.hidden = !message; } }
  function clearSensitive(){ ['mkiNik','mkiFullName','mkiBirth','mkiBirthPlace','mkiAddress','mkiJoin','mkiNotes'].forEach(id=> { const node = $(id); if(node) node.value = ''; }); }
  function close(){ $('mkiOverlay')?.classList.remove('is-open'); $('mkiOverlay')?.setAttribute('aria-hidden','true'); clearSensitive(); currentId = null; showNotice(''); }
  function fill(record){
    $('mkiFullName').value = text(record?.nama_lengkap_ktp);
    $('mkiNik').value = text(record?.nik);
    $('mkiBirth').value = text(record?.tanggal_lahir);
    $('mkiBirthPlace').value = text(record?.tempat_lahir);
    $('mkiAddress').value = text(record?.alamat_ktp);
    $('mkiJoin').value = text(record?.tanggal_bergabung);
    $('mkiNotes').value = text(record?.catatan);
    const missing = ['nama_lengkap_ktp','nik','tanggal_lahir','alamat_ktp'].filter(field=>!text(record?.[field]));
    $('mkiStatus').textContent = missing.length ? `Belum lengkap: ${missing.map(k=>({nama_lengkap_ktp:'nama lengkap',nik:'NIK',tanggal_lahir:'tanggal lahir',alamat_ktp:'alamat KTP'})[k]).join(', ')}.` : 'Identitas utama telah terisi. Periksa kembali dengan KTP asli.';
  }
  async function open(id){
    if(!isOwner()){ showNotice('Akses identitas hanya untuk Owner.', true); return; }
    if(loading) return;
    const employee = (window.MasterKaryawan?.getEmployeeRows?.() || []).find(row=>row.id===id);
    if(!employee) return;
    currentId=id;
    clearSensitive(); showNotice('');
    $('mkiTitle').textContent = `Identitas ${employee.namaMaster || employee.nama}`;
    $('mkiSubtitle').textContent = `ID ${id} · ${employee.cabang} · Nama operasional tidak diubah`;
    $('mkiStatus').textContent = 'Memuat identitas…';
    $('mkiOverlay').classList.add('is-open'); $('mkiOverlay').setAttribute('aria-hidden','false');
    loading=true; $('mkiSave').disabled=true;
    try {
      const {data,error}=await db.from(TABLE).select(columns).eq('karyawan_id',id).maybeSingle();
      if(error) throw error;
      if(currentId!==id) return;
      fill(data);
      if(!data) showNotice('Belum ada dokumen KTP yang dipetakan. Silakan lengkapi data yang diketahui.');
    } catch(err){
      console.error('Gagal membaca identitas',err?.code || err?.message || err);
      showNotice('Gagal membaca data identitas. Periksa sesi Owner atau coba Refresh.',true);
    } finally { loading=false; if(currentId===id) $('mkiSave').disabled=false; }
  }
  async function save(event){
    event.preventDefault();
    if(!currentId||!isOwner()||loading) return;
    const nik=text($('mkiNik').value).replace(/\s/g,'');
    if(nik && !/^\d{16}$/.test(nik)){ showNotice('NIK harus tepat 16 digit angka. Kosongkan bila belum diketahui.',true); return; }
    const birth=text($('mkiBirth').value),join=text($('mkiJoin').value);
    if(birth && birth > new Date().toISOString().slice(0,10)){ showNotice('Tanggal lahir tidak boleh di masa depan.',true); return; }
    if(join && join > new Date().toISOString().slice(0,10)){ showNotice('Tanggal bergabung tidak boleh di masa depan.',true); return; }
    const payload={
      karyawan_id:currentId,
      nama_lengkap_ktp:text($('mkiFullName').value)||null,
      nik:nik||null,
      tanggal_lahir:birth||null,
      tempat_lahir:text($('mkiBirthPlace').value)||null,
      alamat_ktp:text($('mkiAddress').value)||null,
      tanggal_bergabung:join||null,
      catatan:text($('mkiNotes').value)||null,
      status_verifikasi:'belum_lengkap'
    };
    const missing=['nama_lengkap_ktp','nik','tanggal_lahir','alamat_ktp'].filter(k=>!payload[k]);
    payload.status_verifikasi=missing.length?'belum_lengkap':'perlu_verifikasi';
    loading=true; $('mkiSave').disabled=true; showNotice('Menyimpan identitas…');
    try {
      const {error}=await db.from(TABLE).upsert(payload,{onConflict:'karyawan_id'});
      if(error) throw error;
      $('mkiStatus').textContent=missing.length?'Belum lengkap — data yang belum tersedia tetap kosong.':'Data lengkap — menunggu verifikasi dokumen.';
      showNotice('Identitas tersimpan. ID, cabang, nama Minutes, payroll, dan absensi tidak diubah.');
    } catch(err){
      console.error('Gagal menyimpan identitas',err?.code || err?.message || err);
      showNotice('Gagal menyimpan identitas. Periksa sesi Owner dan hak akses.',true);
    } finally { loading=false; if(currentId) $('mkiSave').disabled=false; }
  }
  function initialize(){
    const overlay=$('mkiOverlay'); if(!overlay || !$('mkBody')) return;
    // Never expose KTP identity to SPV/employee. Database RLS is the authoritative barrier.
    if(!isOwner()) return;
    $('mkBody').addEventListener('click',event=>{
      const button=event.target.closest('[data-edit-id]');
      if(!button) return;
      // Capture the existing Edit action, leaving canonical CRUD untouched.
      if(event.target.closest('[data-mki-profile]')) return;
    });
    // MutationObserver adds the independent Detail control to canonical, dynamically-rendered rows.
    const body=$('mkBody');
    const decorate=()=>body.querySelectorAll('button[data-edit-id]').forEach(button=>{
      const cell=button.parentElement;
      if(!cell || cell.querySelector('[data-mki-profile]')) return;
      const id=Number(button.dataset.editId);
      if(!id) return;
      const detail=el('button','mki-detail','◈ Detail');
      detail.type='button'; detail.dataset.mkiProfile=String(id);
      detail.addEventListener('click',()=>open(id));
      cell.appendChild(detail);
    });
    const observer=new MutationObserver(decorate); observer.observe(body,{childList:true,subtree:true}); decorate();
    overlay.querySelectorAll('[data-mki-close]').forEach(button=>button.addEventListener('click',close));
    $('mkiForm').addEventListener('submit',save);
    document.addEventListener('keydown',event=>{if(event.key==='Escape' && overlay.classList.contains('is-open')) close();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden) close();});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true}); else initialize();
})();