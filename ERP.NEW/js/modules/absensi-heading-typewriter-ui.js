/* UI ONLY: animate visible heading text, never KPI values, records, or event handlers. */
(()=>{
  'use strict';
  if(window.__vaxAbsensiHeadingTypewriterUI)return;
  window.__vaxAbsensiHeadingTypewriterUI=true;

  const selector='#absensiDailyView .absensi-kpi-grid > .absensi-kpi > span, #absensiDailyView .absensi-kpi-grid > .absensi-kpi-link > span, #absensiDailyView #izinSpvEmbed .izin-spv-head h2';
  const targets=[];
  const known=new WeakSet();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const started=performance.now();
  const cycle=6400;
  const characterMs=95;

  function collect(){
    document.querySelectorAll(selector).forEach((node)=>{
      if(known.has(node))return;
      const original=node.textContent;
      if(!original.trim())return;
      known.add(node);
      node.setAttribute('aria-label',original);
      targets.push({node,original,letters:Array.from(original),offset:targets.length*240,last:original});
    });
  }
  function tick(){
    collect();
    const showAll=reduced.matches;
    const now=performance.now();
    for(const item of targets){
      if(!item.node.isConnected)continue;
      const elapsed=now-started-item.offset;
      let visible=item.original;
      if(!showAll && elapsed>=0){
        const phase=elapsed%cycle;
        const typingMs=item.letters.length*characterMs;
        if(phase<typingMs){
          visible=item.letters.slice(0,Math.min(item.letters.length,Math.floor(phase/characterMs)+1)).join('');
        }else if(phase>=cycle-360){
          visible='';
        }
      }
      if(visible!==item.last){
        item.node.textContent=visible;
        item.last=visible;
      }
    }
  }
  function boot(){
    collect();
    tick();
    window.setInterval(tick,95);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
