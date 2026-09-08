/*
=========================================================
VAX ERP — ARUS KAS V2 LEDGER ORDER UI
Additive presentation layer only. Tidak mengubah engine LOCK,
query, formula, payload, atau urutan data source.

Tujuan:
- Buku Arus Kas tampil history terbaru di atas.
- Tanggal terbaru -> terlama hanya pada DOM/table presentation.
- Urutan transaksi di tanggal yang sama tetap dipertahankan.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__ledgerOrderUiInstalled) return;
  flow.__ledgerOrderUiInstalled=true;

  let sorting=false;
  let queued=false;

  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;

  function sortNewestFirst(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body || sorting) return;

    const rows=[...body.querySelectorAll(":scope > tr[data-id]")];
    if(rows.length<2) return;

    const ordered=rows.map((tr,index)=>{
      const row=rowById(tr.dataset.id)||{};
      return {tr,index,date:String(row.tanggal||"")};
    }).sort((a,b)=>{
      const byDate=b.date.localeCompare(a.date);
      return byDate || (a.index-b.index);
    });

    const changed=ordered.some((item,index)=>item.tr!==rows[index]);
    if(!changed) return;

    sorting=true;
    try{
      const frag=document.createDocumentFragment();
      ordered.forEach(item=>frag.appendChild(item.tr));
      body.appendChild(frag);
    }finally{
      sorting=false;
    }
  }

  function schedule(){
    if(queued || sorting) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      sortNewestFirst();
    });
  }

  function installObserver(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return false;
    sortNewestFirst();
    new MutationObserver(()=>{
      if(!sorting) schedule();
    }).observe(body,{childList:true,subtree:false});
    return true;
  }

  if(!installObserver()){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(installObserver() || tries>=80) clearInterval(timer);
    },50);
  }
})();
