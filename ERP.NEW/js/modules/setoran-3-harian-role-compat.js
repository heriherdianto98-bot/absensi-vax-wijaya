/* ERP VAX — Setoran 3 Harian role compatibility
   Owner = review/verification only. SVP/SPV = manual entry workflow.
   Tidak mengubah engine canonical; hanya memisahkan permission role pada halaman Setoran 3 Harian. */
(function(){
  "use strict";
  if(typeof SetoranDirectFlow === "undefined") return;

  // Legacy direct-flow memakai isSvp() sebagai gate untuk input/edit manual.
  // Owner harus READ ONLY pada tabel, kecuali aksi Owner khusus yang ditangani modul terpisah:
  // VERIF OWNER, review/lihat bukti, dan minta koreksi.
  SetoranDirectFlow.isSvp = function(){
    return ["svp","spv"].includes(String(this.role||"").toLowerCase());
  };

  SetoranDirectFlow.loadIdentity = async function(){
    const {data:s,error:se}=await db.auth.getSession();
    if(se) throw se;
    this.user=s?.session?.user;
    if(!this.user) throw new Error("Sesi tidak ditemukan.");

    const {data,error}=await db.from("profiles")
      .select("id,nama,role,aktif")
      .eq("id",this.user.id)
      .maybeSingle();
    if(error) throw error;
    if(!data||data.aktif===false) throw new Error("Profil tidak aktif.");

    this.profile=data;
    this.role=String(data.role||"").toLowerCase();
    if(!["owner","svp","spv"].includes(this.role)){
      throw new Error("Akses hanya Owner / SPV.");
    }

    const roleEl=document.getElementById("s3v2Role");
    const userEl=document.getElementById("s3v2User");
    if(roleEl) roleEl.textContent=this.role==="owner"?"OWNER · REVIEW":"SPV · VERIFIKASI";
    if(userEl) userEl.textContent=data.nama||this.role.toUpperCase();
  };
})();
