/* UI ONLY: animasi ikon refresh Review Izin/Libur, tanpa menjalankan refresh tambahan. */
(function(){
  'use strict';
  const selector='#izinSpvEmbed #izinSpvRefresh, #izinSpvEmbed #ownerSpvAuditRefresh';
  function mount(){
    document.querySelectorAll(selector).forEach(function(button){
      if(button.querySelector('.vax-review-refresh-icon'))return;
      const glyph=button.textContent.trim()||'↻';
      const icon=document.createElement('span');
      icon.className='vax-review-refresh-icon';
      icon.setAttribute('aria-hidden','true');
      icon.textContent=glyph;
      button.replaceChildren(icon);
    });
  }
  document.addEventListener('click',function(event){
    const button=event.target.closest(selector);
    if(!button)return;
    mount();
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    button.querySelectorAll('.vax-review-spark').forEach(function(spark){spark.remove();});
    button.classList.remove('vax-review-refresh-burst');
    void button.offsetWidth;
    button.classList.add('vax-review-refresh-burst');
    for(let i=0;i<12;i++){
      const spark=document.createElement('span');
      spark.className='vax-review-spark';
      spark.setAttribute('aria-hidden','true');
      const angle=(i*30-90)*Math.PI/180;
      const distance=24+(i%3)*7;
      spark.style.setProperty('--spark-x',Math.round(Math.cos(angle)*distance)+'px');
      spark.style.setProperty('--spark-y',Math.round(Math.sin(angle)*distance)+'px');
      spark.style.setProperty('--spark-delay',(i%3)*30+'ms');
      button.appendChild(spark);
    }
    window.setTimeout(function(){button.classList.remove('vax-review-refresh-burst');button.querySelectorAll('.vax-review-spark').forEach(function(spark){spark.remove();});},1050);
  },true);
  function boot(){mount();const root=document.getElementById('izinSpvEmbed');if(root)new MutationObserver(mount).observe(root,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
