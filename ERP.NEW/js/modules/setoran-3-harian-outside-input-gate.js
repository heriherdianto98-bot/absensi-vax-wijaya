/* VAX ERP — Setoran 3 Harian SVP gate for Biaya di luar Cashout.
   Additive workflow/UI only. Dedicated outside-cashout note + proof are separated from
   Non Tunai/BRI note + proof. Does NOT alter DailyDataEngine, SetoranMoneyEngine,
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
  function money(v){const n=Number(v);return Number.isFinite(n)?n:0;}
  function proofByKind(saved,kind){return Boolean(saved?._proofByKind?.[String(kind||"").toUpperCase()]);}
  function outsideProofReady(saved){return proofByKind(saved,"OUTSIDE_CASHOUT");}
  function sharedNoteValue(tr){return String(tr?.querySelector('[data-field="note"]')?.value||"").trim();}
  function outsideNoteValue(tr){
    const el=tr?.querySelector('[data-s3-outside-note]');
    if(el) return String(el.value||"").trim();
    const id=Number(tr?.dataset?.cabangId||0);
    const saved=flow.savedRows.get(flow.key(id))||{};
    return String(saved.outside_cashout_note||"").trim();
  }

  function ensureStyle(){
    if(document.getElementById("s3OutsideInputGateStyle")) return;
    const style=document.createElement("style");
    style.id="s3OutsideInputGateStyle";
    style.textContent=`
      .s3-outside-box{display:grid;grid-template-columns:1fr auto;gap:5px 6px;align-items:center;min-width:150px}
      .s3-outside-box>[data-field="outside"]{grid-column:1/-1;margin:0!important}
      .s3-outside-box>[data-field="outside"]:disabled{opacity:.48!important;cursor:not-allowed!important;background:rgba(8,17,25,.72)!important}
      .s3-outside-note{min-width:0;width:100%;height:27px;box-sizing:border-box;border:1px solid rgba(216,165,59,.26);border-radius:7px;background:#0a151f;color:#e7edf3;padding:4px 7px;font:800 9px/1.1 "Source Sans 3",sans-serif;outline:none}
      .s3-outside-note::placeholder{color:#63717d}
      .s3-outside-note:focus{border-color:rgba(244,200,80,.78);box-shadow:0 0 0 2px rgba(244,200,80,.08)}
      .s3-outside-proof{height:27px;min-width:31px;padding:0 7px;border:1px solid rgba(216,165,59,.34);border-radius:7px;background:rgba(216,165,59,.07);color:#f1c855;font-size:13px;font-weight:1000;cursor:pointer}
      .s3-outside-proof:hover{background:rgba(216,165,59,.14);border-color:rgba(216,165,59,.64)}
      .s3-outside-proof.has-proof{border-color:rgba(74,222,128,.38);background:rgba(22,101,52,.14);color:#78e7aa}
      .s3-outside-proof:disabled{opacity:.36;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  /* General KETERANGAN stays dedicated to BRI/Non Tunai.
     Prevent base row renderer from falling back to outside_cashout_note. */
  const baseRowHtml=flow.rowHtml.bind(flow);
  flow.rowHtml=function(branch){
    const saved=this.savedRows.get(this.key(branch.id));
    if(!saved?.outside_cashout_note) return baseRowHtml(branch);
    const keep=saved.outside_cashout_note;
    saved.outside_cashout_note=null;
    try{return baseRowHtml(branch);}finally{saved.outside_cashout_note=keep;}
  };

  function mountRow(tr){
    if(!tr||!isSvp()) return;
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return;
    const id=Number(tr.dataset.cabangId||0);
    const saved=flow.savedRows.get(flow.key(id))||{};

    let box=outside.closest('.s3-outside-box');
    if(!box){
      box=document.createElement('div');
      box.className='s3-outside-box';
      outside.parentNode.insertBefore(box,outside);
      box.appendChild(outside);
    }

    let note=box.querySelector('[data-s3-outside-note]');
    if(!note){
      note=document.createElement('input');
      note.type='text';
      note.className='s3-outside-note';
      note.dataset.s3OutsideNote=String(id);
      note.placeholder='Ket. biaya';
      note.title='Keterangan khusus Biaya di luar Cashout';
      box.appendChild(note);
    }
    if(document.activeElement!==note) note.value=String(saved.outside_cashout_note||'');

    let proof=box.querySelector('[data-s3-outside-proof]');
    if(!proof){
      proof=document.createElement('button');
      proof.type='button';
      proof.className='s3-outside-proof';
      proof.dataset.s3OutsideProof=String(id);
      box.appendChild(proof);
    }

    const hasNote=Boolean(String(note.value||'').trim());
    const hasProof=outsideProofReady(saved);
    proof.textContent=hasProof?'✓':'📷';
    proof.classList.toggle('has-proof',hasProof);
    proof.disabled=!hasNote;
    proof.title=hasProof?'Bukti biaya sudah tersimpan. Klik untuk ganti foto biaya.':'Upload foto khusus Biaya di luar Cashout';

    const ready=hasNote&&hasProof;
    outside.disabled=!ready;
    outside.title=ready
      ? 'Keterangan biaya dan foto bukti biaya sudah lengkap. Nominal dapat diisi.'
      : 'Isi Ket. biaya dan upload foto khusus biaya terlebih dahulu.';
  }

  function decorate(){
    ensureStyle();
    if(!isSvp()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(mountRow);
  }

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const result=baseRender(...arguments);
    decorate();
    return result;
  };

  async function ensureSavedRow(tr){
    const key=flow.key(tr.dataset.cabangId);
    let saved=flow.savedRows.get(key);
    if(saved?.id) return saved;
    await flow.saveRow(tr,{taken:null,quiet:true});
    saved=flow.savedRows.get(key);
    if(!saved?.id) throw new Error('Data setoran belum tersimpan.');
    return saved;
  }

  async function persistOutsideNote(tr,{quiet=false}={}){
    if(!tr||!isSvp()) return null;
    const note=outsideNoteValue(tr);
    const saved=await ensureSavedRow(tr);
    const now=new Date().toISOString();
    const {data,error}=await db.from(flow.TABLE)
      .update({outside_cashout_note:note||null,updated_by:flow.user.id,updated_at:now})
      .eq('id',saved.id).select('*').single();
    if(error) throw error;
    data._proofLatest=saved._proofLatest||null;
    data._proofByKind=saved._proofByKind||{};
    flow.savedRows.set(flow.key(data.cabang_id),data);
    if(!quiet) flow.ok?.('Keterangan biaya tersimpan.');
    return data;
  }

  /* Keep the base saver intact, but preserve the dedicated outside note separately.
     The base workflow historically validates outside cost through the shared note field,
     so we temporarily satisfy that guard and immediately restore/persist the two notes separately. */
  const baseSave=flow.saveRow.bind(flow);
  flow.saveRow=async function(tr,options={}){
    if(!tr||!this.isSvp?.()) return baseSave(tr,options);
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return baseSave(tr,options);

    const outsideAmount=money(outside.value);
    const dedicated=outsideNoteValue(tr);
    if(outsideAmount>0 && (!dedicated || !outsideProofReady(this.savedRows.get(this.key(tr.dataset.cabangId))||{}))){
      throw new Error('Biaya di luar Cashout hanya dapat disimpan setelah Ket. biaya dan foto bukti biaya lengkap.');
    }

    const shared=tr.querySelector('[data-field="note"]');
    const originalShared=String(shared?.value||'');
    let borrowed=false;
    if(outsideAmount>0 && dedicated && shared && !originalShared.trim()){
      shared.value=dedicated;
      borrowed=true;
    }

    let result;
    try{
      result=await baseSave(tr,options);
    }finally{
      if(borrowed && shared?.isConnected) shared.value=originalShared;
    }

    if(outsideAmount>0 && dedicated){
      const saved=this.savedRows.get(this.key(tr.dataset.cabangId));
      if(saved?.id){
        const now=new Date().toISOString();
        const patch={outside_cashout_note:dedicated,non_cash_note:originalShared.trim()||null,updated_by:this.user.id,updated_at:now};
        const {data,error}=await db.from(this.TABLE).update(patch).eq('id',saved.id).select('*').single();
        if(error) throw error;
        data._proofLatest=saved._proofLatest||null;
        data._proofByKind=saved._proofByKind||{};
        this.savedRows.set(this.key(data.cabang_id),data);
        this.renderTable();
        this.renderTotals?.();
      }
    }
    return result;
  };

  document.addEventListener('input',e=>{
    const note=e.target.closest?.('[data-s3-outside-note]');
    if(!note) return;
    mountRow(note.closest('tr[data-cabang-id]'));
  });

  document.addEventListener('change',async e=>{
    const note=e.target.closest?.('[data-s3-outside-note]');
    if(!note||!isSvp()) return;
    const tr=note.closest('tr[data-cabang-id]');
    try{
      await persistOutsideNote(tr,{quiet:true});
      mountRow(tr);
    }catch(err){flow.fail?.(err?.message||String(err));}
  });

  document.addEventListener('click',async e=>{
    const btn=e.target.closest?.('[data-s3-outside-proof]');
    if(!btn||!isSvp()) return;
    const tr=btn.closest('tr[data-cabang-id]');
    if(!tr) return;
    if(!outsideNoteValue(tr)) return flow.fail?.('Isi Ket. biaya terlebih dahulu.');
    try{await persistOutsideNote(tr,{quiet:true});}catch(err){return flow.fail?.(err?.message||String(err));}
    const input=tr.querySelector('[data-file-input]');
    if(!input) return flow.fail?.('Input foto bukti tidak ditemukan.');
    input.dataset.s3OutsideProofIntent='1';
    input.click();
  });

  const baseChange=flow.onTableChange.bind(flow);
  flow.onTableChange=async function(e){
    const input=e.target?.closest?.('[data-file-input]');
    if(input?.dataset?.s3OutsideProofIntent==="1"){
      const tr=input.closest('tr[data-cabang-id]');
      delete input.dataset.s3OutsideProofIntent;
      if(!tr||!this.isSvp()) return;
      const file=input.files?.[0];
      if(!file){input.value='';return;}
      if(!outsideNoteValue(tr)){
        input.value='';
        this.fail?.('Isi Ket. biaya terlebih dahulu.');
        return;
      }

      this.busy?.(true);
      try{
        let saved=await ensureSavedRow(tr);
        saved=await persistOutsideNote(tr,{quiet:true})||saved;
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

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',decorate,{once:true});
  else decorate();
})();
