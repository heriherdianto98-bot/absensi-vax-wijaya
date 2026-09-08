/* ERP VAX — Setoran 3 Harian OWNER READ-ONLY guard.
   UI/workflow permission guard only. Tidak mengubah engine canonical/rumus.
   Owner hanya: review, lihat bukti, koreksi, VERIF OWNER, riwayat.

   IMPORTANT:
   - Modul ini TIDAK merender / mengubah kolom KOREKSI.
   - KOREKSI sepenuhnya dimiliki setoran-3-harian-outside-correction.js.
*/
"use strict";
(function bootOwnerReadonlyGuard(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOwnerReadonlyGuard,60);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__ownerReadonlyGuardInstalled) return;
  flow.__ownerReadonlyGuardInstalled=true;

  /* Flow profile adalah identitas canonical halaman Setoran setelah loadIdentity().
     Jangan prioritaskan OwnerAuth.profile karena shell/header dapat masih membawa state sesi sebelumnya. */
  const role=()=>String(flow.profile?.role||flow.role||window.OwnerAuth?.profile?.role||"").toLowerCase();
  const isOwner=()=>role()==="owner";

  function enforce(){
    if(!isOwner()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(tr=>{
      /* Input operasional Owner = read only. */
      tr.querySelectorAll('[data-field="bri"],[data-field="outside"],[data-field="note"],[data-field="taken"],[data-file-input]').forEach(el=>{
        if(!el.disabled) el.disabled=true;
        if(el.getAttribute('aria-disabled')!=='true') el.setAttribute('aria-disabled','true');
      });

      /* Owner tetap boleh LIHAT bukti yang sudah tersimpan. Upload baru tetap dilarang. */
      const id=Number(tr.dataset.cabangId||0);
      const saved=flow.savedRows.get(flow.key(id))||{};
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

      /* Popup editor Keterangan tidak boleh untuk Owner. */
      const note=tr.querySelector('[data-note-popup="1"]');
      if(note){
        note.removeAttribute('data-note-popup');
        note.title='Owner read only';
      }

      /* Popup input Biaya di luar Cashout milik SVP tidak boleh untuk Owner.
         Review Owner dilakukan melalui ikon KOREKSI, bukan ikon input biaya. */
      const outsideOpen=tr.querySelector('[data-s3-outside-open]');
      if(outsideOpen){
        outsideOpen.disabled=true;
        outsideOpen.setAttribute('aria-disabled','true');
        outsideOpen.title='Owner read only. Review melalui ikon KOREKSI.';
      }
    });
  }

  document.addEventListener('click',e=>{
    if(!isOwner()) return;
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
