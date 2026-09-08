/* ERP VAX — Setoran 3 Harian proof guard + keep latest proof per kind + dark viewer scrollbar */
"use strict";
(function(){
  if(typeof SetoranDirectFlow === "undefined") return;
  const flow=SetoranDirectFlow;

  function money(v){
    const n=Number(v);
    return Number.isFinite(n)?n:0;
  }

  async function prune(saved){
    if(!saved?.id) return null;
    const {data,error}=await db.from(flow.PROOF_TABLE)
      .select("id,storage_path,proof_kind,uploaded_at,uploaded_by")
      .eq("setoran_id",saved.id)
      .order("uploaded_at",{ascending:false});
    if(error) throw error;

    const proofs=data||[];
    const keepKinds=new Set();
    const keep=[];
    const old=[];

    for(const proof of proofs){
      const kind=String(proof.proof_kind||"SETORAN").toUpperCase();
      if(!keepKinds.has(kind)){
        keepKinds.add(kind);
        keep.push(proof);
      }else{
        old.push(proof);
      }
    }

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

    const latest=keep[0]||null;
    saved._proofLatest=latest;
    saved._proofByKind=Object.fromEntries(keep.map(x=>[String(x.proof_kind||"SETORAN").toUpperCase(),x]));
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
    let effectiveKind=String(kind||"SETORAN").toUpperCase();

    /* Jika dalam satu baris ada selisih non tunai + biaya di luar Cashout,
       foto pertama disimpan sebagai bukti BRI Merchant, foto berikutnya sebagai bukti biaya. */
    if(effectiveKind==="NON_CASH_DIFF" && Math.abs(money(saved?.non_cash_difference))>.5 && money(saved?.outside_cashout_cost)>0 && saved?.id){
      const proofs=await this.getProofRows(saved.id);
      const hasDiff=proofs.some(p=>String(p.proof_kind||"").toUpperCase()==="NON_CASH_DIFF");
      const hasOutside=proofs.some(p=>String(p.proof_kind||"").toUpperCase()==="OUTSIDE_CASHOUT");
      if(hasDiff && !hasOutside) effectiveKind="OUTSIDE_CASHOUT";
    }

    const result=await baseUpload(saved,file,effectiveKind);
    await prune(saved);
    return result;
  };

  /* Guard SUDAH DIAMBIL:
     - selisih non tunai wajib foto bukti uang masuk BRI Merchant (NON_CASH_DIFF)
     - biaya di luar Cashout wajib foto bukti biaya (OUTSIDE_CASHOUT)
     - bukti jenis lain tidak boleh dianggap memenuhi syarat. */
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
        if(needsOutside && !hasOutside && !hasPending){
          throw new Error("Ada biaya di luar Cashout. Wajib isi keterangan dan lampirkan foto bukti biaya sebelum centang Sudah Diambil.");
        }
        if(needsDiff && needsOutside && !hasDiff && !hasOutside && hasPending){
          throw new Error("Ada selisih Non Tunai dan biaya di luar Cashout. Dibutuhkan 2 bukti: foto uang masuk BRI Merchant dan foto bukti biaya.");
        }
      }
    }

    return baseSave(tr,options);
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

/* UI-only enhancement loaded after the proof guard so its popup UX wins last. */
(function(){
  const current=document.currentScript;
  if(!current||document.querySelector('script[data-s3-proof-replace-ui]')) return;
  const s=document.createElement('script');
  s.dataset.s3ProofReplaceUi='1';
  s.src=new URL('setoran-3-harian-proof-replace-ui.js',current.src).href;
  document.head.appendChild(s);
})();

/* Additive popup khusus Biaya di luar Cashout, lalu sync ulang state bukti setelah popup save. */
(function(){
  const current=document.currentScript;
  if(!current||document.querySelector('script[data-s3-outside-input-gate]')) return;
  const s=document.createElement('script');
  s.dataset.s3OutsideInputGate='1';
  s.src=new URL('setoran-3-harian-outside-input-gate.js',current.src).href;
  s.onload=()=>{
    if(!document.querySelector('script[data-s3-outside-proof-state-fix]')){
      const fix=document.createElement('script');
      fix.dataset.s3OutsideProofStateFix='1';
      fix.src=new URL('setoran-3-harian-outside-proof-state-fix.js',current.src).href;
      document.head.appendChild(fix);
    }
    if(!document.querySelector('script[data-s3-outside-proof-viewer]')){
      const viewer=document.createElement('script');
      viewer.dataset.s3OutsideProofViewer='1';
      viewer.src=new URL('setoran-3-harian-outside-proof-viewer.js',current.src).href;
      document.head.appendChild(viewer);
    }
  };
  document.head.appendChild(s);
})();