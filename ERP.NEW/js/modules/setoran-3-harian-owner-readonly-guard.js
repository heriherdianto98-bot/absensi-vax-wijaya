/* ERP VAX — Setoran 3 Harian OWNER READ-ONLY guard.
   UI/workflow permission guard only. Tidak mengubah engine canonical/rumus.
   Owner hanya: review, lihat catatan/bukti, VERIF OWNER, riwayat. */
"use strict";
(function bootOwnerReadonlyGuard(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOwnerReadonlyGuard,60);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__ownerReadonlyGuardInstalled) return;
  flow.__ownerReadonlyGuardInstalled=true;

  const role=()=>String(flow.profile?.role||flow.role||window.OwnerAuth?.profile?.role||"").toLowerCase();
  const isOwner=()=>role()==="owner";

  function ensureNoteViewer(){
    if(document.getElementById("s3OwnerNoteViewModal")) return;
    const style=document.createElement("style");
    style.id="s3OwnerNoteViewStyle";
    style.textContent=`
      .s3-owner-note-wrap{display:flex;align-items:center;gap:6px;min-width:0}
      .s3-owner-note-wrap .s3sheet-note{min-width:0;flex:1 1 auto}
      .s3-owner-note-view{flex:0 0 auto;height:32px;padding:0 10px;border:1px solid rgba(216,165,59,.34);border-radius:8px;background:rgba(216,165,59,.08);color:#f0c45d;font-size:10px;font-weight:900;cursor:pointer}
      .s3-owner-note-view:hover{border-color:rgba(216,165,59,.72);background:rgba(216,165,59,.14)}
      #s3OwnerNoteViewModal .s3sheet-modal-panel{width:min(620px,calc(100vw - 36px));padding:0;overflow:hidden}
      #s3OwnerNoteViewModal .s3-owner-note-body{padding:18px 20px 20px}
      #s3OwnerNoteViewModal .s3-owner-note-copy{white-space:pre-wrap;word-break:break-word;line-height:1.55;font-size:15px;font-weight:700;color:#eef3f7;background:#0a141e;border:1px solid rgba(216,165,59,.20);border-radius:10px;padding:14px;min-height:84px}
      #s3OwnerNoteViewModal .s3-owner-note-actions{display:flex;justify-content:flex-end;margin-top:14px}
      #s3OwnerNoteViewModal .s3-owner-note-actions button{min-height:38px;padding:8px 14px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#111c27;color:#dce5ee;font-weight:900;cursor:pointer}
    `;
    document.head.appendChild(style);

    const modal=document.createElement("div");
    modal.className="s3sheet-modal";
    modal.id="s3OwnerNoteViewModal";
    modal.hidden=true;
    modal.innerHTML=`
      <div class="s3sheet-modal-backdrop" data-owner-note-close></div>
      <div class="s3sheet-modal-panel" role="dialog" aria-modal="true" aria-labelledby="s3OwnerNoteTitle">
        <div class="s3sheet-modal-head"><div><strong id="s3OwnerNoteTitle">KETERANGAN</strong><small id="s3OwnerNoteMeta">—</small></div><button type="button" data-owner-note-close>×</button></div>
        <div class="s3-owner-note-body">
          <div class="s3-owner-note-copy" id="s3OwnerNoteCopy">—</div>
          <div class="s3-owner-note-actions"><button type="button" data-owner-note-close>TUTUP</button></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-owner-note-close]").forEach(btn=>btn.addEventListener("click",()=>{modal.hidden=true;}));
  }

  function openNoteViewer(id){
    if(!isOwner()) return;
    ensureNoteViewer();
    const saved=flow.savedRows.get(flow.key(id))||{};
    const note=String(saved.non_cash_note||saved.spv_note||saved.outside_cashout_note||"").trim();
    const branch=flow.canonicalName(flow.branches.find(b=>Number(b.id)===Number(id))?.nama_cabang||"");
    const p=typeof flow.period==="function"?flow.period():null;
    document.getElementById("s3OwnerNoteTitle").textContent=`KETERANGAN · ${branch||"CABANG"}`;
    document.getElementById("s3OwnerNoteMeta").textContent=p?`${p.start} — ${p.end}`:"—";
    document.getElementById("s3OwnerNoteCopy").textContent=note||"Tidak ada keterangan.";
    document.getElementById("s3OwnerNoteViewModal").hidden=false;
  }

  function decorateOwnerNote(tr,id){
    const note=tr.querySelector('[data-field="note"]');
    if(!note) return;
    note.disabled=true;
    note.setAttribute('aria-disabled','true');
    note.title='Owner read only';

    const td=note.closest('td');
    if(!td) return;
    let wrap=td.querySelector('[data-owner-note-wrap]');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='s3-owner-note-wrap';
      wrap.dataset.ownerNoteWrap='1';
      note.parentNode.insertBefore(wrap,note);
      wrap.appendChild(note);
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='s3-owner-note-view';
      btn.dataset.ownerNoteView=String(id);
      btn.textContent='Lihat';
      btn.title='Lihat seluruh isi keterangan';
      wrap.appendChild(btn);
    }
  }

  function enforce(){
    if(!isOwner()) return;
    ensureNoteViewer();
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(tr=>{
      tr.querySelectorAll('[data-field="bri"],[data-field="outside"],[data-field="note"],[data-field="taken"],[data-file-input]').forEach(el=>{
        if(!el.disabled) el.disabled=true;
        if(el.getAttribute('aria-disabled')!=='true') el.setAttribute('aria-disabled','true');
      });

      const id=Number(tr.dataset.cabangId||0);
      const saved=flow.savedRows.get(flow.key(id))||{};
      decorateOwnerNote(tr,id);

      const proof=tr.querySelector('[data-action="proof"]');
      if(proof){
        const hasSaved=Boolean(saved._proofLatest||saved.proof_path||saved._proofByKind?.NON_CASH_DIFF||saved._proofByKind?.OUTSIDE_CASHOUT||saved._proofByKind?.SETORAN);
        if(hasSaved){
          proof.disabled=false;
          proof.removeAttribute('aria-disabled');
          proof.textContent='Lihat';
          proof.classList.add('has-proof');
          proof.title='Lihat bukti SVP';
        }else{
          proof.disabled=true;
          proof.setAttribute('aria-disabled','true');
          proof.title='Belum ada bukti tersimpan';
        }
      }

      const notePopup=tr.querySelector('[data-note-popup="1"]');
      if(notePopup) notePopup.removeAttribute('data-note-popup');

      const outsideOpen=tr.querySelector('[data-s3-outside-open]');
      if(outsideOpen){
        outsideOpen.disabled=true;
        outsideOpen.setAttribute('aria-disabled','true');
        outsideOpen.title='Owner read only';
      }
    });
  }

  document.addEventListener('click',e=>{
    if(!isOwner()) return;
    const view=e.target.closest?.('[data-owner-note-view]');
    if(view){
      e.preventDefault();
      e.stopImmediatePropagation();
      openNoteViewer(Number(view.dataset.ownerNoteView||0));
      return;
    }
    const operational=e.target.closest?.('[data-note-popup="1"],[data-s3-outside-open],[data-corr-resubmit]');
    if(operational){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const r=baseRender(...arguments);
    setTimeout(enforce,0);
    setTimeout(enforce,60);
    return r;
  };

  const obs=new MutationObserver(()=>setTimeout(enforce,0));
  function bind(){
    const body=document.getElementById('s3sheetBody');
    if(body) obs.observe(body,{childList:true,subtree:true});
    enforce();
    setTimeout(enforce,250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,180),{once:true});
  else setTimeout(bind,180);
})();
