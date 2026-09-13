/*
=========================================================
VAX ERP — Payroll Historical Original Bridge V1
=========================================================
Adapter only. The LOCKED PayrollUnifiedEngine source/formulas
are not changed. For periods that have an immutable LOCKED
snapshot, loadPeriod is routed to HistoricalOriginalRouter.
For periods without a locked snapshot, the original LIVE
loadPeriod runs unchanged.
=========================================================
*/
(() => {
  const engine = window.PayrollUnifiedEngine;
  const router = window.HistoricalOriginalRouter;
  if(!engine || !router || engine.__historicalOriginalBridgeV1) return;

  const liveLoadPeriod = engine.loadPeriod.bind(engine);
  let lockedState = false;
  let lockedMeta = null;

  function applyHistoricalReadonlyUi(){
    if(!lockedState) return;
    const root=document.getElementById('payrollList');
    if(root){
      root.querySelectorAll('.payroll-save,.payroll-salary-save').forEach(btn=>{
        btn.disabled=true;
        btn.title='Periode original terkunci — perubahan diblokir';
      });
      root.querySelectorAll('.payroll-manual input,.payroll-salary-form input,.payroll-salary-form select').forEach(input=>{
        input.disabled=true;
        input.title='Periode original terkunci — read only';
      });
    }
    const status=document.getElementById('payrollStatus');
    if(status && !status.dataset.historicalOriginal){
      status.dataset.historicalOriginal='1';
      const base=status.textContent||'';
      const hash=String(lockedMeta?.hash||'').slice(0,10);
      status.textContent=`DATA ORIGINAL TERKUNCI${hash?` · ${hash}`:''} · ${base}`;
    }
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(applyHistoricalReadonlyUi));
  const startObserver=()=>{
    const list=document.getElementById('payrollList');
    if(list) observer.observe(list,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startObserver,{once:true});
  else startObserver();

  engine.loadPeriod = async function historicalAwareLoadPeriod(options={}){
    const result=await router.loadPayrollPeriod(options);
    if(result){
      lockedState=true;
      lockedMeta=result.snapshot||null;
      window.__VAX_PAYROLL_HISTORICAL_LOCKED__={locked:true,snapshot:lockedMeta,source:'SNAPSHOT_ORIGINAL'};
      requestAnimationFrame(applyHistoricalReadonlyUi);
      return result;
    }

    lockedState=false;
    lockedMeta=null;
    window.__VAX_PAYROLL_HISTORICAL_LOCKED__={locked:false,source:'LIVE'};
    const status=document.getElementById('payrollStatus');
    if(status) delete status.dataset.historicalOriginal;
    return liveLoadPeriod(options);
  };

  Object.defineProperty(engine,'__historicalOriginalBridgeV1',{value:true,enumerable:false,writable:false});
})();