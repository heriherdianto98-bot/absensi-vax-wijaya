"use strict";

/*
VAX ERP — Laporan Bulanan Section Switcher
UI ONLY.
Hanya mengatur card mana yang terlihat. Tidak menyentuh engine, source, query, formula, atau data.
*/
(() => {
  const select=()=>document.getElementById("lbSectionView");
  const grid=()=>document.querySelector(".lb-grid");

  function apply(value){
    const host=grid();
    if(!host) return;
    host.classList.add("lb-single-view");

    const cards=[...host.querySelectorAll(":scope > .lb-card")];
    cards.forEach(card=>{
      card.classList.toggle("is-view-active",card.dataset.lbView===value);
    });
  }

  function bind(){
    const picker=select();
    const host=grid();
    if(!picker||!host) return;

    const valid=[...host.querySelectorAll(":scope > .lb-card")]
      .map(card=>card.dataset.lbView)
      .filter(Boolean);
    const initial=valid.includes(picker.value)?picker.value:(valid[0]||"");
    if(initial) picker.value=initial;
    apply(initial);

    picker.addEventListener("change",()=>apply(picker.value));
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();

  window.LaporanBulananSectionSwitcher={apply};
})();
