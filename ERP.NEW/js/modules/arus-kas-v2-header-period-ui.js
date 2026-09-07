/* ARUS KAS V2 — HEADER PERIOD SYNC UI ONLY
   Sinkronkan chip PERIODE AKTIF di header global dengan periode Arus Kas.
   Tidak mengubah engine, query, formula, transaksi, saldo, atau data flow.
*/
"use strict";

(function(){
  function fmt(iso){
    if(!iso) return "—";
    const [y,m,d]=String(iso).slice(0,10).split("-").map(Number);
    if(!y||!m||!d) return "—";
    return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(y,m-1,d));
  }

  function getPeriodText(){
    const start=document.getElementById("ak2Start")?.value;
    const end=document.getElementById("ak2End")?.value;
    if(!start||!end) return "—";
    return start===end ? fmt(start) : `${fmt(start)} — ${fmt(end)}`;
  }

  function sync(){
    const target=document.getElementById("erpHeaderPeriode");
    if(!target) return false;
    target.textContent=getPeriodText();
    return true;
  }

  function bindInputs(){
    ["ak2Start","ak2End"].forEach(id=>{
      const el=document.getElementById(id);
      if(!el||el.dataset.ak2HeaderPeriodBound==="1") return;
      el.dataset.ak2HeaderPeriodBound="1";
      el.addEventListener("change",()=>setTimeout(sync,0));
      el.addEventListener("input",()=>setTimeout(sync,0));
    });
  }

  function startSync(){
    bindInputs();
    sync();
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      bindInputs();
      if(sync() && document.getElementById("ak2Start")?.value && document.getElementById("ak2End")?.value){
        if(tries>=20) clearInterval(timer);
      }
      if(tries>=80) clearInterval(timer);
    },100);
  }

  document.addEventListener("erp:finance-ready",()=>{
    setTimeout(startSync,0);
    setTimeout(sync,250);
    setTimeout(sync,700);
    setTimeout(sync,1400);
  });

  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(startSync,0);
  });

  window.ArusKasV2HeaderPeriodUI={sync};
})();
