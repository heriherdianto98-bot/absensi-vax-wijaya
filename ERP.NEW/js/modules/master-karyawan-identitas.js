/* ERP VAX — Owner-only identity panel. Canonical address: public.karyawan.alamat_ktp. */
(() => {
  'use strict';
  const TABLE='karyawan_identitas';
  const $=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();
  const owner=()=>!!(window.OwnerAuth?.ready && window.OwnerAuth?.profile?.aktif===true && window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role));
  let activeId=null,loading=false,loaded=false,canonicalAddress='';
  const columns='karyawan_id,nama_lengkap_ktp,nik,tanggal_lahir,tempat_lahir,tanggal_bergabung,status_verifikasi,catatan';
  const fields=['mkiNik','mkiFullName','mkiBirth','mkiBirthPlace','mkiAddress','mkiJoin','mkiNotes'];
  function notice(message,error=false){const node=$('mkiNotice');if(!node)return;node.textContent=message;node.classList.toggle('is-error',error);node.hidden=!message;}
  function wipe(){fields.forEach(id=>{if($(id))$(id).value='';});canonicalAddress='';loaded=false;}
  function close(){const node=$('mkiOverlay');node?.classList.remove('is-open');node?.setAttribute('aria-hidden','true');wipe();activeId=null;notice('');}
  function fill(data,address){
    $('mkiFullName').value=text(data?.nama_lengkap_ktp);
    $('mkiNik').value=text(data?.nik);
    $('mkiBirth').value=text(data?.tanggal_lahir);
    $('mkiBirthPlace').value=text(data?.tempat_lahir);
    $('mkiAddress').value=text(address);
    $('mkiJoin').value=text(data?.tanggal_bergabung);
    $('mkiNotes').value=text(data?.catatan);
    const labels={nama_lengkap_ktp:'nama lengkap',nik:'NIK',tanggal_lahir:'tanggal lahir',alamat_ktp:'alamat KTP'};
    const missing=Object.keys(labels).filter(key=>!text(key==='alamat_ktp'?address:data?.[key]));
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
      const [identity,master]=await Promise.all([
        db.from(TABLE).select(columns).eq('karyawan_id',id).maybeSingle(),
        db.from('karyawan').select('alamat_ktp').eq('id',id).single()
      ]);
      if(identity.error)throw identity.error;
      if(master.error)throw master.error;
      if(activeId!==id)return;
      canonicalAddress=text(master.data?.alamat_ktp);
      fill(identity.data,canonicalAddress);
      loaded=true;
      if(!identity.data)notice('KTP belum dipetakan. Isi hanya data yang diketahui.');
    }catch(err){console.error('KTP read failed',err?.code||err?.message);notice('Data identitas atau alamat Master tidak dapat dimuat. Penyimpanan dinonaktifkan.',true);}
    finally{loading=false;if(activeId===id)$('mkiSave').disabled=!loaded;}
  }
  async function save(event){
    event.preventDefault();if(!activeId||!owner()||loading||!loaded)return;
    const id=activeId;
    const nik=text($('mkiNik').value).replace(/\s/g,'');
    if(nik&&!/^\d{16}$/.test(nik)){notice('NIK harus 16 digit angka; kosongkan jika belum diketahui.',true);return;}
    const birth=text($('mkiBirth').value),join=text($('mkiJoin').value),today=new Date().toISOString().slice(0,10);
    if((birth&&birth>today)||(join&&join>today)){notice('Tanggal tidak boleh di masa depan.',true);return;}
    const address=text($('mkiAddress').value);
    const payload={karyawan_id:id,nama_lengkap_ktp:text($('mkiFullName').value)||null,nik:nik||null,tempat_lahir:text($('mkiBirthPlace').value)||null,tanggal_lahir:birth||null,tanggal_bergabung:join||null,catatan:text($('mkiNotes').value)||null};
    const missing=['nama_lengkap_ktp','nik','tanggal_lahir','alamat_ktp'].filter(field=>!text(field==='alamat_ktp'?address:payload[field]));
    payload.status_verifikasi=missing.length?'belum_lengkap':'perlu_verifikasi';
    loading=true;$('mkiSave').disabled=true;notice('Menyimpan identitas…');
    let addressSaved=false;
    try{
      if(address!==canonicalAddress){
        const {data,error}=await db.from('karyawan').update({alamat_ktp:address||null}).eq('id',id).select('id,alamat_ktp').single();
        if(error)throw error;
        canonicalAddress=text(data?.alamat_ktp);
        addressSaved=true;
      }
      const {error}=await db.from(TABLE).upsert(payload,{onConflict:'karyawan_id'});
      if(error)throw error;
      $('mkiStatus').textContent=missing.length?'Belum lengkap — data yang belum ada tetap kosong.':'Identitas utama lengkap — menunggu verifikasi.';
      notice('Identitas tersimpan. Alamat KTP menggunakan satu sumber di Master Karyawan.');
    }catch(err){
      console.error('KTP save failed',err?.code||err?.message);
      notice(addressSaved?'Alamat Master tersimpan, tetapi data identitas lainnya gagal. Periksa lalu simpan ulang.':'Penyimpanan gagal. Periksa akses Owner atau keunikan NIK.',true);
    }finally{
      if(addressSaved){try{await window.MasterKaryawan?.init?.();}catch(err){console.error('Master refresh failed',err?.message);}}
      loading=false;if(activeId===id)$('mkiSave').disabled=!loaded;
    }
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
    // Edit existing employees: address is managed exclusively in Detail. Add employee retains its required address input.
    document.addEventListener('click',event=>{
      if(!event.target.closest)return;
      const isEdit=event.target.closest('button[data-edit-id]');
      const isAdd=event.target.closest('#mkAdd');
      if(!isEdit&&!isAdd)return;
      const addressField=$('mkFormAddress')?.closest('label');
      if(addressField)addressField.style.display=isEdit?'none':'';
      const hint=$('mkModalHint');
      if(hint&&isEdit)hint.textContent='Ubah cabang, jabatan, status, atau nomor WhatsApp. Alamat KTP dikelola melalui Detail.';
    },true);
    const observer=new MutationObserver(decorate);observer.observe(body,{childList:true,subtree:true});decorate();
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