"use strict";
/* Presentation only: place the existing mapping section beside the other report sections. */
(() => {
  function init(){
    const grid=document.querySelector('body.laporan-bulanan-page .lb-grid');
    const mapping=document.querySelector('body.laporan-bulanan-page .lb-mapping');
    if(!grid||!mapping||grid.contains(mapping))return;
    grid.appendChild(mapping);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();