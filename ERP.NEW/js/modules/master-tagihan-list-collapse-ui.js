/* ERP VAX — UI ONLY: collapsible master list, authenticated header, readable invoice draft. */
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
      .page-master-tagihan .mt-card.mt-list-collapsible .mt-list-collapse-toggle{position:absolute;right:18px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:1px solid rgba(82,194,231,.28);color:#9edff5;background:rgba(17,41,55,.72);display:grid;place-items:center;font-size:15px;font-weight:900;line-height:1;transition:transform .16s ease,background .16s ease,border-color .16s ease}
      .page-master-tagihan .mt-card.mt-list-collapsible .mt-card-head:hover .mt-list-collapse-toggle{background:rgba(31,91,117,.62);border-color:rgba(105,218,255,.5)}
      .page-master-tagihan .mt-card.mt-list-collapsible.is-collapsed .mt-table-wrap{display:none!important}
      .page-master-tagihan .mt-card.mt-list-collapsible.is-collapsed .mt-list-collapse-toggle{transform:translateY(-50%) rotate(-90deg)}
      .page-master-tagihan .mt-card.mt-list-collapsible.is-collapsed{min-height:0!important}

      /* Actual Owner draft accordion, including its zero-draft state. */
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts{background:#263b49!important;border:1px solid #7295aa!important;border-radius:10px!important;overflow:hidden!important;margin:8px 12px!important}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts summary{background:#355468!important;color:#fff!important;border:0!important;padding:14px 18px!important;font-size:14px!important;font-weight:900!important;letter-spacing:.015em}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts summary:hover{background:#42657a!important}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts summary:focus-visible{outline:2px solid #ffe08a;outline-offset:-3px}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts summary::after{color:#ffe08a!important;font-size:17px}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-active{background:#263b49!important;padding:10px 12px 12px!important}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-row{background:#304a5d!important;border:1px solid #7897ac!important;border-radius:10px!important;opacity:1!important}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-empty{background:#304a5d!important;color:#f0f8fc!important;font-size:14px!important;border-radius:9px}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-no{color:#ffe08a!important;font-size:15px!important}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-row small,
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-row>div:nth-child(2){color:#f0f7fc!important;font-size:13px!important}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-total{color:#fff2bd!important;font-size:17px!important}
      .page-master-tagihan #mtInvoiceList .mt-inbox-drafts .mt-invoice-status.draft{background:#ffe3a0!important;color:#392a0b!important;border:1px solid #ffedbf!important}

      /* Draft editor only: do not restyle read-only invoice view, history, or print. */
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-dialog{background:#243440!important;border:1px solid #91aaba!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-dialog-head{background:#314858!important;border-bottom:1px solid #88a3b5!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-dialog-head h2{color:#fff!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-form label span,
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-item-head{color:#edf6fc!important;font-size:12px!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-form input,
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-form textarea,
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-date-trigger{background:#f0f5f8!important;color:#172b3a!important;border:1px solid #aec3d1!important;font-weight:700}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-form input::placeholder,
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-form textarea::placeholder{color:#546b7a!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-items{background:#344b5b!important;border-color:#7894a6!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-item-row{border-color:#607e91!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-item-amount,
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-totalbar strong{color:#ffe08a!important;text-shadow:none!important}
      .page-master-tagihan #mtInvoiceModal:not([data-owner-view-only="1"]):not([data-svp-view-only="1"]) .mt-invoice-totalbar{color:#f0f7fc!important}
    `;
    document.head.appendChild(s);
  }

  function getInitialState(){
    try{const saved=sessionStorage.getItem(STORAGE_KEY);return saved===null?true:saved==="1"}catch{return true}
  }
  function saveState(collapsed){try{sessionStorage.setItem(STORAGE_KEY,collapsed?"1":"0")}catch{}}
  function install(){
    const cards=[...document.querySelectorAll(".page-master-tagihan .mt-card")];
    const card=cards.find(c=>String(c.querySelector(".mt-card-head strong")?.textContent||"").trim().toUpperCase()==="DAFTAR MASTER TAGIHAN");
    if(!card)return false;
    if(card.dataset.collapseReady==="1")return true;
    ensureStyle();
    card.dataset.collapseReady="1";
    card.classList.add("mt-list-collapsible");
    const head=card.querySelector(".mt-card-head");if(!head)return true;
    const toggle=document.createElement("span");toggle.className="mt-list-collapse-toggle";toggle.setAttribute("aria-hidden","true");toggle.textContent="⌄";head.appendChild(toggle);
    const apply=collapsed=>{card.classList.toggle("is-collapsed",collapsed);head.setAttribute("aria-expanded",collapsed?"false":"true");saveState(collapsed)};
    apply(getInitialState());
    head.addEventListener("click",e=>{if(e.target.closest("button,a,input,select,textarea"))return;apply(!card.classList.contains("is-collapsed"))});
    return true;
  }

  /* The Master Tagihan module reads profiles by the active Supabase session itself.
     Use that already-authenticated identity after its async init, rather than a
     temporary OwnerAuth 'User' placeholder or a fixed Owner/SVP name. */
  function showAuthenticatedDisplayName(){
    if(!document.body.classList.contains('page-master-tagihan'))return false;
    const mt=window.MasterTagihan;
    const mtProfile=mt?.profile;
    const sameSession=!!(mtProfile?.id&&mt?.user?.id&&String(mtProfile.id)===String(mt.user.id));
    const profile=sameSession?mtProfile:window.OwnerAuth?.profile;
    const normalized=String(profile?.role||'').trim().toLowerCase();
    if(!['owner','spv','svp'].includes(normalized))return false;
    const role=document.getElementById('ownerAuthRole');
    const name=document.getElementById('ownerAuthName');
    if(!role||!name)return false;
    const displayName=String(profile.nama||'').trim()||String((sameSession?mt.user:window.OwnerAuth?.session?.user)?.email||'').trim();
    if(!displayName)return false;
    if(role.textContent!==(normalized==='owner'?'OWNER':'SPV'))role.textContent=normalized==='owner'?'OWNER':'SPV';
    if(name.textContent!==displayName)name.textContent=displayName;
    return true;
  }
  function observeAuthenticatedDisplayName(){
    const header=document.getElementById('header');
    if(!header||header.dataset.mtOwnerNameObserver==='1')return;
    header.dataset.mtOwnerNameObserver='1';
    new MutationObserver(showAuthenticatedDisplayName).observe(header,{childList:true,subtree:true,characterData:true});
    showAuthenticatedDisplayName();
  }
  async function syncGlobalHeaderRole(){
    if(headerSyncDone||headerSyncRunning)return headerSyncDone;
    if(!window.OwnerAuth||typeof window.OwnerAuth.requireFinance!=="function")return false;
    const header=document.getElementById("header");
    if(!header||!document.getElementById("ownerAuthName")||!document.getElementById("ownerAuthRole"))return false;
    headerSyncRunning=true;
    try{
      const ok=await window.OwnerAuth.requireFinance();if(!ok)return false;
      window.OwnerAuth.syncHeader?.();window.OwnerAuth.applyAccessControl?.();window.syncSidebarRoleMeta?.();
      const cabang=document.getElementById("erpHeaderCabang");const periode=document.getElementById("erpHeaderPeriode");
      if(cabang)cabang.textContent="Semua Cabang";if(periode)periode.textContent="Master Data";
      showAuthenticatedDisplayName();observeAuthenticatedDisplayName();headerSyncDone=true;return true;
    }catch(err){console.warn("[Master Tagihan Header UI]",err?.message||err);return false}
    finally{headerSyncRunning=false}
  }
  function ensureInvoiceHistoryUi(){
    if(!document.querySelector('script[data-invoice-history-search-ui]')){
      const s=document.createElement('script');s.src='../js/modules/master-tagihan-invoice-history-search-ui.js?v=20260911-1';s.async=false;s.dataset.invoiceHistorySearchUi='1';document.head.appendChild(s);
    }
    if(!document.querySelector('script[data-invoice-inbox-ui]')){
      const inbox=document.createElement('script');inbox.src='../js/modules/master-tagihan-invoice-inbox-ui.js?v=20260916-1';inbox.async=false;inbox.dataset.invoiceInboxUi='1';document.head.appendChild(inbox);
    }
    if(!document.querySelector('script[data-invoice-read-complete-ui]')){
      const lifecycle=document.createElement('script');lifecycle.src='../js/modules/master-tagihan-invoice-read-complete-ui.js?v=20260916-1';lifecycle.async=false;lifecycle.dataset.invoiceReadCompleteUi='1';document.head.appendChild(lifecycle);
    }
  }
  let tries=0;
  const timer=setInterval(()=>{
    const collapseReady=install();
    syncGlobalHeaderRole();observeAuthenticatedDisplayName();
    const identityReady=showAuthenticatedDisplayName();
    ensureInvoiceHistoryUi();
    if((collapseReady&&headerSyncDone&&identityReady)||++tries>180)clearInterval(timer);
  },100);
  window.addEventListener("load",()=>{
    setTimeout(install,500);setTimeout(syncGlobalHeaderRole,550);setTimeout(syncGlobalHeaderRole,1400);
    setTimeout(observeAuthenticatedDisplayName,650);setTimeout(showAuthenticatedDisplayName,1700);setTimeout(ensureInvoiceHistoryUi,650);
  });
})();
