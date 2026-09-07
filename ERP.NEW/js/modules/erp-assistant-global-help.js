/* ERP VAX — Global Help Desk UI
   UI/helper only. Does not change locked engines, formulas, queries, or workflows.
*/
"use strict";

(function(){
  if(window.__ERP_GLOBAL_HELP_DESK_LOADED__)return;
  window.__ERP_GLOBAL_HELP_DESK_LOADED__=true;

  const KEY="erpAssistantGlobalHelpContextV1";
  const RETURN_KEY="erpAssistantGlobalHelpReturnV1";
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
      source_url:location.href,
      scroll_x:Math.max(0,window.scrollX||document.documentElement.scrollLeft||0),
      scroll_y:Math.max(0,window.scrollY||document.documentElement.scrollTop||0),
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
      .vax-help-desk{
        width:40px!important;height:40px!important;min-width:40px!important;
        margin-left:10px!important;padding:0!important;
        display:inline-flex!important;align-items:center!important;justify-content:center!important;
        border:1px solid rgba(242,201,99,.55)!important;border-radius:10px!important;
        background:linear-gradient(180deg,rgba(242,201,99,.14),rgba(242,201,99,.055))!important;
        color:#f5cf67!important;cursor:pointer!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 12px rgba(242,201,99,.08)!important;
        transition:transform .16s ease,border-color .16s ease,background .16s ease,box-shadow .16s ease!important;
        flex:0 0 auto!important;position:relative!important;z-index:8!important;
      }
      .vax-help-desk:hover{
        transform:translateY(-1px)!important;border-color:rgba(255,216,100,.9)!important;
        background:linear-gradient(180deg,rgba(242,201,99,.23),rgba(242,201,99,.08))!important;
        box-shadow:0 0 16px rgba(242,201,99,.18)!important;
      }
      .vax-help-desk:active{transform:translateY(0)!important}
      .vax-help-desk .vax-help-icon{
        width:22px!important;height:22px!important;border-radius:50%!important;
        display:inline-flex!important;align-items:center!important;justify-content:center!important;
        border:1px solid rgba(255,216,100,.72)!important;color:#ffe088!important;
        font:900 13px/1 "Source Sans 3",sans-serif!important;
        box-shadow:0 0 8px rgba(242,201,99,.18)!important;
      }
      .vax-help-desk .vax-help-text{display:none!important}
      .ea-help-return{
        margin-right:10px!important;min-height:34px!important;padding:0 12px!important;
        display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;
        border:1px solid rgba(242,201,99,.52)!important;border-radius:999px!important;
        background:rgba(242,201,99,.08)!important;color:#f5cf67!important;
        font:800 11px/1 "Source Sans 3",sans-serif!important;cursor:pointer!important;white-space:nowrap!important;
      }
      .ea-help-return:hover{border-color:rgba(255,216,100,.9)!important;background:rgba(242,201,99,.15)!important}
      .ea-help-return .ea-help-return-arrow{font-size:16px!important;line-height:1!important}
      @media(max-width:760px){
        .vax-help-desk{margin-left:6px!important;width:36px!important;height:36px!important;min-width:36px!important}
        .ea-help-return{max-width:220px!important;overflow:hidden!important;text-overflow:ellipsis!important}
      }
    `;
    document.head.appendChild(s);
  }

  function findHeader(){
    const selectors=[
      ".erp-header-vax",
      "#header .top-header",
      "#header .erp-header",
      ".top-header",
      ".erp-header",
      ".od-command-bar",
      "header"
    ];
    for(const sel of selectors){
      const el=document.querySelector(sel);
      if(el)return el;
    }
    return null;
  }

  function findOwnerAnchor(header){
    return header.querySelector(".vax-owner, .owner-info, .user-info, [data-owner], #ownerAuthName, .header-user, .logout-btn, #logoutBtn");
  }

  function injectHeaderButton(){
    if(location.pathname.toLowerCase().includes("erp-assistant"))return true;
    const header=findHeader();
    if(!header)return false;
    if(document.getElementById("erpGlobalHelpDesk"))return true;

    ensureStyle();
    const btn=document.createElement("button");
    btn.type="button";
    btn.id="erpGlobalHelpDesk";
    btn.className="vax-help-desk";
    btn.setAttribute("aria-label","Buka Help Desk modul ini");
    btn.title=`Help Desk — ${detectModule().name}`;
    btn.innerHTML='<span class="vax-help-icon" aria-hidden="true">?</span><span class="vax-help-text">Help Desk</span>';
    btn.addEventListener("click",goAssistant);

    const anchor=findOwnerAnchor(header);
    if(anchor&&anchor.parentElement===header)header.insertBefore(btn,anchor);
    else if(anchor&&anchor.parentElement){anchor.parentElement.insertBefore(btn,anchor);}
    else header.appendChild(btn);
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

  function buildReturnUrl(ctx){
    try{
      if(ctx?.source_url)return new URL(ctx.source_url,location.href).href;
      const u=new URL(ctx?.source_path||"./",location.href);
      if(ctx?.source_search)u.search=ctx.source_search;
      if(ctx?.source_hash)u.hash=ctx.source_hash;
      return u.href;
    }catch(_e){return null}
  }

  function goBackToSource(ctx){
    const target=buildReturnUrl(ctx);
    if(!target)return;
    try{
      sessionStorage.setItem(RETURN_KEY,JSON.stringify({
        source_path:ctx.source_path,
        source_search:ctx.source_search||"",
        source_hash:ctx.source_hash||"",
        scroll_x:Number(ctx.scroll_x)||0,
        scroll_y:Number(ctx.scroll_y)||0,
        created_at:new Date().toISOString()
      }));
    }catch(_e){}
    location.href=target;
  }

  function injectAssistantReturn(ctx){
    if(!ctx)return;
    ensureStyle();
    const badge=document.getElementById("eaContext");
    if(!badge||document.getElementById("eaHelpReturn"))return;
    const btn=document.createElement("button");
    btn.type="button";
    btn.id="eaHelpReturn";
    btn.className="ea-help-return";
    btn.title=`Kembali ke ${ctx.module_name||"modul sebelumnya"}`;
    btn.innerHTML=`<span class="ea-help-return-arrow" aria-hidden="true">←</span><span>Kembali ke ${clean(ctx.module_name)||"modul sebelumnya"}</span>`;
    btn.addEventListener("click",()=>goBackToSource(ctx));
    badge.parentElement?.insertBefore(btn,badge);
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
      injectAssistantReturn(ctx);

      const extras=[ctx.cabang?`Cabang: ${ctx.cabang}`:"",ctx.periode?`Periode: ${ctx.periode}`:""].filter(Boolean).join(" • ");
      ea.addBubble?.("assistant",`<p>Bapak masuk dari <strong>${ea.escape(ctx.module_name||module?.name||"modul ERP")}</strong>. Silakan tanya bagian yang belum jelas di layar/modul ini.</p>${extras?`<p><small>${ea.escape(extras)}</small></p>`:""}<p>Contoh: <strong>angka ini dari mana?</strong>, <strong>cara pakainya bagaimana?</strong>, atau <strong>kolom ini maksudnya apa?</strong></p>`);
      ea.refs.input.placeholder=`Tanya tentang ${ctx.module_name||module?.name||"modul ini"}...`;
      ea.refs.input.focus();
    },80);
  }

  function restoreSourcePosition(){
    if(location.pathname.toLowerCase().includes("erp-assistant"))return;
    let data=null;
    try{data=JSON.parse(sessionStorage.getItem(RETURN_KEY)||"null")}catch(_e){}
    if(!data)return;
    const samePath=String(data.source_path||"")===String(location.pathname||"");
    const sameSearch=String(data.source_search||"")===String(location.search||"");
    if(!samePath||!sameSearch)return;
    try{sessionStorage.removeItem(RETURN_KEY)}catch(_e){}
    const x=Number(data.scroll_x)||0,y=Number(data.scroll_y)||0;
    const restore=()=>window.scrollTo({left:x,top:y,behavior:"auto"});
    restore();
    setTimeout(restore,120);
    setTimeout(restore,420);
    setTimeout(restore,900);
  }

  function boot(){
    bindAssistantContext();
    if(location.pathname.toLowerCase().includes("erp-assistant"))return;
    restoreSourcePosition();
    if(injectHeaderButton())return;
    const mo=new MutationObserver(()=>{if(injectHeaderButton())mo.disconnect()});
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),15000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
