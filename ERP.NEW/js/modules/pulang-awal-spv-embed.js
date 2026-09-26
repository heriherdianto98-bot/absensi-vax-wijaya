/* ERP VAX — Pulang Lebih Awal review embedded in Absensi */
const PulangAwalSpvEmbed=(()=>{
let rows=[],role="",current=null,busy=false;
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate=v=>v?new Date(v+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}):"—";
const fmtTime=v=>{const m=String(v||"").match(/(\d{2}:\d{2})/);return m?m[1]+" WIB":"—"};

async function resolveRole(){
  const {data:{session}}=await db.auth.getSession();
  if(!session)return"";
  const {data}=await db.from("profiles").select("role,aktif").eq("id",session.user.id).maybeSingle();
  if(!data||data.aktif===false)return"";
  const r=String(data.role||"").toLowerCase();
  return r==="spv"?"svp":r;
}
function statusText(s){return s==="MENUNGGU_SPV"?"Menunggu SPV":s==="DISETUJUI_SPV"?"Disetujui SPV":s==="DITOLAK_SPV"?"Ditolak SPV":s||"—"}
async function load(){
  const root=$("pulangAwalSpvEmbed"); if(!root)return;
  role=await resolveRole();
  if(!["svp","owner"].includes(role)){root.hidden=true;return}
  root.hidden=false;
  $("pulangAwalSpvLoading").hidden=false;$("pulangAwalSpvList").innerHTML="";
  const {data,error}=await db.rpc("pulang_awal_list_reviewer_v1",{p_scope:"ALL"});
  $("pulangAwalSpvLoading").hidden=true;
  if(error){$("pulangAwalSpvEmpty").hidden=false;$("pulangAwalSpvEmpty").textContent=error.message;return}
  rows=Array.isArray(data?.rows)?data.rows:[];
  const pending=rows.filter(x=>x.status==="MENUNGGU_SPV"),approved=rows.filter(x=>x.status==="DISETUJUI_SPV"),rejected=rows.filter(x=>x.status==="DITOLAK_SPV");
  $("pulangAwalCountPending").textContent=pending.length;$("pulangAwalCountApproved").textContent=approved.length;$("pulangAwalCountRejected").textContent=rejected.length;
  root.classList.toggle("has-pending-pulang-awal",role==="svp"&&pending.length>0);
  root.classList.toggle("has-owner-pulang-awal-alert",role==="owner"&&(approved.length+rejected.length)>0);
  const show=role==="svp"?pending:rows;
  $("pulangAwalSpvEmpty").hidden=!!show.length;
  $("pulangAwalSpvList").innerHTML=show.map(r=>`
  <article class="pulang-awal-spv-card">
    <div class="pulang-awal-spv-card-head"><div><h3>${esc(r.nama_karyawan||("Karyawan #"+r.karyawan_id))}</h3><p>${esc(r.jabatan||"—")} • ${esc(r.nama_cabang||"—")}</p></div><span class="pulang-awal-kind">${esc(r.jenis||"—")}</span></div>
    <div class="pulang-awal-meta"><div><small>Tanggal</small><b>${fmtDate(r.tanggal)}</b></div><div><small>Jam Masuk</small><b>${fmtTime(r.jam_masuk_snapshot)}</b></div><div><small>Jam Pulang</small><b>${fmtTime(r.jam_pulang_setelah)}</b></div><div><small>Status</small><b>${esc(statusText(r.status))}</b></div></div>
    <div class="pulang-awal-reason">${esc(r.alasan||"—")}</div>
    <div class="pulang-awal-actions"><button class="pulang-awal-proof" data-proof-id="${r.id}" type="button">Lihat Bukti</button><button class="pulang-awal-review" data-review-id="${r.id}" type="button">${role==="owner"||r.status!=="MENUNGGU_SPV"?"Lihat Detail":"Review"}</button></div>
  </article>`).join("");
  if(location.hash==="#pulangAwalSpvEmbed")setTimeout(()=>root.scrollIntoView({behavior:"smooth",block:"start"}),120);
}
async function openReview(id){
  current=rows.find(x=>String(x.id)===String(id));if(!current)return;

  if(role==="owner"&&!current.owner_read_at){
    try{
      const {data,error}=await db.rpc("mark_pulang_awal_owner_read_v1",{p_pengajuan_id:current.id});
      if(error)throw error;
      current.owner_read_at=data?.owner_read_at||new Date().toISOString();
      try{await window.ERPGlobalNotifications?.refresh?.()}catch(_){}
    }catch(e){
      console.warn("[PulangAwal] owner read marker",e);
    }
  }

  const modal=$("pulangAwalSpvModal");
  const jenisClass=String(current.jenis||"").toLowerCase();
  if(modal){
    modal.classList.remove("is-izin","is-sakit","is-libur");
    if(["izin","sakit","libur"].includes(jenisClass)) modal.classList.add("is-"+jenisClass);
  }
  $("pulangAwalModalTitle").textContent=(role==="owner"?"Detail":"Review")+" • "+(current.jenis||"—");
  $("pulangAwalModalMeta").textContent=(current.nama_karyawan||"—")+" • "+(current.nama_cabang||"—")+" • "+fmtDate(current.tanggal);
  $("pulangAwalModalReason").textContent=current.alasan||"—";
  $("pulangAwalSpvNote").value=current.spv_catatan||"";
  const readonly=role==="owner"||current.status!=="MENUNGGU_SPV";
  $("pulangAwalDecisionActions").hidden=readonly;
  $("pulangAwalDecisionRead").hidden=!readonly;
  if(readonly)$("pulangAwalDecisionRead").textContent=statusText(current.status)+" • "+(current.spv_catatan||"Tanpa catatan");
  $("pulangAwalModalMsg").textContent="";
  $("pulangAwalSpvModal").hidden=false;
}
async function decide(action){
  if(!current||busy||role!=="svp")return;
  const note=String($("pulangAwalSpvNote").value||"").trim();
  if(action==="TOLAK"&&note.length<3){$("pulangAwalModalMsg").textContent="Catatan wajib minimal 3 karakter untuk penolakan.";return}
  busy=true;$("pulangAwalApprove").disabled=true;$("pulangAwalReject").disabled=true;$("pulangAwalModalMsg").textContent="Menyimpan keputusan...";
  const {error}=await db.rpc("review_pulang_awal_spv_v1",{p_pengajuan_id:current.id,p_action:action,p_catatan:note||null});
  busy=false;$("pulangAwalApprove").disabled=false;$("pulangAwalReject").disabled=false;
  if(error){$("pulangAwalModalMsg").textContent=error.message||"Gagal memproses.";return}
  $("pulangAwalSpvModal").hidden=true;current=null;await load();

  /* Sinkronkan tampilan Absensi ERP segera setelah keputusan SPV.
     Tidak mengubah engine Absensi; hanya meminta modul yang sudah aktif
     membaca ulang data terbaru dari database. */
  try{
    if(window.AbsensiOwner?.loadDashboard){
      await window.AbsensiOwner.loadDashboard();
      window.AbsensiOwner.loadAktivitasTerbaru?.();
    }
  }catch(e){
    console.warn("[PulangAwal] refresh AbsensiOwner",e);
  }

  try{
    if(window.AbsensiLaporanBulanan?.showDailyAudit){
      await window.AbsensiLaporanBulanan.showDailyAudit();
    }
  }catch(e){
    console.warn("[PulangAwal] refresh audit Absensi",e);
  }

  try{await window.ERPGlobalNotifications?.refresh?.()}catch(_){}
}
async function openProof(id){
  const row=rows.find(x=>String(x.id)===String(id));if(!row?.bukti_path)return;
  const {data,error}=await db.storage.from("izin-proofs").createSignedUrl(row.bukti_path,90);
  if(error||!data?.signedUrl)return;
  $("pulangAwalProofImage").src=data.signedUrl;$("pulangAwalProofModal").hidden=false;
}
function bind(){
  $("pulangAwalSpvRefresh")?.addEventListener("click",load);
  $("pulangAwalSpvList")?.addEventListener("click",e=>{const p=e.target.closest("[data-proof-id]"),r=e.target.closest("[data-review-id]");if(p)openProof(p.dataset.proofId);if(r)openReview(r.dataset.reviewId)});
  document.querySelectorAll("[data-pulang-awal-close]").forEach(x=>x.addEventListener("click",()=>{$("pulangAwalSpvModal").hidden=true;current=null}));
  document.querySelectorAll("[data-pulang-proof-close]").forEach(x=>x.addEventListener("click",()=>{$("pulangAwalProofModal").hidden=true;$("pulangAwalProofImage").removeAttribute("src")}));
  $("pulangAwalApprove")?.addEventListener("click",()=>decide("ACC"));$("pulangAwalReject")?.addEventListener("click",()=>decide("TOLAK"));
}
async function boot(){bind();await load()}
return{boot,refresh:load};
})();
