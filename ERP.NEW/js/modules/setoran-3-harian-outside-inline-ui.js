/* ERP VAX — Setoran 3 Harian: inline Biaya di luar Cashout UI.
   UI/workflow additive only. No modal, no backdrop, no canonical money-engine changes. */
"use strict";
(function bootOutsideInlineUi(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsideInlineUi,60);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__outsideInlineUiInstalled) return;
  flow.__outsideInlineUiInstalled=true;

  const draftNote=new Map();
  const busyUpload=new Set();
  const role=()=>String(flow.profile?.role||flow.role||window.OwnerAuth?.profile?.role||"").toLowerCase();
  const isSvp=()=>["svp","spv"].includes(role());
  const key=id=>flow.key(id);
  const money=v=>{const n=Number(String(v??"").replace(/[^0-9-]/g,""));return Number.isFinite(n)?n:0;};

  function style(){
    if(document.getElementById("s3OutsideInlineStyle")) return;
    const s=document.createElement("style");
    s.id="s3OutsideInlineStyle";
    s.textContent=`
      .s3-outside-inline-cell{overflow:visible!important;white-space:normal!important;text-overflow:clip!important;height:auto!important;padding-top:4px!important;padding-bottom:4px!important}
      .s3-outside-inline-wrap{display:grid;gap:3px;min-width:0;width:100%}
      .s3-outside-inline-sub{display:grid;grid-template-columns:minmax(72px,1fr) auto;gap:3px;align-items:center;min-width:0}
      .s3-outside-inline-note{width:100%;min-width:0;height:20px;border:1px solid rgba(216,165,59,.22);border-radius:5px;background:#0a141e;color:#dce5ee;padding:0 5px;font-size:8px;outline:none}
      .s3-outside-inline-note:focus{border-color:rgba(216,165,59,.68);box-shadow:0 0 0 1px rgba(216,165,59,.10)}
      .s3-outside-inline-proof,.s3-outside-inline-view{height:20px;padding:0 5px;border-radius:5px;font-size:7px;font-weight:900;cursor:pointer;white-space:nowrap}
      .s3-outside-inline-proof{border:1px solid rgba(216,165,59,.34);background:rgba(216,165,59,.07);color:#f0c45d}
      .s3-outside-inline-proof.has-proof{border-color:rgba(72,207,141,.42);background:rgba(72,207,141,.09);color:#8ce7bc}
      .s3-outside-inline-view{border:1px solid rgba(114,170,247,.30);background:rgba(114,170,247,.07);color:#a7c8f8}
      .s3-outside-inline-proof[disabled],.s3-outside-inline-view[disabled]{opacity:.52;cursor:not-allowed}
      .s3-outside-inline-meta{display:block;color:#7f91a3;font-size:7px;line-height:1.1;text-align:left}
      .s3-outside-inline-wrap.is-empty .s3-outside-inline-sub,
      .s3-outside-inline-wrap.is-empty .s3-outside-inline-meta{display:none!important}
      .s3-outside-inline-wrap.is-empty{gap:0}
      .s3-outside-inline-wrap.has-outside .s3-outside-inline-sub{grid-template-columns:minmax(72px,1fr) auto}
      .s3-outside-inline-wrap.has-proof .s3-outside-inline-sub{grid-template-columns:minmax(64px,1fr) auto auto}
    `;
    document.head.appendChild(s);
  }

  /* Kolom KETERANGAN utama tetap untuk selisih BRI Merchant.
     Jangan fallback menampilkan outside_cashout_note di sana. */
  const baseRowHtml=flow.rowHtml.bind(flow);
  flow.rowHtml=function(branch){
    const saved=this.savedRows.get(this.key(branch.id));
    if(!saved?.outside_cashout_note) return baseRowHtml(branch);
    const keep=saved.outside_cashout_note;
    saved.outside_cashout_note=null;
    try{return baseRowHtml(branch);}finally{saved.outside_cashout_note=keep;}
  };

  function latestOutsideProof(saved){
    return saved?._proofByKind?.OUTSIDE_CASHOUT||null;
  }

  function noteFor(id,saved){
    if(draftNote.has(key(id))) return String(draftNote.get(key(id))||"");
    return String(saved?.outside_cashout_note||"");
  }

  function decorateRow(tr){
    if(!tr) return;
    const id=Number(tr.dataset.cabangId||0);
    if(!id) return;
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return;
    const td=outside.closest("td");
    if(!td) return;
    td.classList.add("s3-outside-inline-cell");

    const saved=flow.savedRows.get(key(id))||{};
    const proof=latestOutsideProof(saved);
    let wrap=td.querySelector('[data-outside-inline-wrap]');
    if(!wrap){
      wrap=document.createElement("div");
      wrap.className="s3-outside-inline-wrap";
      wrap.dataset.outsideInlineWrap="1";
      outside.parentNode.insertBefore(wrap,outside);
      wrap.appendChild(outside);
      const sub=document.createElement("div");
      sub.className="s3-outside-inline-sub";
      sub.innerHTML=`
        <input class="s3-outside-inline-note" data-outside-inline-note type="text" maxlength="220" placeholder="Ket. biaya" aria-label="Keterangan biaya di luar Cashout">
        <input data-outside-inline-file type="file" accept="image/*" hidden>
        <button type="button" class="s3-outside-inline-proof" data-outside-inline-upload>Foto</button>
        <button type="button" class="s3-outside-inline-view" data-outside-inline-view>Lihat</button>`;
      const meta=document.createElement("small");
      meta.className="s3-outside-inline-meta";
      meta.dataset.outsideInlineMeta="1";
      wrap.appendChild(sub);
      wrap.appendChild(meta);
    }

    const note=wrap.querySelector('[data-outside-inline-note]');
    const upload=wrap.querySelector('[data-outside-inline-upload]');
    const view=wrap.querySelector('[data-outside-inline-view]');
    const meta=wrap.querySelector('[data-outside-inline-meta]');
    if(document.activeElement!==note) note.value=noteFor(id,saved);

    const amount=money(outside.value);
    const hasOutside=amount>0||Boolean(note.value.trim())||Boolean(proof);
    wrap.classList.toggle("is-empty",!hasOutside);
    wrap.classList.toggle("has-outside",hasOutside);
    wrap.classList.toggle("has-proof",Boolean(proof));

    const svp=isSvp();
    note.disabled=!svp;
    upload.disabled=!svp||busyUpload.has(key(id));
    upload.classList.toggle("has-proof",Boolean(proof));
    upload.textContent=proof?"Ganti":"Foto";
    view.disabled=!proof;
    view.hidden=!proof;
    meta.textContent=proof?"✓ Bukti biaya":"Belum ada bukti";
  }

  function decorate(){
    style();
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(decorateRow);
  }

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const r=baseRender(...arguments);
    decorate();
    return r;
  };

  /* Wrapper save hanya memisahkan Keterangan BRI vs Keterangan Biaya.
     Base save/rumus canonical tetap dipakai tanpa perubahan. */
  const baseSave=flow.saveRow.bind(flow);
  flow.saveRow=async function(tr,options={}){
    if(!tr||!isSvp()) return baseSave(tr,options);
    const id=Number(tr.dataset.cabangId||0);
    const outsideEl=tr.querySelector('[data-field="outside"]');
    const shared=tr.querySelector('[data-field="note"]');
    const dedicated=String(tr.querySelector('[data-outside-inline-note]')?.value||noteFor(id,this.savedRows.get(this.key(id)))||"").trim();
    if(id) draftNote.set(this.key(id),dedicated);

    const outsideAmount=money(outsideEl?.value);
    if(outsideAmount>0&&!dedicated){
      throw new Error("Biaya di luar Cashout wajib memiliki Ket. Biaya.");
    }

    const originalShared=String(shared?.value||"");
    let borrowed=false;
    if(outsideAmount>0&&dedicated&&shared&&!originalShared.trim()){
      shared.value=dedicated;
      borrowed=true;
    }

    let result;
    try{
      result=await baseSave(tr,options);
    }finally{
      if(borrowed&&shared?.isConnected) shared.value=originalShared;
    }

    const current=this.savedRows.get(this.key(id));
    if(current?.id){
      const proofLatest=current._proofLatest;
      const proofByKind=current._proofByKind;
      const now=new Date().toISOString();
      const {data,error}=await db.from(this.TABLE).update({
        outside_cashout_note:outsideAmount>0?dedicated:null,
        non_cash_note:originalShared.trim()||null,
        updated_by:this.user.id,
        updated_at:now
      }).eq("id",current.id).select("*").single();
      if(error) throw error;
      data._proofLatest=proofLatest||current._proofLatest||null;
      data._proofByKind=proofByKind||current._proofByKind||{};
      this.savedRows.set(this.key(id),data);
    }
    return result;
  };

  async function uploadOutside(tr,file){
    if(!tr||!file||!isSvp()) return;
    const id=Number(tr.dataset.cabangId||0);
    const k=key(id);
    if(!id||busyUpload.has(k)) return;
    const note=String(tr.querySelector('[data-outside-inline-note]')?.value||"").trim();
    const amount=money(tr.querySelector('[data-field="outside"]')?.value);
    if(amount<=0) return flow.fail?.("Isi nominal Biaya di luar Cashout terlebih dahulu.");
    if(!note) return flow.fail?.("Isi Ket. Biaya terlebih dahulu.");

    busyUpload.add(k);
    flow.busy?.(true);
    try{
      draftNote.set(k,note);
      await flow.saveRow(tr,{taken:null,quiet:true});
      const saved=flow.savedRows.get(k);
      if(!saved?.id) throw new Error("Data setoran belum tersimpan.");
      await flow.uploadProof(saved,file,"OUTSIDE_CASHOUT");
      flow.renderTable();
      flow.renderTotals?.();
      flow.ok?.("Foto bukti Biaya di luar Cashout tersimpan.");
    }catch(err){
      flow.fail?.(err?.message||String(err));
    }finally{
      busyUpload.delete(k);
      flow.busy?.(false);
    }
  }

  async function viewOutside(id){
    const saved=flow.savedRows.get(key(id));
    if(!saved?.id) return flow.fail?.("Belum ada bukti biaya.");
    try{
      const proofs=await flow.getProofRows(saved.id);
      const pr=(proofs||[]).find(p=>String(p.proof_kind||"").toUpperCase()==="OUTSIDE_CASHOUT");
      if(!pr?.storage_path) return flow.fail?.("Belum ada bukti biaya.");
      const {data,error}=await db.storage.from(flow.PROOF_BUCKET).createSignedUrl(pr.storage_path,3600);
      if(error||!data?.signedUrl) throw error||new Error("Bukti biaya tidak dapat dibuka.");
      window.open(data.signedUrl,"_blank","noopener,noreferrer");
    }catch(err){
      flow.fail?.(err?.message||String(err));
    }
  }

  document.addEventListener("input",e=>{
    const note=e.target.closest?.('[data-outside-inline-note]');
    if(!note) return;
    const tr=note.closest('tr[data-cabang-id]');
    if(!tr) return;
    draftNote.set(key(tr.dataset.cabangId),note.value);
  });

  document.addEventListener("change",async e=>{
    const note=e.target.closest?.('[data-outside-inline-note]');
    if(note){
      const tr=note.closest('tr[data-cabang-id]');
      if(!tr||!isSvp()) return;
      draftNote.set(key(tr.dataset.cabangId),note.value);
      if(money(tr.querySelector('[data-field="outside"]')?.value)>0){
        try{await flow.saveRow(tr,{taken:null,quiet:true});flow.renderTable();}
        catch(err){flow.fail?.(err?.message||String(err));}
      }
      return;
    }
    const file=e.target.closest?.('[data-outside-inline-file]');
    if(file){
      const tr=file.closest('tr[data-cabang-id]');
      const picked=file.files?.[0];
      file.value="";
      if(picked) await uploadOutside(tr,picked);
    }
  });

  document.addEventListener("click",e=>{
    const upload=e.target.closest?.('[data-outside-inline-upload]');
    if(upload){
      const tr=upload.closest('tr[data-cabang-id]');
      tr?.querySelector('[data-outside-inline-file]')?.click();
      return;
    }
    const view=e.target.closest?.('[data-outside-inline-view]');
    if(view){
      const tr=view.closest('tr[data-cabang-id]');
      if(tr) viewOutside(Number(tr.dataset.cabangId||0));
    }
  });

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",decorate,{once:true});
  else decorate();
})();
