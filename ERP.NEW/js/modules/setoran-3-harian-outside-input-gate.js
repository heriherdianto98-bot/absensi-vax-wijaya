/* VAX ERP — Setoran 3 Harian SVP gate for Biaya di luar Cashout.
   UI-preserving additive guard only. Does NOT alter DailyDataEngine, SetoranMoneyEngine,
   canonical money formulas, Cash Aktual formula, or locked finance engines. */
"use strict";
(function bootOutsideInputGate(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsideInputGate,60);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__outsideInputGateInstalled) return;
  flow.__outsideInputGateInstalled=true;

  function isSvp(){return typeof flow.isSvp==="function" && flow.isSvp();}
  function noteValue(tr){return String(tr?.querySelector('[data-field="note"]')?.value||"").trim();}
  function proofReady(saved){return Boolean(saved?._proofLatest || saved?.proof_path);}

  function updateRow(tr){
    if(!tr||!isSvp()) return;
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return;
    const id=Number(tr.dataset.cabangId||0);
    const saved=flow.savedRows.get(flow.key(id))||{};
    const ready=Boolean(noteValue(tr)) && proofReady(saved);

    outside.disabled=!ready;
    outside.title=ready
      ? "Keterangan dan foto bukti sudah lengkap. Nominal Biaya di luar Cashout dapat diisi."
      : "Isi Keterangan dan upload foto pada kolom BUKTI terlebih dahulu.";
  }

  function decorate(){
    if(!isSvp()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(updateRow);
  }

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const result=baseRender(...arguments);
    decorate();
    return result;
  };

  document.addEventListener('input',e=>{
    if(!e.target.matches?.('[data-field="note"]')) return;
    updateRow(e.target.closest('tr[data-cabang-id]'));
  });

  document.addEventListener('change',e=>{
    if(!e.target.matches?.('[data-file-input]')) return;
    const tr=e.target.closest('tr[data-cabang-id]');
    setTimeout(()=>updateRow(tr),0);
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',decorate,{once:true});
  else decorate();
})();
