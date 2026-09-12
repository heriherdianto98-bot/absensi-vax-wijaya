"use strict";

/*
VAX ERP — Laporan Bulanan Section Switcher
UI ONLY.
Hanya mengatur card mana yang terlihat dan custom themed picker.
Tidak menyentuh engine, source, query, formula, atau data.
*/
(() => {
  const select=()=>document.getElementById("lbSectionView");
  const grid=()=>document.querySelector(".lb-grid");
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function apply(value){
    const host=grid();
    if(!host) return;
    host.classList.add("lb-single-view");
    const cards=[...host.querySelectorAll(":scope > .lb-card")];
    cards.forEach(card=>card.classList.toggle("is-view-active",card.dataset.lbView===value));
  }

  function syncTrigger(){
    const picker=select();
    const text=document.getElementById("lbSectionTriggerText");
    if(!picker||!text) return;
    text.textContent=picker.selectedOptions?.[0]?.textContent?.trim()||"Pilih Tampilan";
  }

  function renderOptions(){
    const picker=select();
    const box=document.getElementById("lbSectionOptions");
    if(!picker||!box) return;
    const current=String(picker.value||"");
    box.innerHTML=Array.from(picker.options).map(o=>`<button type="button" class="lb-section-option${String(o.value)===current?" is-selected":""}" data-value="${esc(o.value)}">${esc(o.textContent.trim())}</button>`).join("");
    box.querySelectorAll(".lb-section-option").forEach(btn=>btn.addEventListener("click",()=>choose(btn.dataset.value)));
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

  function open(){
    const pop=document.getElementById("lbSectionPopover");
    const trigger=document.getElementById("lbSectionTrigger");
    if(!pop||!trigger) return;
    renderOptions(); pop.hidden=false; trigger.setAttribute("aria-expanded","true"); position();
  }
  function close(){
    const pop=document.getElementById("lbSectionPopover");
    const trigger=document.getElementById("lbSectionTrigger");
    if(pop) pop.hidden=true;
    trigger?.setAttribute("aria-expanded","false");
  }
  function choose(value){
    const picker=select(); if(!picker) return;
    picker.value=value;
    picker.dispatchEvent(new Event("change",{bubbles:true}));
    syncTrigger(); close();
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
    pop.innerHTML='<div id="lbSectionOptions"></div>';
    document.body.appendChild(pop);

    trigger.addEventListener("click",()=>pop.hidden?open():close());
    document.addEventListener("pointerdown",e=>{if(pop.hidden) return;if(pop.contains(e.target)||trigger.contains(e.target)) return;close();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape") close();});
    window.addEventListener("resize",()=>{if(!pop.hidden) position();});
    window.addEventListener("scroll",()=>{if(!pop.hidden) position();},true);
    syncTrigger();
  }

  function bind(){
    const picker=select();
    const host=grid();
    if(!picker||!host) return;

    const valid=[...host.querySelectorAll(":scope > .lb-card")].map(card=>card.dataset.lbView).filter(Boolean);
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
