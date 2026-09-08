/* ARUS KAS V2 — HEADER PERIOD SYNC UI ONLY
   Sinkronkan chip PERIODE AKTIF di header global dengan periode Arus Kas.
   Juga memasang runtime guard agar ArusKasV2.init() tidak berjalan ganda.
   Tidak mengubah engine, query, formula, transaksi, saldo, atau data flow.
*/
"use strict";

(function(){
  /* Runtime guard UI-layer: cegah bind ganda dari DOMContentLoaded + erp:finance-ready. */
  const flow=window.ArusKasV2;
  if(flow && typeof flow.init==="function" && !flow.__uiInitGuardInstalled){
    flow.__uiInitGuardInstalled=true;
    const baseInit=flow.init;
    let initPromise=null;
    flow.init=function(){
      if(initPromise) return initPromise;
      const ctx=this,args=arguments;
      initPromise=Promise.resolve()
        .then(()=>baseInit.apply(ctx,args))
        .catch(err=>{initPromise=null;throw err;});
      return initPromise;
    };
  }

  /* Muat additive mutation-view module. Tidak memblokir engine dan tidak query sendiri. */
  if(!document.querySelector('script[data-ak2-ledger-mutation-ui]')){
    const s=document.createElement("script");
    s.src="../js/modules/arus-kas-v2-ledger-mutation-ui.js";
    s.async=false;
    s.dataset.ak2LedgerMutationUi="1";
    document.head.appendChild(s);
  }

  /* Muat additive performance orchestration + tombol Refresh Semua. */
  if(!document.querySelector('script[data-ak2-performance-ui]')){
    const p=document.createElement("script");
    p.src="../js/modules/arus-kas-v2-performance-ui.js";
    p.async=false;
    p.dataset.ak2PerformanceUi="1";
    document.head.appendChild(p);
  }

  /* UI only: samakan dropdown bulan/tahun dengan tema dark-gold ERP. */
  if(!document.querySelector('script[data-ak2-period-theme-ui]')){
    const t=document.createElement("script");
    t.src="../js/modules/arus-kas-v2-period-theme-ui.js";
    t.async=false;
    t.dataset.ak2PeriodThemeUi="1";
    document.head.appendChild(t);
  }

  /* UI only: orbit halus berulang di garis bawah header Buku Arus Kas. */
  if(!document.querySelector('script[data-ak2-ledger-header-orbit-ui]')){
    const o=document.createElement("script");
    o.src="../js/modules/arus-kas-v2-ledger-header-orbit-ui.js";
    o.async=false;
    o.dataset.ak2LedgerHeaderOrbitUi="1";
    document.head.appendChild(o);
  }

  /* UI only: pulihkan pembatas horizontal pada kolom Cabang. */
  if(!document.querySelector('script[data-ak2-cabang-divider-ui]')){
    const d=document.createElement("script");
    d.src="../js/modules/arus-kas-v2-cabang-divider-ui.js";
    d.async=false;
    d.dataset.ak2CabangDividerUi="1";
    document.head.appendChild(d);
  }

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
