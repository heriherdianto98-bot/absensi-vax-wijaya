/* ERP VAX — keep only latest Setoran 3 Harian proof + dark viewer scrollbar */
"use strict";
(function(){
  if(typeof SetoranDirectFlow==="undefined") return;
  const flow=SetoranDirectFlow;

  async function prune(saved){
    if(!saved?.id) return null;
    const {data,error}=await db.from(flow.PROOF_TABLE)
      .select("id,storage_path,proof_kind,uploaded_at,uploaded_by")
      .eq("setoran_id",saved.id)
      .order("uploaded_at",{ascending:false});
    if(error) throw error;
    const proofs=data||[], latest=proofs[0]||null, old=proofs.slice(1);
    if(old.length){
      const paths=old.map(x=>x.storage_path).filter(Boolean);
      if(paths.length){
        const {error:se}=await db.storage.from(flow.PROOF_BUCKET).remove(paths);
        if(se) throw se;
      }
      const ids=old.map(x=>x.id).filter(Boolean);
      if(ids.length){
        const {error:de}=await db.from(flow.PROOF_TABLE).delete().in("id",ids);
        if(de) throw de;
      }
    }
    saved._proofLatest=latest;
    saved.proof_path=latest?.storage_path||null;
    return latest;
  }

  const baseLoad=flow.loadSavedRows.bind(flow);
  flow.loadSavedRows=async function(p){
    await baseLoad(p);
    for(const saved of this.savedRows.values()){
      try{await prune(saved);}catch(err){console.warn("[Setoran3Harian] proof cleanup",err);}
    }
  };

  const baseUpload=flow.uploadProof.bind(flow);
  flow.uploadProof=async function(saved,file,kind){
    const result=await baseUpload(saved,file,kind);
    await prune(saved);
    return result;
  };

  const baseOpen=flow.openProof.bind(flow);
  flow.openProof=async function(branchId){
    const saved=this.savedRows.get(this.key(branchId));
    if(saved?.id) await prune(saved);
    return baseOpen(branchId);
  };

  const style=document.createElement("style");
  style.textContent=`
    #s3proofViewModal .s3sheet-modal-panel{scrollbar-width:thin;scrollbar-color:#496176 #0b1723;}
    #s3proofViewModal .s3sheet-modal-panel::-webkit-scrollbar{width:9px;height:9px;}
    #s3proofViewModal .s3sheet-modal-panel::-webkit-scrollbar-track{background:#0b1723;}
    #s3proofViewModal .s3sheet-modal-panel::-webkit-scrollbar-thumb{background:#496176;border:2px solid #0b1723;border-radius:999px;}
    #s3proofViewModal .s3sheet-modal-panel::-webkit-scrollbar-thumb:hover{background:#d8a53b;}
  `;
  document.head.appendChild(style);
})();
