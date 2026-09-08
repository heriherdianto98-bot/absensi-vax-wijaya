/* ERP VAX — additive correction cancellation for Biaya di luar Cashout.
   Allows SVP to cancel a disputed outside-Cashout request by setting nominal 0,
   while still requiring correction note + NEW OUTSIDE_CASHOUT proof.
   Does not alter DailyDataEngine / SetoranMoneyEngine / canonical formulas. */
"use strict";
(function bootOutsideCancelCorrection(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsideCancelCorrection,80);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__outsideCancelCorrectionInstalled) return;
  flow.__outsideCancelCorrectionInstalled=true;
  let busy=false;

  const statusOf=s=>String(s?.outside_correction_status||"NONE").toUpperCase();
  const role=()=>String(flow.profile?.role||flow.role||"").toLowerCase();
  const isSvp=()=>["svp","spv"].includes(role());
  const isOwner=()=>role()==="owner";
  const key=id=>flow.key(id);
  const money=v=>{
    if(typeof v==="string") v=v.replace(/[^0-9-]/g,"");
    const n=Number(v);return Number.isFinite(n)?n:0;
  };

  function correctionCellFor(tr){return tr?.querySelector?.('[data-s3-correction-cell]')||null;}

  function decorateZeroStates(){
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(tr=>{
      const id=Number(tr.dataset.cabangId||0);
      const saved=flow.savedRows.get(key(id))||{};
      if(!saved?.id || money(saved.outside_cashout_cost)!==0) return;
      const st=statusOf(saved);
      if(st!=="REQUESTED" && st!=="RESUBMITTED") return;
      const td=correctionCellFor(tr);
      if(!td) return;

      if(isOwner()){
        td.innerHTML='';
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='s3-corr-gateway '+(st==='REQUESTED'?'is-requested':'is-resubmitted');
        btn.dataset.corrRequest=String(id);
        btn.textContent=st==='REQUESTED'?'⚠':'✓';
        btn.title=st==='REQUESTED'
          ? 'Pembatalan biaya sedang dikoreksi SVP. Klik untuk lihat rincian.'
          : 'SVP membatalkan pengajuan biaya dan sudah kirim ulang. Klik untuk review.';
        td.appendChild(btn);
      }else if(isSvp()){
        td.innerHTML='';
        if(st==='REQUESTED'){
          const btn=document.createElement('button');
          btn.type='button';
          btn.className='s3-corr-state svp';
          btn.dataset.corrResubmit=String(id);
          btn.textContent='↥ KIRIM ULANG';
          btn.title=saved.outside_correction_note||'Koreksi diminta Owner';
          td.appendChild(btn);
        }else{
          const state=document.createElement('span');
          state.className='s3-corr-state sent';
          state.textContent='✓ DIKIRIM ULANG';
          td.appendChild(state);
        }
      }
    });
  }

  function closeOutsideModal(){
    const m=document.getElementById('s3OutsideCostModal');
    if(!m) return;
    m.hidden=true;
    m.dataset.branchId='';
    const f=m.querySelector('#s3OutsideFile');
    if(f) f.value='';
  }

  async function saveCancellation(m,id,tr,saved,note,file){
    busy=true;flow.busy?.(true);
    try{
      await flow.uploadProof(saved,file,'OUTSIDE_CASHOUT');
      const proofState=flow.savedRows.get(key(id))||saved;
      const now=new Date().toISOString();
      const {data,error}=await db.from(flow.TABLE).update({
        outside_cashout_cost:0,
        outside_cashout_note:note,
        updated_by:flow.user.id,
        updated_at:now
      }).eq('id',saved.id).select('*').single();
      if(error) throw error;

      data._proofLatest=proofState._proofLatest||null;
      data._proofByKind=proofState._proofByKind||{};
      data.proof_path=proofState.proof_path||data.proof_path||null;
      flow.savedRows.set(key(id),data);

      closeOutsideModal();
      flow.renderTable();
      flow.renderTotals?.();
      setTimeout(decorateZeroStates,0);
      flow.ok?.('Pengajuan Biaya di luar Cashout dibatalkan (Rp0). Klik KIRIM ULANG untuk mengirim revisi ke Owner.');
    }catch(err){
      flow.fail?.(err?.message||String(err));
    }finally{
      busy=false;flow.busy?.(false);
    }
  }

  /* Capture before the normal popup SAVE handler. Only handles REQUESTED + nominal 0. */
  document.addEventListener('click',e=>{
    const save=e.target.closest?.('#s3OutsideCostModal [data-outside-save]');
    if(!save||!isSvp()||busy) return;
    const m=document.getElementById('s3OutsideCostModal');
    const id=Number(m?.dataset?.branchId||0);
    if(!id) return;
    const saved=flow.savedRows.get(key(id))||{};
    if(statusOf(saved)!=='REQUESTED') return;

    const amount=money(m.querySelector('#s3OutsideAmount')?.value||'');
    if(amount!==0) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const note=String(m.querySelector('#s3OutsideNote')?.value||'').trim();
    const file=m.querySelector('#s3OutsideFile')?.files?.[0]||null;
    const tr=document.querySelector(`#s3sheetBody tr[data-cabang-id="${id}"]`);
    if(!tr||!saved?.id) return flow.fail?.('Data setoran belum tersimpan.');
    if(!note) return flow.fail?.('Untuk membatalkan pengajuan, keterangan koreksi wajib diisi.');
    if(!file) return flow.fail?.('Untuk membatalkan pengajuan, wajib upload foto bukti TERBARU.');

    saveCancellation(m,id,tr,saved,note,file);
  },true);

  /* Existing owner popup rejects amount 0. Intercept gateway for a cancelled correction
     and reuse the same review modal so Owner can read proof / request another correction. */
  document.addEventListener('click',e=>{
    const gateway=e.target.closest?.('[data-corr-request]');
    if(!gateway||!isOwner()) return;
    const id=Number(gateway.dataset.corrRequest||0);
    const saved=flow.savedRows.get(key(id))||{};
    if(!id||money(saved.outside_cashout_cost)!==0) return;
    const st=statusOf(saved);
    if(st!=='REQUESTED'&&st!=='RESUBMITTED') return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const m=document.getElementById('s3OutsideCorrectionModal');
    if(!m) return flow.fail?.('Popup review koreksi belum siap.');
    const branch=flow.canonicalName(flow.branches.find(b=>Number(b.id)===id)?.nama_cabang||'');
    const p=typeof flow.period==='function'?flow.period():null;
    m.dataset.branchId=String(id);
    const set=(sel,val)=>{const el=document.querySelector(sel);if(el)el.textContent=val;};
    set('#s3CorrMeta',`${branch} · REVIEW OWNER`);
    set('#s3CorrBranch',branch||'—');
    set('#s3CorrPeriod',p?`${p.start} — ${p.end}`:'—');
    set('#s3CorrAmount',flow.rupiah?.(0)||'Rp0');
    set('#s3CorrSvpNote',saved.outside_cashout_note||'Pengajuan biaya dibatalkan oleh SVP.');
    const statusEl=document.getElementById('s3CorrStatus');
    if(statusEl){
      statusEl.className='s3-corr-status '+(st==='REQUESTED'?'requested':'resubmitted');
      statusEl.textContent=st==='REQUESTED'?'MENUNGGU KOREKSI SVP':'SVP MEMBATALKAN PENGAJUAN';
    }
    const noteEl=document.getElementById('s3CorrNote');
    if(noteEl){
      noteEl.value=st==='REQUESTED'?(saved.outside_correction_note||''):'';
      noteEl.disabled=st==='REQUESTED';
    }
    const send=m.querySelector('[data-corr-send]');
    if(send) send.disabled=st==='REQUESTED'||saved.owner_verified===true||saved.taken_status!=='SUDAH DIAMBIL';
    const hint=document.getElementById('s3CorrHint');
    if(hint) hint.textContent=st==='REQUESTED'
      ? 'Menunggu SVP menyelesaikan pembatalan pengajuan dan mengirim ulang.'
      : 'SVP membatalkan pengajuan menjadi Rp0. Review alasan + foto terbaru. Jika belum sesuai, Owner dapat minta koreksi lagi.';
    m.hidden=false;
  },true);

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const r=baseRender(...arguments);
    setTimeout(decorateZeroStates,0);
    setTimeout(decorateZeroStates,80);
    return r;
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(decorateZeroStates,200),{once:true});
  else setTimeout(decorateZeroStates,200);
})();
