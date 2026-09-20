"use strict";
/* Navigasi terlihat permanen; select dan event change lama tetap menjadi sumber state. */
(() => {
  function boot(){
    const select=document.getElementById("lbSectionView");
    const host=document.querySelector(".lb-view-switcher");
    if(!select||!host||document.getElementById("lbStaticNav"))return;
    const title=document.createElement("span");
    title.className="lb-static-nav-title";
    title.textContent="Tampilan Laporan";
    const nav=document.createElement("nav");
    nav.id="lbStaticNav";
    nav.className="lb-static-nav";
    nav.setAttribute("aria-label","Bagian laporan bulanan");
    const buttons=[];
    for(const option of select.options){
      if(!option.value)continue;
      const button=document.createElement("button");
      button.type="button";
      button.textContent=option.textContent.trim();
      button.dataset.view=option.value;
      button.addEventListener("click",()=>{
        if(select.value!==button.dataset.view){
          select.value=button.dataset.view;
          select.dispatchEvent(new Event("change",{bubbles:true}));
        }
        sync();
      });
      buttons.push(button);
      nav.appendChild(button);
    }
    function sync(){
      for(const button of buttons){
        const active=button.dataset.view===select.value;
        button.classList.toggle("is-active",active);
        button.setAttribute("aria-current",active?"true":"false");
      }
    }
    host.append(title,nav);
    select.addEventListener("change",sync);
    sync();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
