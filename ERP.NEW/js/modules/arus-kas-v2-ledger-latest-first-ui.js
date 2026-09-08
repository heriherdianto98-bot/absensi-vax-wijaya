/*
=========================================================
ERP VAX — ARUS KAS V2 LEDGER LATEST-FIRST UI
UI-only ordering layer.
- Tanggal terbaru tampil di atas.
- Di tanggal yang sama, transaksi paling akhir tampil paling atas.
- Tidak mengubah ledger, saldo, query, engine, formula, atau database.
=========================================================
*/
"use strict";
(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__ledgerLatestFirstUiInstalled) return;
  flow.__ledgerLatestFirstUiInstalled=true;

  let applying=false;
  let queued=false;

  const rowById=id=>(flow.ledger||[]).find(r=>String(r.id)===String(id))||null;

  function key(row){
    return {
      tanggal:String(row?.tanggal||""),
      created:String(row?.created_at||row?.updated_at||""),
      id:String(row?.id||"")
    };
  }

  function compareTr(a,b){
    const ra=rowById(a.dataset.id), rb=rowById(b.dataset.id);
    const ka=key(ra), kb=key(rb);
    if(ka.tanggal!==kb.tanggal) return kb.tanggal.localeCompare(ka.tanggal);
    if(ka.created!==kb.created) return kb.created.localeCompare(ka.created);
    return kb.id.localeCompare(ka.id);
  }

  function apply(){
    if(applying) return;
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;
    const rows=[...body.querySelectorAll(":scope > tr[data-id]")];
    if(rows.length<2) return;

    const sorted=[...rows].sort(compareTr);
    const same=rows.every((tr,i)=>tr===sorted[i]);
    if(same) return;

    applying=true;
    try{
      const frag=document.createDocumentFragment();
      sorted.forEach(tr=>frag.appendChild(tr));
      body.appendChild(frag);
    }finally{
      applying=false;
    }
  }

  function schedule(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      apply();
    });
  }

  function bind(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body || body.dataset.ak2LatestFirstBound==="1") return false;
    body.dataset.ak2LatestFirstBound="1";
    const obs=new MutationObserver(()=>{ if(!applying) schedule(); });
    obs.observe(body,{childList:true});
    schedule();
    return true;
  }

  document.addEventListener("erp:finance-ready",()=>{
    setTimeout(bind,0);
    setTimeout(schedule,120);
    setTimeout(schedule,400);
  });
  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(bind,0);
    setTimeout(schedule,250);
  });

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    bind();
    schedule();
    if(tries>=40) clearInterval(timer);
  },150);

  window.ArusKasV2LedgerLatestFirstUI={apply,schedule};
})();
