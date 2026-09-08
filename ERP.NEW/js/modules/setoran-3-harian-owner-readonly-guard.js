/* ERP VAX — Setoran 3 Harian OWNER READ-ONLY guard.
   UI/workflow permission guard only. Tidak mengubah engine canonical/rumus.
   Owner hanya: review, lihat bukti, koreksi, VERIF OWNER, riwayat. */
"use strict";
(function bootOwnerReadonlyGuard(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOwnerReadonlyGuard,60);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__ownerReadonlyGuardInstalled) return;
  flow.__ownerReadonlyGuardInstalled=true;

  const isOwner=()=>String(flow.role||flow.profile?.role||"").toLowerCase()==="owner";
  const statusOf=s=>String(s?.outside_correction_status||"NONE").toUpperCase();

  function enforce(){
    if(!isOwner()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(tr=>{
      tr.querySelectorAll('[data-field="bri"],[data-field="outside"],[data-field="note"],[data-field="taken"],[data-file-input]').forEach(el=>{
        el.disabled=true;
        el.setAttribute('aria-disabled','true');
      });
      const proof=tr.querySelector('[data-action="proof"]');
      if(proof){
        /* Owner boleh LIHAT bukti yang sudah ada, tetapi tidak boleh membuka file picker/upload baru. */
        const hasSaved=String(proof.textContent||'').trim().toLowerCase().includes('lihat') || proof.classList.contains('has-proof');
        if(!hasSaved){proof.disabled=true;proof.setAttribute('aria-disabled','true');}
      }
      const note=tr.querySelector('[data-note-popup="1"]');
      if(note){
        note.removeAttribute('data-note-popup');
        note.title='Owner read only';
      }
      const outsideOpen=tr.querySelector('[data-s3-outside-open]');
      if(outsideOpen){
        outsideOpen.disabled=true;
        outsideOpen.setAttribute('aria-disabled','true');
        outsideOpen.title='Owner read only. Review melalui kolom KOREKSI.';
      }

      const id=Number(tr.dataset.cabangId||0);
      const saved=flow.savedRows.get(flow.key(id))||{};
      const st=statusOf(saved);
      const corr=tr.querySelector('[data-s3-correction-cell]');
      if(corr && st==="REQUESTED"){
        const resend=corr.querySelector('[data-corr-resubmit]');
        if(resend){
          resend.remove();
          const state=document.createElement('span');
          state.className='s3-corr-state req';
          state.textContent='⚠ PERLU KOREKSI';
          state.title=saved.outside_correction_note||'Menunggu koreksi SVP';
          corr.appendChild(state);
        }
      }
    });
  }

  /* Cegah popup editor Keterangan/biaya terbuka bila ada modul lama yang masih menangkap click. */
  document.addEventListener('click',e=>{
    if(!isOwner()) return;
    const operational=e.target.closest?.('[data-note-popup="1"],[data-s3-outside-open]');
    if(operational){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const r=baseRender(...arguments);
    queueMicrotask(enforce);
    return r;
  };

  const obs=new MutationObserver(()=>enforce());
  function bind(){
    const body=document.getElementById('s3sheetBody');
    if(body) obs.observe(body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','data-note-popup']});
    enforce();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,180),{once:true});
  else setTimeout(bind,180);
})();
