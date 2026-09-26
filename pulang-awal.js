(function(){
  const $=id=>document.getElementById(id);
  let employee=null,busy=false,currentStatus=null;
  const form=$("pulangAwalForm"),kind=$("jenisPulangAwal"),reason=$("alasanPulangAwal"),file=$("buktiPulangAwal"),preview=$("previewBukti"),empty=$("uploadEmpty"),remove=$("hapusBukti"),submit=$("submitPulangAwal"),msg=$("formMessage");

  function setMsg(text="",type=""){msg.textContent=text;msg.className="message"+(type?" "+type:"")}
  function fmtTime(v){if(!v)return"—";const m=String(v).match(/(\d{2}:\d{2})/);return m?m[1]+" WIB":"—"}
  function statusLabel(v){const s=String(v||"").toUpperCase();if(s==="MENUNGGU_SPV")return"Menunggu keputusan SPV";if(s==="DISETUJUI_SPV")return"Disetujui SPV";if(s==="DITOLAK_SPV")return"Ditolak SPV";return s||"—"}
  function setBusy(v){busy=v;submit.disabled=v;submit.querySelector("span").textContent=v?"Mengirim...":"Kirim ke SPV"}
  function clearPhoto(){file.value="";preview.src="";preview.hidden=true;empty.hidden=false;remove.hidden=true}
  function safeExt(f){return f?.type==="image/png"?"png":f?.type==="image/webp"?"webp":"jpg"}
  function proofPath(f){return "pulang-awal/"+employee.id+"/"+new Date().toISOString().slice(0,10)+"/"+Date.now()+"."+safeExt(f)}

  async function refresh(){
    const token=KaryawanSession.getToken();
    const {data,error}=await db.rpc("pulang_awal_status_self_v1",{p_session_token:token});
    if(error){setMsg(error.message||"Gagal memuat status.","error");return}
    currentStatus=data;
    const a=data?.absensi;
    $("statusHariIni").textContent=a?.status|| (a?.jam_masuk?"Hadir":"Belum Absen Masuk");
    $("jamMasuk").textContent=fmtTime(a?.jam_masuk);
    $("jamPulang").textContent=fmtTime(a?.jam_pulang);
    const r=data?.pengajuan;
    const box=$("requestStatus");
    if(r){
      box.hidden=false;
      $("requestStatusText").textContent=statusLabel(r.status)+" · "+r.jenis;
      $("requestStatusNote").textContent=r.spv_catatan?("Catatan SPV: "+r.spv_catatan):"";
    }else box.hidden=true;
    const locked=!a?.jam_masuk||!!a?.jam_pulang||["MENUNGGU_SPV","DISETUJUI_SPV"].includes(String(r?.status||""));
    submit.disabled=locked;
    if(!a?.jam_masuk)setMsg("Pengajuan hanya tersedia setelah Absen Masuk.","error");
    else if(a?.jam_pulang)setMsg("Jam pulang hari ini sudah tercatat.","error");
    else if(r?.status==="MENUNGGU_SPV")setMsg("Pengajuan sudah dikirim dan sedang menunggu SPV.");
    else if(r?.status==="DISETUJUI_SPV")setMsg("Pengajuan disetujui. Status absensi hari ini sudah berubah otomatis.","success");
    else setMsg("");
  }

  document.querySelectorAll(".type-btn").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".type-btn").forEach(x=>x.classList.toggle("active",x===btn));
    kind.value=btn.dataset.kind||"IZIN";
  }));
  reason.addEventListener("input",()=>{$("alasanCounter").textContent=reason.value.length+"/300"});
  file.addEventListener("change",()=>{
    const f=file.files?.[0]; if(!f){clearPhoto();return}
    if(!["image/jpeg","image/png","image/webp"].includes(f.type)||f.size>5*1024*1024){clearPhoto();setMsg("Foto harus JPG/PNG/WEBP dan maksimal 5 MB.","error");return}
    const reader=new FileReader();reader.onload=()=>{preview.src=reader.result;preview.hidden=false;empty.hidden=true;remove.hidden=false;setMsg("")};reader.readAsDataURL(f);
  });
  remove.addEventListener("click",clearPhoto);

  form.addEventListener("submit",async e=>{
    e.preventDefault();if(busy)return;
    const f=file.files?.[0],alasan=String(reason.value||"").trim();
    if(alasan.length<3){setMsg("Alasan wajib diisi minimal 3 karakter.","error");return}
    if(!f){setMsg("Foto/bukti wajib diunggah.","error");return}
    setBusy(true);
    try{
      setMsg("Mengunggah bukti...");
      const path=proofPath(f);
      const up=await db.storage.from("izin-proofs").upload(path,f,{cacheControl:"3600",upsert:false,contentType:f.type});
      if(up.error)throw up.error;
      setMsg("Mengirim pengajuan ke SPV...");
      const {data,error}=await db.rpc("submit_pulang_awal_v1",{
        p_session_token:KaryawanSession.getToken(),
        p_jenis:kind.value,
        p_alasan:alasan,
        p_bukti_path:path
      });
      if(error)throw error;
      reason.value="";$("alasanCounter").textContent="0/300";clearPhoto();
      setMsg("Pengajuan berhasil dikirim ke SPV.","success");
      await refresh();
    }catch(err){setMsg(err?.message||"Pengajuan gagal dikirim.","error")}
    finally{setBusy(false);await refresh()}
  });

  (async()=>{employee=await KaryawanSession.requirePage();if(!employee)return;await refresh()})();
})();