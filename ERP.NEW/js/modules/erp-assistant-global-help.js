/* ERP VAX — Global Help Desk UI
   UI/helper only. Does not change locked engines, formulas, queries, or workflows.
*/
"use strict";

(function(){
  if(window.__ERP_GLOBAL_HELP_DESK_LOADED__)return;
  window.__ERP_GLOBAL_HELP_DESK_LOADED__=true;

  const KEY="erpAssistantGlobalHelpContextV1";
  const ASSISTANT_PATH="erp-assistant.html";

  function clean(v){return String(v||"").trim()}

  function detectModule(){
    const path=String(location.pathname||"").toLowerCase();
    let menu="";
    try{menu=String(new URLSearchParams(location.search).get("menu")||"").toLowerCase()}catch(_e){}
    const hash=String(location.hash||"").toLowerCase();

    if(path.includes("erp-assistant"))return {id:"ERP_ASSISTANT",name:"ERP Assistant"};
    if(path.includes("tabel-harian-cabang"))return {id:"TABEL_HARIAN",name:"Tabel Harian Semua Cabang"};
    if(path.includes("setoran-3-harian"))return {id:"SETORAN_3_HARIAN",name:menu==="qris"?"QRIS Monitoring":"Setoran 3 Harian"};
    if(path.includes("arus-kas"))return {id:"ARUS_KAS_V2",name:"Arus Kas V2"};
    if(path.includes("cash-out"))return {id:"CASH_OUT",name:"Cash Out"};
    if(path.includes("payroll"))return {id:"PAYROLL",name:"Payroll / Master Gaji"};
    if(path.includes("erp-dashboard")){
      if(hash.includes("widget-section"))return {id:"AI_INSIGHT",name:"AI Insight ERP"};
      return {id:"DASHBOARD_OWNER",name:"Dashboard Owner"};
    }
    if(path.includes("finance")){
      const names={
        "cash-in":"Cash In / Kasbon",
        "reimbursement":"Reimbursement",
        "setoran-bulanan":"Setoran Rutin Bulanan",
        "qris":"QRIS Monitoring",
        "laporan":"Laporan Finance"
      };
      return {id:null,name:names[menu]||"Finance"};
    }
    if(path.includes("absensi"))return {id:null,name:"Absensi"};
    if(path.includes("pengumuman"))return {id:null,name:"Pengumuman"};
    if(path.includes("karyawan"))return {id:null,name:"Master Karyawan"};
    if(path.includes("cabang"))return {id:null,name:"Master Cabang"};
    if(path.includes("pengaturan"))return {id:null,name:"Pengaturan"};
    return {id:null,name:clean(document.title)||"Modul ERP"};
  }

  function collectContext(){
    const mod=detectModule();
    const cabang=clean(document.getElementById("erpHeaderCabang")?.textContent);
    const periode=clean(document.getElementById("erpHeaderPeriode")?.textContent);
    const pageTitle=clean(document.querySelector("h1,h2,.page-title,.section-title")?.textContent)||clean(document.title);
    return {
      module_id:mod.id,
      module_name:mod.name,
      page_title:pageTitle,
      source_path:location.pathname,
      source_search:location.search,
      source_hash:location.hash,
      cabang:cabang&&cabang!=="—"?cabang:"",
      periode:periode&&periode!=="—"?periode:"",
      captured_at:new Date().toISOString()
    };
  }

  function saveContext(){
    const ctx=collectContext();
    try{sessionStorage.setItem(KEY,JSON.stringify(ctx))}catch(_e){}
    return ctx;
  }

  function goAssistant(){
    saveContext();
    const target=new URL(ASSISTANT_PATH,location.href);
    target.searchParams.set("helpDesk","1");
    location.href=target.href;
  }

  function ensureStyle(){
    if(document.getElementById("erpGlobalHelpDeskStyle"))return;
    const s=document.createElement("style");
    s.id="erpGlobalHelpDeskStyle";
    s.textContent=`
      .erp-header-vax .vax-help-desk{
        height:40px!important;
        margin-left:14px!important;
        padding:0 13px!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:7px!important;
        border:1px solid rgba(242,201,99,.55)!important;
        border-radius:10px!important;
        background:linear-gradient(180deg,rgba(242,201,99,.14),rgba(242,201,99,.055))!important;
        color:#f5cf67!important;
        font:800 12px/1 "Source Sans 3",sans-serif!important;
        cursor:pointer!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 12px rgba(242,201,99,.08)!important;
        white-space:nowrap!important;
        transition:transform .16s ease,border-color .16s ease,background .16s ease!important;
      }
      .erp-header-vax .vax-help-desk:hover{
        transform:translateY(-1px)!important;
        border-color:rgba(255,216,100,.9)!important;
        background:linear-gradient(180deg,rgba(242,201,99,.23),rgba(242,201,99,.08))!important;
      }
      .erp-header-vax .vax-help-desk .vax-help-icon{
        width:22px!important;height:22px!important;border-radius:50%!important;
        display:inline-flex!important;align-items:center!important;justify-content:center!important;
        border:1px solid rgba(255,216,100,.7)!important;color:#ffe088!important;
        font-size:13px!important;font-weight:900!important;
        box-shadow:0 0 8px rgba(242,201,99,.18)!important;
      }
      @media(max-width:1180px){
        .erp-header-vax .vax-help-desk{width:40px!important;padding:0!important;gap:0!important}
        .erp-header-vax .vax-help-desk .vax-help-text{display:none!important}
      }
      @media(max-width:760px){
        .erp-header-vax .vax-help-desk{margin-left:6px!important;width:36px!important;height:36px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function injectHeaderButton(){
    if(location.pathname.toLowerCase().includes("erp-assistant"))return true;
    const header=document.querySelector(".erp-header-vax");
    if(!header)return false;
    if(document.getElementById("erpGlobalHelpDesk"))return true;
    ensureStyle();
    const btn=document.createElement("button");
    btn.type="button";
    btn.id="erpGlobalHelpDesk";
    btn.className="vax-help-desk";
    btn.setAttribute("aria-label","Buka Help Desk modul ini");
    btn.title="Tanya ERP Assistant tentang modul yang sedang dibuka";
    btn.innerHTML='<span class="vax-help-icon" aria-hidden="true">?</span><span class="vax-help-text">Help Desk</span>';
    btn.addEventListener("click",goAssistant);
    const owner=header.querySelector(".vax-owner");
    if(owner)header.insertBefore(btn,owner); else header.appendChild(btn);
    return true;
  }

  function readSaved(){
    try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_e){return null}
  }

  function isFresh(ctx){
    if(!ctx?.captured_at)return false;
    const t=Date.parse(ctx.captured_at);
    return Number.isFinite(t)&&(Date.now()-t)<30*60*1000;
  }

  function bindAssistantContext(){
    if(!location.pathname.toLowerCase().includes("erp-assistant"))return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const ea=window.ErpAssistant;
      if(!ea?.knowledge||!ea?.refs?.input){if(tries>80)clearInterval(timer);return}
      clearInterval(timer);
      const params=new URLSearchParams(location.search);
      const ctx=readSaved();
      if(params.get("helpDesk")!=="1"||!isFresh(ctx))return;

      const module=ctx.module_id?ea.getModule?.(ctx.module_id):null;
      if(module){
        ea.contextModule=module;
        ea.state={lastModuleId:module.id,lastFocus:"global_help_desk",lastIntent:"general"};
      }

      const badge=document.getElementById("eaContext");
      if(badge)badge.textContent=`Help Desk: ${ctx.module_name||module?.name||"Modul ERP"}`;

      const extras=[ctx.cabang?`Cabang: ${ctx.cabang}`:"",ctx.periode?`Periode: ${ctx.periode}`:""].filter(Boolean).join(" • ");
      ea.addBubble?.("assistant",`<p>Bapak masuk dari <strong>${ea.escape(ctx.module_name||module?.name||"modul ERP")}</strong>. Silakan tanya bagian yang belum jelas di layar/modul ini.</p>${extras?`<p><small>${ea.escape(extras)}</small></p>`:""}<p>Contoh: <strong>angka ini dari mana?</strong>, <strong>cara pakainya bagaimana?</strong>, atau <strong>kolom ini maksudnya apa?</strong></p>`);
      ea.refs.input.placeholder=`Tanya tentang ${ctx.module_name||module?.name||"modul ini"}...`;
      ea.refs.input.focus();
    },80);
  }

  function boot(){
    bindAssistantContext();
    if(location.pathname.toLowerCase().includes("erp-assistant"))return;
    if(injectHeaderButton())return;
    const mo=new MutationObserver(()=>{if(injectHeaderButton())mo.disconnect()});
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),10000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
