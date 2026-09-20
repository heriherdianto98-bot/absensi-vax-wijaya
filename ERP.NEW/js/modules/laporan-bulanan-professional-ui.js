"use strict";
/* UI only: independent report columns, preserving the existing data nodes and handlers. */
(() => {
  function init(){
    const grid=document.querySelector('body.laporan-bulanan-page .lb-grid');
    const mapping=document.querySelector('body.laporan-bulanan-page .lb-mapping');
    if(!grid||!mapping||grid.querySelector('.lb-monthly-column'))return;
    const left=document.createElement('div');
    const right=document.createElement('div');
    left.className='lb-monthly-column lb-monthly-column-left';
    right.className='lb-monthly-column lb-monthly-column-right';
    const views=[['income',left],['salary',left],['expense',left],['result',left],['investor',right],['performance',right]];
    for(const [view,column] of views){
      const card=grid.querySelector(`.lb-card[data-lb-view="${view}"]`);
      if(card)column.appendChild(card);
    }
    mapping.setAttribute('aria-hidden','false');
    right.appendChild(mapping);
    grid.append(left,right);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
