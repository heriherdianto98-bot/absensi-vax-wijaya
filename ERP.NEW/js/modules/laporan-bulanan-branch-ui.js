/* VAX ERP — Laporan Bulanan themed branch picker / UI only */
"use strict";

(() => {
  const $=id=>document.getElementById(id);
  let activeIndex=-1;
  let scrollLockY=0;

  function injectStyle(){
    if(document.getElementById("lbBranchPickerStyle")) return;
    const style=document.createElement("style");
    style.id="lbBranchPickerStyle";
    style.textContent=`
      body.laporan-bulanan-page #lbBranch{
        position:absolute!important;
        width:1px!important;
        height:1px!important;
        opacity:0!important;
        pointer-events:none!important;
        overflow:hidden!important;
      }
      body.laporan-bulanan-page .lb-branch-trigger{
        width:100%;height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px;
        padding:0 12px 0 14px;border:1px solid rgba(45,212,191,.35);border-radius:11px;
        background:linear-gradient(180deg,rgba(45,212,191,.12),rgba(18,25,32,.96));
        color:#f8fafc;font:inherit;font-size:11px;font-weight:800;line-height:1.1;cursor:pointer;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 12px rgba(45,212,191,.05);
      }
      body.laporan-bulanan-page .lb-branch-trigger:hover,
      body.laporan-bulanan-page .lb-branch-trigger[aria-expanded="true"]{
        border-color:rgba(45,212,191,.62);box-shadow:0 0 0 2px rgba(45,212,191,.08),0 0 16px rgba(45,212,191,.12);
      }
      .lb-branch-trigger-ico{color:#5eead4;font-size:14px;filter:drop-shadow(0 0 5px rgba(45,212,191,.35));transition:transform .15s ease}
      .lb-branch-trigger[aria-expanded="true"] .lb-branch-trigger-ico{transform:rotate(180deg)}
      .lb-branch-popover{
        position:fixed;z-index:1810;width:min(520px,calc(100vw - 28px));max-height:min(430px,70vh);overflow:auto;
        padding:8px;border:1px solid rgba(45,212,191,.42);border-radius:14px;
        background:radial-gradient(ellipse at 50% -15%,rgba(45,212,191,.12),transparent 46%),linear-gradient(165deg,#182128 0%,#10171d 68%,#0b1016 100%);
        box-shadow:0 22px 54px rgba(0,0,0,.62),0 0 26px rgba(45,212,191,.10),inset 0 1px 0 rgba(255,255,255,.05);
        color:#f8fafc;animation:lbBranchIn .14s ease-out;scrollbar-width:thin;scrollbar-color:#2dd4bf #0f151b;
      }
      .lb-branch-popover[hidden]{display:none!important}
      @keyframes lbBranchIn{from{opacity:0;transform:translateY(-5px) scale(.988)}to{opacity:1;transform:none}}
      .lb-branch-option{
        width:100%;min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px;
        padding:0 12px;margin:2px 0;border:1px solid transparent;border-radius:10px;background:transparent;
        color:#d8e1e9;font:inherit;font-size:13.5px;font-weight:750;text-align:left;cursor:pointer;
      }
      .lb-branch-option:hover,.lb-branch-option.is-keyboard-active{background:rgba(45,212,191,.08);border-color:rgba(45,212,191,.20);color:#fff}
      .lb-branch-option.is-keyboard-active{box-shadow:inset 3px 0 0 rgba(45,212,191,.78),0 0 14px rgba(45,212,191,.07)}
      .lb-branch-option.is-selected{
        color:#ffffff;border-color:rgba(45,212,191,.52);
        background:linear-gradient(90deg,rgba(45,212,191,.20),rgba(45,212,191,.07));
        box-shadow:inset 3px 0 0 #2dd4bf,0 0 14px rgba(45,212,191,.08);
      }
      .lb-branch-option.is-selected::after{content:"✓";color:#5eead4;font-size:13px;font-weight:900}

      /* Investor Revised — trigger + dropdown hitam, nama cabang gold, UI ONLY */
      body.laporan-bulanan-investor-page .lb-branch-trigger{
        background:#050708!important;
        color:#e8bd3f!important;
        border-color:rgba(214,173,47,.55)!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 0 12px rgba(214,173,47,.08)!important;
        font-size:14px!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-trigger:hover,
      body.laporan-bulanan-investor-page .lb-branch-trigger[aria-expanded="true"]{
        background:#07090b!important;
        color:#ffd75a!important;
        border-color:#d6ad2f!important;
        box-shadow:0 0 0 2px rgba(214,173,47,.08),0 0 16px rgba(214,173,47,.12)!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-trigger-ico{
        color:#ffd75a!important;
        filter:drop-shadow(0 0 5px rgba(214,173,47,.35))!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-popover{
        border-color:rgba(214,173,47,.55)!important;
        background:linear-gradient(165deg,#111315 0%,#080a0c 68%,#050607 100%)!important;
        color:#e8bd3f!important;
        box-shadow:0 22px 54px rgba(0,0,0,.68),0 0 20px rgba(214,173,47,.10),inset 0 1px 0 rgba(255,255,255,.04)!important;
        scrollbar-color:#c89d25 #090b0d!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-option{
        color:#e8bd3f!important;
        background:transparent!important;
        font-weight:800!important;
        font-size:15px!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-option:hover,
      body.laporan-bulanan-investor-page .lb-branch-option.is-keyboard-active{
        background:rgba(214,173,47,.10)!important;
        border-color:rgba(214,173,47,.32)!important;
        color:#ffd75a!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-option.is-keyboard-active{
        box-shadow:inset 3px 0 0 #d6ad2f,0 0 12px rgba(214,173,47,.08)!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-option.is-selected{
        color:#ffd75a!important;
        border-color:rgba(214,173,47,.52)!important;
        background:rgba(214,173,47,.13)!important;
        box-shadow:inset 3px 0 0 #d6ad2f!important;
      }
      body.laporan-bulanan-investor-page .lb-branch-option.is-selected::after{
        color:#ffd75a!important;
      }

      body.lb-branch-menu-open{overflow:hidden!important}
      @media(prefers-reduced-motion:reduce){.lb-branch-popover{animation:none}}
    `;
    document.head.appendChild(style);
  }

  function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;","</":"&lt;/",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

  function options(){return Array.from(document.querySelectorAll(".lb-branch-option"));}

  function syncTrigger(){
    const select=$("lbBranch"),text=$("lbBranchTriggerText");
    if(!select||!text) return;
    text.textContent=select.selectedOptions?.[0]?.textContent?.trim()||"Pilih Cabang";
  }

  function setActive(index,{scroll=true}={}){
    const items=options();
    if(!items.length){activeIndex=-1;return;}
    activeIndex=Math.max(0,Math.min(index,items.length-1));
    items.forEach((btn,i)=>btn.classList.toggle("is-keyboard-active",i===activeIndex));
    if(scroll) items[activeIndex]?.scrollIntoView({block:"nearest",behavior:"smooth"});
  }

  function renderOptions(){
    const select=$("lbBranch"),box=$("lbBranchOptions");
    if(!select||!box) return;
    const current=String(select.value||"");
    box.innerHTML=Array.from(select.options).map(o=>`<button type="button" class="lb-branch-option${String(o.value)===current?" is-selected":""}" data-value="${esc(o.value)}">${esc(o.textContent.trim())}</button>`).join("");
    box.querySelectorAll(".lb-branch-option").forEach((btn,i)=>{
      btn.addEventListener("click",()=>choose(btn.dataset.value));
      btn.addEventListener("mouseenter",()=>setActive(i,{scroll:false}));
    });
    const selectedIndex=options().findIndex(btn=>btn.classList.contains("is-selected"));
    setActive(selectedIndex>=0?selectedIndex:0,{scroll:false});
  }

  function position(){
    const trigger=$("lbBranchTrigger"),pop=$("lbBranchPopover");
    if(!trigger||!pop) return;
    const r=trigger.getBoundingClientRect(),gap=8,width=Math.min(Math.max(r.width,360),520,window.innerWidth-28);
    let left=Math.min(r.left,window.innerWidth-width-14);left=Math.max(14,left);
    let top=r.bottom+gap;
    pop.style.width=`${width}px`;
    pop.style.left=`${left}px`;
    pop.style.top=`${top}px`;
    requestAnimationFrame(()=>{
      const h=pop.getBoundingClientRect().height;
      if(top+h>window.innerHeight-12) pop.style.top=`${Math.max(12,r.top-h-gap)}px`;
    });
  }

  function lockPageScroll(){
    scrollLockY=window.scrollY||document.documentElement.scrollTop||0;
    document.body.classList.add("lb-branch-menu-open");
  }
  function unlockPageScroll(){
    document.body.classList.remove("lb-branch-menu-open");
    window.scrollTo(0,scrollLockY);
  }

  function open(){
    const pop=$("lbBranchPopover"),trigger=$("lbBranchTrigger");
    if(!pop||!trigger) return;
    renderOptions();
    pop.hidden=false;trigger.setAttribute("aria-expanded","true");position();lockPageScroll();
    requestAnimationFrame(()=>options()[activeIndex]?.scrollIntoView({block:"nearest"}));
  }
  function close(){
    const pop=$("lbBranchPopover"),trigger=$("lbBranchTrigger");
    if(pop) pop.hidden=true;
    trigger?.setAttribute("aria-expanded","false");
    unlockPageScroll();
  }
  function choose(value){
    const select=$("lbBranch");if(!select) return;
    if(String(select.value)!==String(value)){
      select.value=value;
      select.dispatchEvent(new Event("change",{bubbles:true}));
    }
    syncTrigger();close();
  }

  function handleKeydown(e){
    const pop=$("lbBranchPopover");
    const trigger=$("lbBranchTrigger");
    const isOpen=pop && !pop.hidden;
    const key=e.key;

    if(!isOpen){
      if((key==="ArrowDown"||key==="ArrowUp"||key==="Enter"||key===" ") && document.activeElement===trigger){
        e.preventDefault();
        open();
      }
      return;
    }

    if(["ArrowDown","ArrowUp","Home","End","PageDown","PageUp"," "].includes(key)) e.preventDefault();
    if(key==="ArrowDown") setActive(activeIndex+1);
    else if(key==="ArrowUp") setActive(activeIndex-1);
    else if(key==="Home") setActive(0);
    else if(key==="End") setActive(options().length-1);
    else if(key==="PageDown") setActive(Math.min(activeIndex+5,options().length-1));
    else if(key==="PageUp") setActive(Math.max(activeIndex-5,0));
    else if(key==="Enter"||key===" "){
      e.preventDefault();
      const btn=options()[activeIndex];
      if(btn) choose(btn.dataset.value);
    }else if(key==="Escape"){
      e.preventDefault();close();trigger?.focus();
    }
  }

  function blockBackgroundWheel(e){
    const pop=$("lbBranchPopover");
    if(!pop||pop.hidden) return;
    if(pop.contains(e.target)) return;
    e.preventDefault();
  }

  function build(){
    injectStyle();
    const select=$("lbBranch");
    if(!select||$("lbBranchTrigger")) return;
    const field=select.closest(".lb-field");if(!field) return;
    const trigger=document.createElement("button");
    trigger.type="button";trigger.id="lbBranchTrigger";trigger.className="lb-branch-trigger";trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");
    trigger.innerHTML='<span id="lbBranchTriggerText">Pilih Cabang</span><span class="lb-branch-trigger-ico" aria-hidden="true">▾</span>';
    select.insertAdjacentElement("afterend",trigger);
    const pop=document.createElement("div");pop.id="lbBranchPopover";pop.className="lb-branch-popover";pop.hidden=true;pop.setAttribute("role","listbox");pop.innerHTML='<div id="lbBranchOptions"></div>';document.body.appendChild(pop);
    trigger.addEventListener("click",()=>pop.hidden?open():close());
    select.addEventListener("change",()=>{syncTrigger();renderOptions();});
    const mo=new MutationObserver(()=>{syncTrigger();if(!pop.hidden) renderOptions();});mo.observe(select,{childList:true,subtree:true});
    document.addEventListener("pointerdown",e=>{if(pop.hidden) return;if(pop.contains(e.target)||trigger.contains(e.target)) return;close();});
    document.addEventListener("keydown",handleKeydown,true);
    document.addEventListener("wheel",blockBackgroundWheel,{passive:false,capture:true});
    window.addEventListener("resize",()=>{if(!pop.hidden) position();});
    syncTrigger();
  }

  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",build):build();
})();
