/* ERP VAX — keep OUTSIDE_CASHOUT proof state alive after popup save.
   Additive state sync only; does not change canonical money engines/formulas. */
"use strict";
(function bootOutsideProofStateFix(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsideProofStateFix,60);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__outsideProofStateFixInstalled) return;
  flow.__outsideProofStateFixInstalled=true;

  async function refreshProofState(id){
    const saved=flow.savedRows.get(flow.key(id));
    if(!saved?.id) return saved||null;
    const proofs=await flow.getProofRows(saved.id);
    const byKind={};
    for(const p of proofs){
      const kind=String(p.proof_kind||"SETORAN").toUpperCase();
      if(!byKind[kind]) byKind[kind]=p;
    }
    saved._proofByKind=byKind;
    saved._proofLatest=proofs[0]||null;
    if(proofs[0]?.storage_path) saved.proof_path=proofs[0].storage_path;
    return saved;
  }

  const baseSave=flow.saveRow.bind(flow);
  flow.saveRow=async function(tr,options={}){
    const id=Number(tr?.dataset?.cabangId||0);
    const result=await baseSave(tr,options);
    if(id){
      try{await refreshProofState(id);}catch(err){console.warn("[Setoran3Harian] refresh outside proof state",err);}
    }
    return result;
  };

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const result=baseRender(...arguments);
    for(const tr of document.querySelectorAll('#s3sheetBody tr[data-cabang-id]')){
      const id=Number(tr.dataset.cabangId||0);
      const saved=flow.savedRows.get(flow.key(id))||{};
      const btn=tr.querySelector('[data-s3-outside-open]');
      if(btn && saved._proofByKind?.OUTSIDE_CASHOUT){
        btn.classList.add('has-data');
        btn.title='Lihat / ubah Biaya di luar Cashout';
      }
    }
    return result;
  };

  /* Initial sync after the popup module is loaded, so reopening reflects DB truth. */
  setTimeout(async()=>{
    for(const [k,saved] of flow.savedRows.entries()){
      if(saved?.id){
        try{await refreshProofState(Number(k));}catch(_e){}
      }
    }
  },120);
})();
