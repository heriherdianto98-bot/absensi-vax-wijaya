/* ERP VAX — Setoran 3 Harian role compatibility
   Owner and SPV/SVP may perform direct manual verification entry.
   Owner remains visually identified as Owner, but is no longer read-only. */
(function(){
  "use strict";
  if(typeof SetoranDirectFlow === "undefined") return;

  // Legacy workflow uses isSvp() as the edit-permission gate.
  // Direct-flow decision: Owner has the same manual entry permission as SPV/SVP.
  SetoranDirectFlow.isSvp = function(){
    return ["owner","svp","spv"].includes(String(this.role||"").toLowerCase());
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
    if(roleEl) roleEl.textContent=this.role==="owner"?"OWNER · VERIFIKASI":"SPV · VERIFIKASI";
    if(userEl) userEl.textContent=data.nama||this.role.toUpperCase();
  };
})();
