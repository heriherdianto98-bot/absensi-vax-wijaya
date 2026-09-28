/* VAX WIJAYA — Canonical Employee Haptic V1
   Shared interaction feedback for employee/cashier/floating portals.
   UI behavior only; no attendance, payroll, session, or finance logic. */
(()=>{
  'use strict';

  const SELECTOR=[
    'a[href]',
    'button:not([disabled])',
    '[role="button"]',
    'summary',
    'select',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="reset"]',
    'input[type="checkbox"]',
    'input[type="radio"]',
    'input[type="range"]',
    'label[for]',
    '.inbox-item'
  ].join(',');

  let lastAt=0;
  let lastTarget=null;

  function canVibrate(){
    return typeof navigator!=='undefined' && typeof navigator.vibrate==='function';
  }

  function pulse(kind='tap'){
    if(!canVibrate()) return false;
    try{
      const pattern=kind==='strong' ? [28,18,34] : kind==='success' ? [18,15,24] : 22;
      return navigator.vibrate(pattern);
    }catch(_){
      return false;
    }
  }

  function resolveTarget(node){
    if(!(node instanceof Element)) return null;
    const target=node.closest(SELECTOR);
    if(!target) return null;
    if(target.matches('[disabled],[aria-disabled="true"],[data-haptic="off"]')) return null;
    if(target.closest('[data-haptic="off"]')) return null;
    return target;
  }

  function feedback(event){
    const target=resolveTarget(event.target);
    if(!target) return;

    const now=Date.now();
    if(target===lastTarget && now-lastAt<90) return;
    lastAt=now;
    lastTarget=target;

    const kind=target.matches('[data-haptic="strong"],.danger,.delete,.logout,[aria-label*="hapus" i]') ? 'strong' : 'tap';
    pulse(kind);
  }

  document.addEventListener('pointerdown',feedback,{passive:true,capture:true});

  document.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter' && event.key!==' ') return;
    const target=resolveTarget(event.target);
    if(!target) return;
    pulse('tap');
  },true);

  window.EmployeeHaptic=Object.freeze({
    pulse,
    tap:()=>pulse('tap'),
    strong:()=>pulse('strong'),
    success:()=>pulse('success')
  });
})();
