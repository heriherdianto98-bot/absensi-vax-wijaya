/* UI ONLY: animate changed Owner review KPI values; never changes their data. */
(function(){
  'use strict';
  const known=new WeakMap();
  function check(){
    const panel=document.getElementById('izinSpvEmbed');
    if(!panel)return;
    panel.querySelectorAll('.izin-spv-summary-card strong').forEach(function(value){
      const current=value.textContent.trim();
      if(!known.has(value)){known.set(value,current);return;}
      if(known.get(value)===current)return;
      known.set(value,current);
      value.classList.remove('vax-review-value-changing');
      void value.offsetWidth;
      value.classList.add('vax-review-value-changing');
    });
  }
  function boot(){
    const root=document.getElementById('absensiRoot');
    if(!root)return;
    check();
    root.addEventListener('animationend',function(event){
      if(event.animationName==='vax-kpi-value-change')event.target.classList.remove('is-counting');
      if(event.animationName==='vax-review-number-pop')event.target.classList.remove('vax-review-value-changing');
    },true);
    const observer=new MutationObserver(check);
    observer.observe(root,{subtree:true,childList:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
