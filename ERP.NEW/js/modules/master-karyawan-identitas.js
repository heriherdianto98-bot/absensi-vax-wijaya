/* ERP VAX — independent owner-only KTP panel. Never changes canonical Master/Minutes engine. */
(() => {
  'use strict';
  const TABLE='karyawan_identitas';
  const $=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();
  const owner=()=>!!(window.OwnerAuth?.ready && window.OwnerAuth?.profile?.aktif===true && window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role));
  let activeId=null,loading=false;
  const columns='karyawan_id,nama_lengkap_ktp,nik,tanggal_lahir,tempat_lahir,alamat_ktp,tanggal_bergabung,status_verifikasi,catatan';
  const fields=['mkiNik','mkiFullName','mkiBirth','mkiBirthPlace','mkiAddress','mkiJoin','mkiNotes'];
  function notice(message,error=false){ const node=$('mkiNotice'); if(!node)return; node.textContent=message; node.classList.toggle('is-error',error); node.hidden=!message; }
  function wipe(){fields.forEach(id=>{if($(id))$(id).value='';});}
  function close(){const node=$('mkiOverlay');node?.classList.remove('is-open');node?.setAttribute('aria-hidden','true');wipe();activeId=null;notice('');}
  function fill(data){
    $('mkiFullName').value=text(data?.nama_lengkap_ktp);
    $('mkiNik').value=text(data?.nik);
    $('mkiBirth').value=text(data?.tanggal_lahir);
    $('mkiBirthPlace').value=text(data?.tempat_lahir);
    $('mkiAddress').value=text(data?.alamat_ktp);
    $('mkiJoin').value=text(data?.tanggal_bergabung);
    $('mkiNotes').value=text(data?.catatan);
    const labels={nama_lengkap_ktp:'nama lengkap',nik:'NIK',tanggal_lahir:'tanggal lahir',alamat_ktp:'alamat KTP'};
    const missing=Object.keys(labels).filter(key=>!text(data?.[key]));
    $('mkiStatus').textContent=missing.length?`Belum lengkap: ${missing.map(key=>labels[key]).join(', ')}.`:'Identitas utama terisi — periksa dengan dokumen asli.';
  }
  async function open(id){
    if(!owner()||loading)return;
    const employee=(window.MasterKaryawan?.getEmployeeRows?.()||[]).find(row=>row.id===id);
    if(!employee)return;
    activeId=id;wipe();notice('');
    $('mkiTitle').textContent=`Identitas ${employee.namaMaster||employee.nama}`;
    $('mkiSubtitle').textContent=`ID ${id} · ${employee.cabang} · Nama operasional tidak diubah`;
    $('mkiStatus').textContent='Memuat identitas…';
    $('mkiOverlay').classList.add('is-open');$('mkiOverlay').setAttribute('aria-hidden','false');
    loading=true;$('mkiSave').disabled=true;
    try{
      const {data,error}=await db.from(TABLE).select(columns).eq('karyawan_id',id).maybeSingle();
      if(error)throw error;
      if(activeId!==id)return;
      fill(data);
      if(!data)notice('KTP belum dipetakan. Isi hanya data yang diketahui.');
    }catch(err){console.error('KTP read failed',err?.code||err?.message);notice('Data identitas tidak dapat dimuat. Periksa koneksi atau sesi Owner.',true);}
    finally{loading=false;if(activeId===id)$('mkiSave').disabled=false;}
  }
  async function save(event){
    event.preventDefault();if(!activeId||!owner()||loading)return;
    const nik=text($('mkiNik').value).replace(/\s/g,'');
    if(nik&&!/^\d{16}$/.test(nik)){notice('NIK harus 16 digit angka; kosongkan jika belum diketahui.',true);return;}
    const birth=text($('mkiBirth').value),join=text($('mkiJoin').value),today=new Date().toISOString().slice(0,10);
    if((birth&&birth>today)||(join&&join>today)){notice('Tanggal tidak boleh di masa depan.',true);return;}
    const payload={karyawan_id:activeId,nama_lengkap_ktp:text($('mkiFullName').value)||null,nik:nik||null,tempat_lahir:text($('mkiBirthPlace').value)||null,tanggal_lahir:birth||null,alamat_ktp:text($('mkiAddress').value)||null,tanggal_bergabung:join||null,catatan:text($('mkiNotes').value)||null};
    const missing=['nama_lengkap_ktp','nik','tanggal_lahir','alamat_ktp'].filter(field=>!payload[field]);
    payload.status_verifikasi=missing.length?'belum_lengkap':'perlu_verifikasi';
    loading=true;$('mkiSave').disabled=true;notice('Menyimpan identitas…');
    try{
      const {error}=await db.from(TABLE).upsert(payload,{onConflict:'karyawan_id'});
      if(error)throw error;
      $('mkiStatus').textContent=missing.length?'Belum lengkap — data yang belum ada tetap kosong.':'Identitas utama lengkap — menunggu verifikasi.';
      notice('Identitas tersimpan. Data Master, Minutes, absensi, dan payroll tidak berubah.');
    }catch(err){console.error('KTP save failed',err?.code||err?.message);notice('Penyimpanan gagal. Periksa akses Owner atau keunikan NIK.',true);}
    finally{loading=false;if(activeId)$('mkiSave').disabled=false;}
  }
  function initialize(){
    const overlay=$('mkiOverlay'),body=$('mkBody');if(!overlay||!body)return;
    function decorate(){
      if(!owner())return;
      body.querySelectorAll('button[data-edit-id]').forEach(button=>{
        const cell=button.parentElement;
        if(!cell||cell.querySelector('[data-mki-profile]'))return;
        const id=Number(button.dataset.editId);if(!id)return;
        const detail=document.createElement('button');detail.type='button';detail.className='mki-detail';detail.textContent='◈ Detail';detail.dataset.mkiProfile=String(id);
        detail.addEventListener('click',()=>open(id));cell.appendChild(detail);
      });
    }
    const observer=new MutationObserver(decorate);observer.observe(body,{childList:true,subtree:true});decorate();
    // OwnerAuth runs an asynchronous session guard on DOMContentLoaded. Wait without changing auth/engine.
    let attempts=0;const checkAuth=setInterval(()=>{
      if(owner()){clearInterval(checkAuth);decorate();}
      else if(++attempts>=80){clearInterval(checkAuth);}
    },250);
    overlay.querySelectorAll('[data-mki-close]').forEach(button=>button.addEventListener('click',close));
    $('mkiForm').addEventListener('submit',save);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.classList.contains('is-open'))close();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();