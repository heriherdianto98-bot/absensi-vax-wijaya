/* ERP VAX — Setoran 3 Harian proof guard + latest proof state per kind.
   Non-destructive: READ/view/upload tidak pernah menghapus bukti lama. */
"use strict";
(function(){
  if(typeof SetoranDirectFlow==="undefined") return;
  const flow=SetoranDirectFlow;

  function money(v){
    const n=Number(v);
    return Number.isFinite(n)?n:0;
  }

  /* Sinkronkan state proof terbaru per jenis TANPA delete Storage/DB.
     Bukti adalah audit trail; cleanup tidak boleh terjadi saat load/view/upload biasa. */
  async function syncProofState(saved){
    if(!saved?.id) return null;
    const {data,error}=await db.from(flow.PROOF_TABLE)
      .select("id,storage_path,proof_kind,uploaded_at,uploaded_by")
      .eq("setoran_id",saved.id)
      .order("uploaded_at",{ascending:false});
    if(error) throw error;

    const proofs=data||[];
    const byKind={};
    for(const proof of proofs){
      const kind=String(proof.proof_kind||"SETORAN").toUpperCase();
      if(!byKind[kind]) byKind[kind]=proof;
    }

    const latest=proofs[0]||null;
    saved._proofLatest=latest;
    saved._proofByKind=byKind;
    saved.proof_path=latest?.storage_path||null;
    return latest;
  }

  const baseLoad=flow.loadSavedRows.bind(flow);
  flow.loadSavedRows=async function(p){
    await baseLoad(p);
    for(const saved of this.savedRows.values()){
      try{await syncProofState(saved);}catch(err){console.warn("[Setoran3Harian] proof state sync",err);}
    }
  };

  const baseUpload=flow.uploadProof.bind(flow);
  flow.uploadProof=async function(saved,file,kind){
    let effectiveKind=String(kind||"SETORAN").toUpperCase();

    /* Jika satu baris memiliki selisih Non Tunai + biaya di luar Cashout,
       bukti tetap dipisahkan berdasarkan proof_kind. */
    if(effectiveKind==="NON_CASH_DIFF" && Math.abs(money(saved?.non_cash_difference))>.5 && money(saved?.outside_cashout_cost)>0 && saved?.id){
      const proofs=await this.getProofRows(saved.id);
      const hasDiff=proofs.some(p=>String(p.proof_kind||"").toUpperCase()==="NON_CASH_DIFF");
      const hasOutside=proofs.some(p=>String(p.proof_kind||"").toUpperCase()==="OUTSIDE_CASHOUT");
      if(hasDiff && !hasOutside) effectiveKind="OUTSIDE_CASHOUT";
    }

    const result=await baseUpload(saved,file,effectiveKind);
    await syncProofState(saved);
    return result;
  };

  /* Guard SUDAH DIAMBIL:
     - selisih non tunai wajib bukti NON_CASH_DIFF
     - biaya di luar Cashout wajib bukti OUTSIDE_CASHOUT
     - bukti jenis lain tidak memenuhi syarat. */
  const baseSave=flow.saveRow.bind(flow);
  flow.saveRow=async function(tr,options={}){
    if(options?.taken===true){
      const d=this.draftFromRow(tr);
      const needsDiff=d.diff!=null && Math.abs(money(d.diff))>.5;
      const needsOutside=money(d.outside)>0;

      if(needsDiff || needsOutside){
        const existing=this.savedRows.get(this.key(d.id));
        const proofs=existing?.id ? await this.getProofRows(existing.id) : [];
        const hasDiff=proofs.some(p=>String(p.proof_kind||"").toUpperCase()==="NON_CASH_DIFF");
        const hasOutside=proofs.some(p=>String(p.proof_kind||"").toUpperCase()==="OUTSIDE_CASHOUT");
        const hasPending=this.pendingFiles.has(this.key(d.id));

        if(needsDiff && !hasDiff && !hasPending){
          throw new Error("Ada selisih Non Tunai. Wajib lampirkan foto bukti uang masuk BRI Merchant sebelum centang Sudah Diambil.");
        }
        if(needsOutside && !hasOutside){
          throw new Error("Ada biaya di luar Cashout. Wajib lampirkan foto bukti biaya sebelum centang Sudah Diambil.");
        }
        if(needsDiff && needsOutside && !hasDiff && !hasOutside && hasPending){
          throw new Error("Ada selisih Non Tunai dan biaya di luar Cashout. Dibutuhkan 2 bukti terpisah.");
        }
      }
    }

    return baseSave(tr,options);
  };

  const baseOpen=flow.openProof.bind(flow);
  flow.openProof=async function(branchId){
    const saved=this.savedRows.get(this.key(branchId));
    if(saved?.id) await syncProofState(saved);
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

/* UI-only enhancement loaded after the proof guard so its existing proof UX remains intact. */
(function(){
  const current=document.currentScript;
  if(!current||document.querySelector('script[data-s3-proof-replace-ui]')) return;
  const s=document.createElement('script');
  s.dataset.s3ProofReplaceUi='1';
  s.src=new URL('setoran-3-harian-proof-replace-ui.js',current.src).href;
  document.head.appendChild(s);
})();
