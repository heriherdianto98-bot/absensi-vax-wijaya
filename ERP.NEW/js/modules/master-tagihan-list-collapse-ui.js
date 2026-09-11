/* ERP VAX — UI ONLY: collapsible Daftar Master Tagihan card. */
"use strict";
(() => {
  const STYLE_ID = "masterTagihanListCollapseUiStyle";
  const STORAGE_KEY = "erp-vax-master-tagihan-list-collapsed";

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

  let tries=0;
  const timer=setInterval(()=>{if(install()||++tries>180)clearInterval(timer)},100);
  window.addEventListener("load",()=>setTimeout(install,500));
})();
