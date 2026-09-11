/* ERP VAX — UI ONLY: collapsible Daftar Master Tagihan card + global header role sync. */
"use strict";
(() => {
  const STYLE_ID = "masterTagihanListCollapseUiStyle";
  const STORAGE_KEY = "erp-vax-master-tagihan-list-collapsed";
  let headerSyncRunning = false;
  let headerSyncDone = false;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement("style");
    s.id=STYLE_ID;
    s.textContent=`
      .page-master-tagihan .mt-card.mt-list-collapsible .mt-card-head{cursor:pointer;user-select:none;position:relative;padding-right:58px}
      .page-master-tagihan .mt-card.mt-list-collapsible .mt-card-head:hover{background:rgba(72,189,226,.035)}
      .page-master-tagihan .mt-card.mt-list-collapsible .mt-list-collapse-toggle{position:absolute;right:18px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:1px solid rgba(82,194,231,.28);border-radius:10px;background:rgba(17,41,55,.72);color:#9edff5;display:grid;place-items:center;font-size:15px;font-weight:900;line-height:1;transition:transform .16s ease,background .16s ease,border-color .16s ease}
      .page-master-tagihan .mt-card.mt-list-collapsible .mt-card-head:hover .mt-list-collapse-toggle{background:rgba(31,91,117,.62);border-color:rgba(105,218,255,.5)}
      .page-master-tagihan .mt-card.mt-list-collapsible.is-collapsed .mt-table-wrap{display:none!important}
      .page-master-tagihan .mt-card.mt-list-collapsible.is-collapsed .mt-list-collapse-toggle{transform:translateY(-50%) rotate(-90deg)}
      .page-master-tagihan .mt-card.mt-list-collapsible.is-collapsed{min-height:0!important}
    `;
    document.head.appendChild(s);
  }

  function getInitialState(){
    try{
      const saved=sessionStorage.getItem(STORAGE_KEY);
      if(saved===null) return true;
      return saved==="1";
    }catch{return true}
  }

  function saveState(collapsed){
    try{sessionStorage.setItem(STORAGE_KEY,collapsed?"1":"0")}catch{}
  }

  function install(){
    const cards=[...document.querySelectorAll(".page-master-tagihan .mt-card")];
    const card=cards.find(c=>String(c.querySelector(".mt-card-head strong")?.textContent||"").trim().toUpperCase()==="DAFTAR MASTER TAGIHAN");
    if(!card) return false;
    if(card.dataset.collapseReady==="1") return true;

    ensureStyle();
    card.dataset.collapseReady="1";
    card.classList.add("mt-list-collapsible");
    const head=card.querySelector(".mt-card-head");
    if(!head) return true;

    const toggle=document.createElement("span");
    toggle.className="mt-list-collapse-toggle";
    toggle.setAttribute("aria-hidden","true");
    toggle.textContent="⌄";
    head.appendChild(toggle);

    const apply=collapsed=>{
      card.classList.toggle("is-collapsed",collapsed);
      head.setAttribute("aria-expanded",collapsed?"false":"true");
      saveState(collapsed);
    };

    apply(getInitialState());
    head.addEventListener("click",e=>{
      if(e.target.closest("button,a,input,select,textarea")) return;
      apply(!card.classList.contains("is-collapsed"));
    });
    return true;
  }

  async function syncGlobalHeaderRole(){
    if(headerSyncDone || headerSyncRunning) return headerSyncDone;
    if(!window.OwnerAuth || typeof window.OwnerAuth.requireFinance!=="function") return false;
    const header=document.getElementById("header");
    if(!header || !document.getElementById("ownerAuthName") || !document.getElementById("ownerAuthRole")) return false;

    headerSyncRunning=true;
    try{
      const ok=await window.OwnerAuth.requireFinance();
      if(!ok) return false;

      window.OwnerAuth.syncHeader?.();
      window.OwnerAuth.applyAccessControl?.();
      window.syncSidebarRoleMeta?.();

      const cabang=document.getElementById("erpHeaderCabang");
      const periode=document.getElementById("erpHeaderPeriode");
      if(cabang) cabang.textContent="Semua Cabang";
      if(periode) periode.textContent="Master Data";

      headerSyncDone=true;
      return true;
    }catch(err){
      console.warn("[Master Tagihan Header UI]",err?.message||err);
      return false;
    }finally{
      headerSyncRunning=false;
    }
  }

  function ensureInvoiceHistoryUi(){
    if(document.querySelector('script[data-invoice-history-search-ui]')) return;
    const s=document.createElement('script');
    s.src='../js/modules/master-tagihan-invoice-history-search-ui.js?v=20260911-1';
    s.async=false;
    s.dataset.invoiceHistorySearchUi='1';
    document.head.appendChild(s);
  }

  let tries=0;
  const timer=setInterval(()=>{
    const collapseReady=install();
    syncGlobalHeaderRole();
    ensureInvoiceHistoryUi();
    if((collapseReady && headerSyncDone)||++tries>180) clearInterval(timer);
  },100);

  window.addEventListener("load",()=>{
    setTimeout(install,500);
    setTimeout(syncGlobalHeaderRole,550);
    setTimeout(syncGlobalHeaderRole,1400);
    setTimeout(ensureInvoiceHistoryUi,650);
  });
})();
