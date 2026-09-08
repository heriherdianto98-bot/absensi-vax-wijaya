/* VAX ERP — Setoran 3 Harian SVP gate for Biaya di luar Cashout.
   Additive UI/proof workflow only. Does NOT alter DailyDataEngine, SetoranMoneyEngine,
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
  function proofReady(saved){
    return Boolean(saved?._proofByKind?.OUTSIDE_CASHOUT);
  }
  function noteValue(tr){
    return String(tr?.querySelector('[data-field="note"]')?.value||"").trim();
  }

  function ensureStyle(){
    if(document.getElementById("s3OutsideInputGateStyle")) return;
    const style=document.createElement("style");
    style.id="s3OutsideInputGateStyle";
    style.textContent=`
      .s3-outside-gate-wrap{display:flex;flex-direction:column;gap:5px;align-items:stretch}
      .s3-outside-gate-wrap>[data-field="outside"]{margin:0}
      .s3-outside-gate-wrap>[data-field="outside"].s3-outside-locked{opacity:.52;cursor:not-allowed;border-color:rgba(245,197,66,.24)!important;background:rgba(9,18,27,.74)!important}
      .s3-outside-gate-hint{font-size:8px;font-weight:900;line-height:1.15;letter-spacing:.04em;text-align:center;color:#8997a5;white-space:normal}
      .s3-outside-proof-start{min-height:23px;padding:3px 6px;border:1px solid rgba(245,197,66,.48);border-radius:7px;background:rgba(245,197,66,.08);color:#f6cf62;font-size:8px;font-weight:1000;letter-spacing:.03em;cursor:pointer;line-height:1.1}
      .s3-outside-proof-start:hover{background:rgba(245,197,66,.15);border-color:rgba(245,197,66,.78)}
      .s3-outside-proof-ready{display:inline-flex;align-items:center;justify-content:center;min-height:21px;padding:2px 5px;border-radius:6px;border:1px solid rgba(74,222,128,.32);background:rgba(22,101,52,.12);color:#79e6aa;font-size:8px;font-weight:1000;line-height:1.1}
    `;
    document.head.appendChild(style);
  }

  function updateRow(tr){
    if(!tr||!isSvp()) return;
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return;
    const id=Number(tr.dataset.cabangId||0);
    const saved=flow.savedRows.get(flow.key(id))||{};
    const hasNote=Boolean(noteValue(tr));
    const hasProof=proofReady(saved);
    const ready=hasNote&&hasProof;

    let wrap=outside.closest('.s3-outside-gate-wrap');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='s3-outside-gate-wrap';
      outside.parentNode.insertBefore(wrap,outside);
      wrap.appendChild(outside);
    }
    wrap.querySelectorAll('[data-s3-outside-gate-ui]').forEach(el=>el.remove());

    outside.disabled=!ready;
    outside.classList.toggle('s3-outside-locked',!ready);
    outside.title=ready
      ? 'Keterangan dan foto bukti biaya sudah lengkap. Nominal dapat diisi.'
      : (!hasNote?'Isi keterangan terlebih dahulu, lalu upload foto bukti biaya.':'Upload foto bukti biaya terlebih dahulu agar nominal dapat diisi.');

    if(!hasNote){
      const hint=document.createElement('div');
      hint.dataset.s3OutsideGateUi='1';
      hint.className='s3-outside-gate-hint';
      hint.textContent='ISI KET + FOTO DULU';
      wrap.appendChild(hint);
    }else if(!hasProof){
      const btn=document.createElement('button');
      btn.type='button';
      btn.dataset.s3OutsideGateUi='1';
      btn.dataset.s3OutsideProofStart=String(id);
      btn.className='s3-outside-proof-start';
      btn.textContent='📷 BUKTI BIAYA';
      btn.title='Upload foto bukti Biaya di luar Cashout';
      wrap.appendChild(btn);
    }else{
      const ok=document.createElement('span');
      ok.dataset.s3OutsideGateUi='1';
      ok.className='s3-outside-proof-ready';
      ok.textContent='✓ BUKTI SIAP';
      wrap.appendChild(ok);
    }
  }

  function decorate(){
    ensureStyle();
    if(!isSvp()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(updateRow);
  }

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const result=baseRender(...arguments);
    decorate();
    return result;
  };

  const baseChange=flow.onTableChange.bind(flow);
  flow.onTableChange=async function(e){
    const input=e.target?.closest?.('[data-file-input]');
    if(input?.dataset?.s3OutsideProofIntent==="1"){
      const tr=input.closest('tr[data-cabang-id]');
      if(!tr||!this.isSvp()) return;
      const file=input.files?.[0];
      delete input.dataset.s3OutsideProofIntent;
      if(!file){input.value='';return;}
      if(!noteValue(tr)){
        input.value='';
        this.fail?.('Isi keterangan Biaya di luar Cashout terlebih dahulu.');
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

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-s3-outside-proof-start]');
    if(!btn) return;
    const tr=btn.closest('tr[data-cabang-id]');
    if(!tr||!isSvp()) return;
    if(!noteValue(tr)) return flow.fail?.('Isi keterangan terlebih dahulu.');
    const file=tr.querySelector('[data-file-input]');
    if(!file) return flow.fail?.('Input foto bukti tidak ditemukan.');
    file.dataset.s3OutsideProofIntent='1';
    file.click();
  });

  document.addEventListener('input',e=>{
    if(!e.target.matches?.('[data-field="note"]')) return;
    updateRow(e.target.closest('tr[data-cabang-id]'));
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',decorate,{once:true});
  else decorate();
})();
