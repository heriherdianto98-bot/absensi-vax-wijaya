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

  const isOwner=()=>String(flow.profile?.role||flow.role||"").toLowerCase()==="owner";
  const statusOf=s=>String(s?.outside_correction_status||"NONE").toUpperCase();

  function forceOwnerCorrectionState(tr,saved){
    const corr=tr.querySelector('[data-s3-correction-cell]');
    if(!corr) return;
    const st=statusOf(saved);
    const resend=corr.querySelector('[data-corr-resubmit]');

    /* Owner tidak pernah boleh mendapat tombol KIRIM ULANG.
       Jika modul SVP sempat merender tombol itu, paksa ganti sesuai state koreksi aktual. */
    if(resend){
      resend.remove();
      const state=document.createElement('span');
      if(st==="RESUBMITTED"){
        state.className='s3-corr-state sent';
        state.textContent='✓ DIKIRIM ULANG';
        state.title='SVP sudah mengirim ulang koreksi. Siap direview Owner.';
      }else{
        state.className='s3-corr-state req';
        state.textContent='⚠ PERLU KOREKSI';
        state.title=saved.outside_correction_note||'Menunggu koreksi SVP';
      }
      corr.appendChild(state);
      return;
    }

    /* Normalisasi juga jika cell sudah ada tetapi labelnya salah/stale. */
    if(st==="REQUESTED"){
      const current=corr.querySelector('.s3-corr-state');
      if(!current || current.textContent.trim()!=="⚠ PERLU KOREKSI"){
        corr.innerHTML='';
        const state=document.createElement('span');
        state.className='s3-corr-state req';
        state.textContent='⚠ PERLU KOREKSI';
        state.title=saved.outside_correction_note||'Menunggu koreksi SVP';
        corr.appendChild(state);
      }
    }else if(st==="RESUBMITTED"){
      const current=corr.querySelector('.s3-corr-state');
      if(!current || current.textContent.trim()!=="✓ DIKIRIM ULANG"){
        corr.innerHTML='';
        const state=document.createElement('span');
        state.className='s3-corr-state sent';
        state.textContent='✓ DIKIRIM ULANG';
        state.title='SVP sudah mengirim ulang koreksi. Siap direview Owner.';
        corr.appendChild(state);
      }
    }
  }

  function enforce(){
    if(!isOwner()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(tr=>{
      tr.querySelectorAll('[data-field="bri"],[data-field="outside"],[data-field="note"],[data-field="taken"],[data-file-input]').forEach(el=>{
        if(!el.disabled) el.disabled=true;
        if(el.getAttribute('aria-disabled')!=='true') el.setAttribute('aria-disabled','true');
      });

      const proof=tr.querySelector('[data-action="proof"]');
      if(proof){
        const hasSaved=String(proof.textContent||'').trim().toLowerCase().includes('lihat') || proof.classList.contains('has-proof');
        if(!hasSaved){
          if(!proof.disabled) proof.disabled=true;
          if(proof.getAttribute('aria-disabled')!=='true') proof.setAttribute('aria-disabled','true');
        }
      }

      const note=tr.querySelector('[data-note-popup="1"]');
      if(note){
        note.removeAttribute('data-note-popup');
        note.title='Owner read only';
      }

      const outsideOpen=tr.querySelector('[data-s3-outside-open]');
      if(outsideOpen){
        if(!outsideOpen.disabled) outsideOpen.disabled=true;
        if(outsideOpen.getAttribute('aria-disabled')!=='true') outsideOpen.setAttribute('aria-disabled','true');
        outsideOpen.title='Owner read only. Review melalui kolom KOREKSI.';
      }

      const id=Number(tr.dataset.cabangId||0);
      const saved=flow.savedRows.get(flow.key(id))||{};
      forceOwnerCorrectionState(tr,saved);
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

  /* Observe hanya perubahan struktur row. Jangan observe atribut disabled/data-note-popup. */
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
