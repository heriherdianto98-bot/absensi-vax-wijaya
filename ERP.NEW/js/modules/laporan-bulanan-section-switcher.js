"use strict";

/*
VAX ERP — Laporan Bulanan Section Switcher
UI ONLY.
Hanya mengatur card/section mana yang terlihat dan custom themed picker.
Tidak menyentuh engine, source, query, formula, atau data.
*/
(() => {
  const select=()=>document.getElementById("lbSectionView");
  const grid=()=>document.querySelector(".lb-grid");
  const mapping=()=>document.querySelector(".lb-mapping");
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let focusIndex=-1;

  function injectCompactViewportStyle(){
    if(document.getElementById("lbCompactViewportStyle")) return;
    const style=document.createElement("style");
    style.id="lbCompactViewportStyle";
    style.textContent=`
      /* Full-width monthly viewport — page UI only */
      body.laporan-bulanan-page .erp-content{
        padding-left:0!important;
        padding-right:0!important;
      }
      body.laporan-bulanan-page .lb-wrap{
        width:100%!important;
        max-width:none!important;
        padding-left:12px!important;
        padding-right:12px!important;
        box-sizing:border-box!important;
      }

      /* Frozen title + toolbar align to the viewport edges. */
      body.laporan-bulanan-page .lb-head,
      body.laporan-bulanan-page .lb-head + .lb-toolbar{
        left:calc(var(--sidebar-width,220px) + 12px)!important;
        right:12px!important;
      }
      body.sidebar-collapsed.laporan-bulanan-page .lb-head,
      body.sidebar-collapsed.laporan-bulanan-page .lb-head + .lb-toolbar,
      body.laporan-bulanan-page .sidebar.collapsed ~ .erp-wrapper .lb-head,
      body.laporan-bulanan-page .sidebar.collapsed ~ .erp-wrapper .lb-head + .lb-toolbar{
        left:calc(var(--sidebar-collapse,72px) + 12px)!important;
      }

      /* Opaque frozen toolbar: no card/text may bleed through while scrolling. */
      body.laporan-bulanan-page .lb-head + .lb-toolbar{
        isolation:isolate!important;
        overflow:visible!important;
        background:#06080b!important;
        backdrop-filter:none!important;
        -webkit-backdrop-filter:none!important;
        box-shadow:
          0 -14px 0 #06080b,
          0 12px 0 #06080b,
          0 18px 30px rgba(0,0,0,.48),
          inset 0 1px 0 rgba(255,255,255,.035)!important;
      }
      body.laporan-bulanan-page .lb-head + .lb-toolbar::before{
        content:"";
        position:absolute;
        z-index:-1;
        left:-2px;right:-2px;top:-12px;bottom:-10px;
        border-radius:16px;
        background:#06080b;
        pointer-events:none;
      }

      /* Compact single-section review: one block in view; long content scrolls inside the card. */
      body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active{
        width:100%!important;
        max-height:310px!important;
        min-height:0!important;
        overflow:hidden!important;
      }
      body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active .lb-card-head{
        padding:10px 14px!important;
        min-height:46px!important;
      }
      body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active .lb-card-body{
        padding:10px 14px!important;
        max-height:252px!important;
        overflow-y:auto!important;
        overscroll-behavior:contain;
        scrollbar-width:thin;
        scrollbar-color:rgba(167,139,250,.72) #080a0d;
      }
      body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active .lb-card-body::-webkit-scrollbar,
      body.laporan-bulanan-page .lb-mapping.is-view-active .lb-card-body::-webkit-scrollbar{
        width:8px;
      }
      body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active .lb-card-body::-webkit-scrollbar-track,
      body.laporan-bulanan-page .lb-mapping.is-view-active .lb-card-body::-webkit-scrollbar-track{
        background:#080a0d;
      }
      body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active .lb-card-body::-webkit-scrollbar-thumb,
      body.laporan-bulanan-page .lb-mapping.is-view-active .lb-card-body::-webkit-scrollbar-thumb{
        background:linear-gradient(180deg,#a78bfa,#f2c230);
        border-radius:999px;
      }

      /* Mapping follows the same compact viewport rule when selected. */
      body.laporan-bulanan-page .lb-mapping.is-view-active{
        width:100%!important;
        max-height:340px!important;
        min-height:0!important;
        overflow:hidden!important;
      }
      body.laporan-bulanan-page .lb-mapping.is-view-active .lb-card-head{
        padding:10px 14px!important;
        min-height:46px!important;
      }
      body.laporan-bulanan-page .lb-mapping.is-view-active .lb-card-body{
        padding:10px 14px!important;
        max-height:282px!important;
        overflow-y:auto!important;
        overscroll-behavior:contain;
        scrollbar-width:thin;
        scrollbar-color:rgba(96,165,250,.72) #080a0d;
      }

      @media(max-width:900px){
        body.laporan-bulanan-page .lb-head,
        body.laporan-bulanan-page .lb-head + .lb-toolbar{
          left:8px!important;
          right:8px!important;
        }
        body.laporan-bulanan-page .lb-wrap{
          padding-left:8px!important;
          padding-right:8px!important;
        }
        body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active{
          max-height:360px!important;
        }
        body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active .lb-card-body{
          max-height:302px!important;
        }
      }

      @media print{
        body.laporan-bulanan-page .erp-content{padding-left:inherit!important;padding-right:inherit!important}
        body.laporan-bulanan-page .lb-wrap{max-width:1500px!important;padding-left:26px!important;padding-right:26px!important}
        body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active,
        body.laporan-bulanan-page .lb-grid.lb-single-view > .lb-card.is-view-active .lb-card-body,
        body.laporan-bulanan-page .lb-mapping.is-view-active,
        body.laporan-bulanan-page .lb-mapping.is-view-active .lb-card-body{
          max-height:none!important;
          overflow:visible!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMappingOption(){
    const picker=select();
    if(!picker) return;
    if(!Array.from(picker.options).some(o=>o.value==="mapping")){
      const option=document.createElement("option");
      option.value="mapping";
      option.textContent="Mapping Capster Backup";
      picker.appendChild(option);
    }
  }

  function apply(value){
    const host=grid();
    if(!host) return;
    host.classList.add("lb-single-view");
    const cards=[...host.querySelectorAll(":scope > .lb-card")];
    cards.forEach(card=>card.classList.toggle("is-view-active",card.dataset.lbView===value));

    const map=mapping();
    if(map){
      map.classList.toggle("is-view-active",value==="mapping");
      map.setAttribute("aria-hidden",value==="mapping"?"false":"true");
    }
  }

  function syncTrigger(){
    const picker=select();
    const text=document.getElementById("lbSectionTriggerText");
    if(!picker||!text) return;
    text.textContent=picker.selectedOptions?.[0]?.textContent?.trim()||"Pilih Tampilan";
  }

  function optionButtons(){
    return [...document.querySelectorAll("#lbSectionOptions .lb-section-option")];
  }

  function setFocusIndex(index,{focus=true}={}){
    const buttons=optionButtons();
    if(!buttons.length) return;
    focusIndex=Math.max(0,Math.min(index,buttons.length-1));
    buttons.forEach((btn,i)=>{
      btn.tabIndex=i===focusIndex?0:-1;
      btn.classList.toggle("is-key-focus",i===focusIndex);
    });
    if(focus) buttons[focusIndex]?.focus({preventScroll:true});
  }

  function renderOptions(){
    const picker=select();
    const box=document.getElementById("lbSectionOptions");
    if(!picker||!box) return;
    const current=String(picker.value||"");
    const opts=Array.from(picker.options);
    const currentIndex=Math.max(0,opts.findIndex(o=>String(o.value)===current));
    box.innerHTML=opts.map((o,i)=>`<button type="button" role="option" aria-selected="${String(o.value)===current?"true":"false"}" tabindex="${i===currentIndex?"0":"-1"}" class="lb-section-option${String(o.value)===current?" is-selected":""}" data-value="${esc(o.value)}">${esc(o.textContent.trim())}</button>`).join("");
    focusIndex=currentIndex;
    box.querySelectorAll(".lb-section-option").forEach((btn,i)=>{
      btn.addEventListener("click",()=>choose(btn.dataset.value));
      btn.addEventListener("focus",()=>{focusIndex=i;btn.classList.add("is-key-focus");});
      btn.addEventListener("blur",()=>btn.classList.remove("is-key-focus"));
    });
  }

  function position(){
    const trigger=document.getElementById("lbSectionTrigger");
    const pop=document.getElementById("lbSectionPopover");
    if(!trigger||!pop) return;
    const r=trigger.getBoundingClientRect();
    const gap=8;
    const width=Math.min(Math.max(r.width,360),620,window.innerWidth-28);
    let left=Math.min(r.left,window.innerWidth-width-14); left=Math.max(14,left);
    let top=r.bottom+gap;
    pop.style.width=`${width}px`; pop.style.left=`${left}px`; pop.style.top=`${top}px`;
    requestAnimationFrame(()=>{
      const h=pop.getBoundingClientRect().height;
      if(top+h>window.innerHeight-12) pop.style.top=`${Math.max(12,r.top-h-gap)}px`;
    });
  }

  function open({focusOptions=false,direction=1}={}){
    const pop=document.getElementById("lbSectionPopover");
    const trigger=document.getElementById("lbSectionTrigger");
    if(!pop||!trigger) return;
    renderOptions();
    pop.hidden=false;
    trigger.setAttribute("aria-expanded","true");
    position();
    if(focusOptions){
      const buttons=optionButtons();
      if(direction<0 && focusIndex<0) focusIndex=buttons.length-1;
      requestAnimationFrame(()=>setFocusIndex(focusIndex>=0?focusIndex:(direction<0?buttons.length-1:0)));
    }
  }

  function close({returnFocus=false}={}){
    const pop=document.getElementById("lbSectionPopover");
    const trigger=document.getElementById("lbSectionTrigger");
    if(pop) pop.hidden=true;
    trigger?.setAttribute("aria-expanded","false");
    optionButtons().forEach(btn=>btn.classList.remove("is-key-focus"));
    if(returnFocus) trigger?.focus({preventScroll:true});
  }

  function choose(value){
    const picker=select(); if(!picker) return;
    picker.value=value;
    picker.dispatchEvent(new Event("change",{bubbles:true}));
    syncTrigger(); close({returnFocus:true});
  }

  function handleTriggerKey(e){
    const pop=document.getElementById("lbSectionPopover");
    if(["ArrowDown","ArrowUp"].includes(e.key)){
      e.preventDefault();
      if(pop?.hidden) open({focusOptions:true,direction:e.key==="ArrowUp"?-1:1});
      else setFocusIndex(focusIndex+(e.key==="ArrowUp"?-1:1));
      return;
    }
    if(["Enter"," "].includes(e.key)){
      e.preventDefault();
      pop?.hidden?open({focusOptions:true}):close({returnFocus:true});
      return;
    }
    if(e.key==="Escape"&&!pop?.hidden){e.preventDefault();close({returnFocus:true});}
  }

  function handlePopoverKey(e){
    const buttons=optionButtons();
    if(!buttons.length) return;
    if(e.key==="ArrowDown"){e.preventDefault();setFocusIndex((focusIndex+1)%buttons.length);return;}
    if(e.key==="ArrowUp"){e.preventDefault();setFocusIndex((focusIndex-1+buttons.length)%buttons.length);return;}
    if(e.key==="Home"){e.preventDefault();setFocusIndex(0);return;}
    if(e.key==="End"){e.preventDefault();setFocusIndex(buttons.length-1);return;}
    if(e.key==="Enter"||e.key===" "){
      e.preventDefault();
      const btn=buttons[focusIndex]||document.activeElement?.closest?.(".lb-section-option");
      if(btn?.dataset?.value) choose(btn.dataset.value);
      return;
    }
    if(e.key==="Escape"){e.preventDefault();close({returnFocus:true});}
  }

  function buildThemedPicker(){
    const picker=select();
    if(!picker||document.getElementById("lbSectionTrigger")) return;
    picker.classList.add("lb-section-native-hidden");
    const trigger=document.createElement("button");
    trigger.type="button";
    trigger.id="lbSectionTrigger";
    trigger.className="lb-section-trigger";
    trigger.setAttribute("aria-haspopup","listbox");
    trigger.setAttribute("aria-expanded","false");
    trigger.innerHTML='<span id="lbSectionTriggerText">Pilih Tampilan</span><span class="lb-section-trigger-ico" aria-hidden="true">▾</span>';
    picker.insertAdjacentElement("afterend",trigger);

    const pop=document.createElement("div");
    pop.id="lbSectionPopover";
    pop.className="lb-section-popover";
    pop.hidden=true;
    pop.setAttribute("role","listbox");
    pop.setAttribute("aria-label","Tampilan laporan bulanan");
    pop.innerHTML='<div id="lbSectionOptions"></div>';
    document.body.appendChild(pop);

    trigger.addEventListener("click",()=>pop.hidden?open():close());
    trigger.addEventListener("keydown",handleTriggerKey);
    pop.addEventListener("keydown",handlePopoverKey);
    document.addEventListener("pointerdown",e=>{if(pop.hidden) return;if(pop.contains(e.target)||trigger.contains(e.target)) return;close();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!pop.hidden) close({returnFocus:true});});
    window.addEventListener("resize",()=>{if(!pop.hidden) position();});
    window.addEventListener("scroll",()=>{if(!pop.hidden) position();},true);
    syncTrigger();
  }

  function bind(){
    const picker=select();
    const host=grid();
    if(!picker||!host) return;

    injectCompactViewportStyle();
    ensureMappingOption();
    const valid=[...host.querySelectorAll(":scope > .lb-card")].map(card=>card.dataset.lbView).filter(Boolean);
    if(mapping()) valid.push("mapping");
    const initial=valid.includes(picker.value)?picker.value:(valid[0]||"");
    if(initial) picker.value=initial;
    apply(initial);
    buildThemedPicker();

    picker.addEventListener("change",()=>{apply(picker.value);syncTrigger();renderOptions();});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();

  window.LaporanBulananSectionSwitcher={apply};
})();
