(function(){
  const $=id=>document.getElementById(id);
  let role="",scope="PENDING",rows=[],current=null,busy=false;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtDate=v=>v?new Date(v+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}):"—";
  const fmtTime=v=>{const m=String(v||"").match(/(\d{2}:\d{2})/);return m?m[1]+" WIB":"—"};
  const fmtDateTime=v=>v?new Date(v).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
  function msg(t=""){ $("pageMessage").textContent=t }
  function statusText(s){return s==="MENUNGGU_SPV"?"Menunggu SPV":s==="DISETUJUI_SPV"?"Disetujui SPV":s==="DITOLAK_SPV"?"Ditolak SPV":s||"—"}
  function setCounts(){
    $("countPending").textContent=rows.filter(r=>r.status==="MENUNGGU_SPV").length;
    $("countDecided").textContent=rows.filter(r=>r.status!=="MENUNGGU_SPV").length;
    $("countAll").textContent=rows.length;
  }
  function filtered(){
    const q=String($("searchInput").value||"").toLowerCase().trim(),kind=$("kindFilter").value;
    return rows.filter(r=>{
      if(scope==="PENDING"&&r.status!=="MENUNGGU_SPV")return false;
      if(scope==="DECIDED"&&r.status==="MENUNGGU_SPV")return false;
      if(kind!=="ALL"&&r.jenis!==kind)return false;
      if(!q)return true;
      return [r.nama_karyawan,r.nama_cabang,r.alasan,r.jenis].join(" ").toLowerCase().includes(q);
    })
  }
  function render(){
    const list=$("requestList"),data=filtered();list.innerHTML="";
    if(!data.length){msg("Tidak ada data pada filter ini.");return}msg("");
    list.innerHTML=data.map(r=>`
      <article class="request">
        <div class="request-head"><div><h3>${esc(r.nama_karyawan||("Karyawan #"+r.karyawan_id))}</h3><p>${esc(r.jabatan||"—")} · ${esc(r.nama_cabang||"—")}</p></div><span class="badge ${esc(r.jenis)}">${esc(r.jenis)}</span></div>
        <div class="meta"><div><small>Tanggal</small><b>${fmtDate(r.tanggal)}</b></div><div><small>Jam Masuk</small><b>${fmtTime(r.jam_masuk_snapshot)}</b></div><div><small>Jam Pulang</small><b>${fmtTime(r.jam_pulang_setelah)}</b></div><div><small>Status Awal</small><b>${esc(r.absensi_status_sebelum||"—")}</b></div></div>
        <p class="reason">${esc(r.alasan||"—")}</p>
        <div class="status ${r.status==="DITOLAK_SPV"?"reject":""}">${statusText(r.status)}${r.spv_nama?" · "+esc(r.spv_nama):""}</div>
        <button type="button" class="review-btn" data-id="${r.id}">${role==="owner"||r.status!=="MENUNGGU_SPV"?"Lihat Detail":"Review"}</button>
      </article>`).join("");
  }
  async function load(){
    msg("Memuat data...");
    const {data,error}=await db.rpc("pulang_awal_list_reviewer_v1",{p_scope:"ALL"});
    if(error){msg(error.message||"Gagal memuat data.");return}
    role=data?.role||"";rows=data?.rows||[];
    $("pageSub").textContent=role==="owner"?"LAPORAN OWNER · READ ONLY":"REVIEW SPV";
    $("pageTitle").textContent=role==="owner"?"LAPORAN PULANG LEBIH AWAL":"PULANG LEBIH AWAL";
    if(role==="owner"){scope="ALL";document.querySelectorAll(".summary-card").forEach(x=>x.classList.toggle("active",x.dataset.scope==="ALL"))}
    setCounts();render();
  }
  function openModal(row){
    current=row;$("modalName").textContent=row.nama_karyawan||"—";$("modalBranch").textContent=row.nama_cabang||"—";$("modalDate").textContent=fmtDate(row.tanggal);$("modalIn").textContent=fmtTime(row.jam_masuk_snapshot);$("modalBefore").textContent=row.absensi_status_sebelum||"—";$("modalKind").textContent=row.jenis||"—";$("modalReason").textContent=row.alasan||"—";$("spvNote").value=row.spv_catatan||"";
    $("proofBtn").disabled=!row.bukti_path;
    const decided=row.status!=="MENUNGGU_SPV",readonly=role==="owner"||decided;
    $("spvActions").hidden=readonly;
    $("decisionBox").hidden=!decided;
    if(decided)$("decisionBox").innerHTML="<b>"+esc(statusText(row.status))+"</b><br>Status akhir: "+esc(row.absensi_status_setelah||"—")+"<br>Jam pulang: "+fmtTime(row.jam_pulang_setelah)+"<br>SPV: "+esc(row.spv_nama||"—")+"<br>Waktu: "+fmtDateTime(row.spv_reviewed_at)+"<br>Catatan: "+esc(row.spv_catatan||"—");
    $("modalMessage").textContent="";
    $("reviewModal").hidden=false;
  }
  function closeModal(){$("reviewModal").hidden=true;current=null}
  async function decide(action){
    if(!current||busy)return;
    const note=String($("spvNote").value||"").trim();
    if(action==="TOLAK"&&note.length<3){$("modalMessage").textContent="Catatan wajib untuk penolakan.";return}
    busy=true;$("approveBtn").disabled=true;$("rejectBtn").disabled=true;$("modalMessage").textContent="Menyimpan keputusan...";
    const {error}=await db.rpc("review_pulang_awal_spv_v1",{p_pengajuan_id:current.id,p_action:action,p_catatan:note||null});
    busy=false;$("approveBtn").disabled=false;$("rejectBtn").disabled=false;
    if(error){$("modalMessage").textContent=error.message||"Gagal menyimpan keputusan.";return}
    closeModal();await load();
  }
  async function openProof(){
    if(!current?.bukti_path)return;
    const {data,error}=await db.storage.from("izin-proofs").createSignedUrl(current.bukti_path,90);
    if(error||!data?.signedUrl){$("modalMessage").textContent="Bukti tidak dapat dibuka.";return}
    $("proofImage").src=data.signedUrl;$("proofModal").hidden=false;
  }

  document.querySelectorAll(".summary-card").forEach(btn=>btn.addEventListener("click",()=>{scope=btn.dataset.scope;document.querySelectorAll(".summary-card").forEach(x=>x.classList.toggle("active",x===btn));render()}));
  $("searchInput").addEventListener("input",render);$("kindFilter").addEventListener("change",render);$("refreshBtn").addEventListener("click",load);
  $("requestList").addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(!b)return;const row=rows.find(x=>String(x.id)===String(b.dataset.id));if(row)openModal(row)});
  document.querySelectorAll("[data-close]").forEach(x=>x.addEventListener("click",closeModal));
  document.querySelectorAll("[data-proof-close]").forEach(x=>x.addEventListener("click",()=>{$("proofModal").hidden=true;$("proofImage").removeAttribute("src")}));
  $("approveBtn").addEventListener("click",()=>decide("ACC"));$("rejectBtn").addEventListener("click",()=>decide("TOLAK"));$("proofBtn").addEventListener("click",openProof);

  (async()=>{
    const {data:{session}}=await db.auth.getSession();
    if(!session){msg("Login ERP diperlukan.");return}
    const {data:profile}=await db.from("profiles").select("role,aktif").eq("id",session.user.id).maybeSingle();
    const r=String(profile?.role||"").toLowerCase();
    if(profile?.aktif===false||!["spv","svp","owner"].includes(r)){msg("Akses hanya untuk SPV/Owner.");return}
    await load();
  })();
})();