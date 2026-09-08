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
  function money(v){const n=Number(v);return Number.isFinite(n)?n:0;}
  function proofByKind(saved,kind){return Boolean(saved?._proofByKind?.[String(kind||"").toUpperCase()]);}
  function outsideProofReady(saved){return proofByKind(saved,"OUTSIDE_CASHOUT");}
  function diffProofReady(saved){return proofByKind(saved,"NON_CASH_DIFF");}

  function updateRow(tr){
    if(!tr||!isSvp()) return;
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return;
    const id=Number(tr.dataset.cabangId||0);
    const saved=flow.savedRows.get(flow.key(id))||{};
    const ready=Boolean(noteValue(tr)) && outsideProofReady(saved);

    outside.disabled=!ready;
    outside.title=ready
      ? "Keterangan dan foto bukti biaya di luar Cashout sudah lengkap. Nominal dapat diisi."
      : "Isi Keterangan dan upload foto bukti biaya lewat kolom BUKTI terlebih dahulu.";
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

  /* Pakai tombol BUKTI yang SUDAH ADA. Tidak menambah tombol/kolom baru.
     Jika keterangan sudah diisi dan bukti selisih (bila perlu) sudah ada,
     upload berikutnya lewat BUKTI dianggap khusus OUTSIDE_CASHOUT. */
  document.addEventListener('click',e=>{
    if(!isSvp()) return;
    const btn=e.target.closest?.('[data-action="proof"]');
    if(!btn) return;
    const tr=btn.closest('tr[data-cabang-id]');
    if(!tr||!noteValue(tr)) return;

    const id=Number(tr.dataset.cabangId||0);
    const saved=flow.savedRows.get(flow.key(id))||{};
    if(outsideProofReady(saved)) return;

    const draft=flow.draftFromRow?.(tr);
    const needsDiff=draft?.diff!=null && Math.abs(money(draft.diff))>.5;
    if(needsDiff && !diffProofReady(saved)) return; // foto pertama tetap untuk bukti selisih BRI

    const input=tr.querySelector('[data-file-input]');
    if(input) input.dataset.s3OutsideProofIntent='1';
  },true);

  const baseChange=flow.onTableChange.bind(flow);
  flow.onTableChange=async function(e){
    const input=e.target?.closest?.('[data-file-input]');
    if(input?.dataset?.s3OutsideProofIntent==="1"){
      const tr=input.closest('tr[data-cabang-id]');
      delete input.dataset.s3OutsideProofIntent;
      if(!tr||!this.isSvp()) return;
      const file=input.files?.[0];
      if(!file){input.value='';return;}
      if(!noteValue(tr)){
        input.value='';
        this.fail?.('Isi keterangan terlebih dahulu.');
        updateRow(tr);
        return;
      }

      const key=this.key(tr.dataset.cabangId);
      this.busy?.(true);
      try{
        let saved=this.savedRows.get(key);
        if(!saved?.id){
          await this.saveRow(tr,{taken:null,quiet:true});
          saved=this.savedRows.get(key);
        }
        if(!saved?.id) throw new Error('Data setoran belum tersimpan.');
        await this.uploadProof(saved,file,'OUTSIDE_CASHOUT');
        input.value='';
        this.renderTable();
        this.renderTotals?.();
        this.ok?.('Foto bukti Biaya di luar Cashout tersimpan. Nominal biaya sekarang dapat diisi.');
      }catch(err){
        input.value='';
        this.fail?.(err?.message||String(err));
      }finally{
        this.busy?.(false);
      }
      return;
    }
    return baseChange(e);
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
