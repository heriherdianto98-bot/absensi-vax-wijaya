/* ERP VAX — SVP attention flow untuk koreksi Biaya di luar Cashout.
   Additive UI/workflow guard only. Tidak mengubah DailyDataEngine, SetoranMoneyEngine,
   rumus canonical, Cash Aktual, atau engine finance yang LOCK. */
"use strict";
(function bootOutsideCorrectionSvpUi(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsideCorrectionSvpUi,80);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__outsideCorrectionSvpUiInstalled) return;
  flow.__outsideCorrectionSvpUiInstalled=true;

  const statusOf=s=>String(s?.outside_correction_status||"NONE").toUpperCase();
  const isSvp=()=>typeof flow.isSvp==="function" && flow.isSvp();
  const proofReadyCache=new Map();

  function ts(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
  function key(id){return flow.key(id);}

  function ensureStyle(){
    if(document.getElementById("s3OutsideCorrectionSvpUiStyle")) return;
    const s=document.createElement("style");
    s.id="s3OutsideCorrectionSvpUiStyle";
    s.textContent=`
      .s3-outside-open.correction-requested{border-color:#ff5d5d!important;background:rgba(153,27,27,.24)!important;color:#ffd6d6!important;box-shadow:0 0 0 1px rgba(255,93,93,.15),0 0 12px rgba(239,68,68,.78)!important;animation:s3OutsideCorrectionRedBlink .62s steps(2,end) infinite!important}
      .s3-outside-open.correction-requested:hover{background:rgba(185,28,28,.34)!important;border-color:#ff8c8c!important}
      @keyframes s3OutsideCorrectionRedBlink{0%,100%{opacity:1;filter:brightness(1);transform:scale(1)}50%{opacity:.34;filter:brightness(1.45);transform:scale(.92)}}
      .s3-corr-owner-note-box{grid-column:1/-1;padding:12px 14px;border:1px solid rgba(248,113,113,.48);border-left:4px solid #ef4444;border-radius:10px;background:linear-gradient(90deg,rgba(127,29,29,.22),rgba(127,29,29,.08));color:#ffe2e2}
      .s3-corr-owner-note-box strong{display:block;margin-bottom:5px;color:#ff8f8f;font-size:11px;font-weight:1000;letter-spacing:.08em;text-transform:uppercase}
      .s3-corr-owner-note-box span{display:block;font-size:13px;font-weight:800;line-height:1.45}
      .s3-corr-owner-note-box small{display:block;margin-top:7px;color:#cda5a5;font-size:10px;font-weight:700}
      .s3-corr-state.svp[disabled]{opacity:.42!important;cursor:not-allowed!important;filter:saturate(.5)}
      .s3-corr-ready-hint{display:block;margin-top:5px;color:#fca5a5;font-size:9px;font-weight:800;line-height:1.25}
      @media(prefers-reduced-motion:reduce){.s3-outside-open.correction-requested{animation:none!important}}
    `;
    document.head.appendChild(s);
  }

  async function freshCorrectionReady(id,saved){
    if(!saved?.id || statusOf(saved)!=="REQUESTED") return false;
    const requestedAt=ts(saved.outside_correction_requested_at);
    if(!requestedAt) return false;
    const editedAfterRequest=ts(saved.updated_at)>requestedAt;
    if(!editedAfterRequest) return false;
    try{
      const proofs=await flow.getProofRows(saved.id);
      const latestOutside=(proofs||[])
        .filter(p=>String(p.proof_kind||"").toUpperCase()==="OUTSIDE_CASHOUT")
        .sort((a,b)=>ts(b.uploaded_at)-ts(a.uploaded_at))[0];
      return Boolean(latestOutside && ts(latestOutside.uploaded_at)>requestedAt);
    }catch(_e){return false;}
  }

  function decorateAttention(){
    ensureStyle();
    if(!isSvp()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(tr=>{
      const id=Number(tr.dataset.cabangId||0);
      const saved=flow.savedRows.get(key(id))||{};
      const requested=statusOf(saved)==="REQUESTED";
      const btn=tr.querySelector('[data-s3-outside-open]');
      if(btn){
        btn.classList.toggle('correction-requested',requested);
        if(requested){
          btn.title='KOREKSI OWNER: klik untuk perbaiki nominal, keterangan, dan upload foto terbaru.';
          btn.setAttribute('aria-label','Koreksi Owner — buka Biaya di luar Cashout');
        }
      }

      const resend=tr.querySelector('[data-corr-resubmit]');
      if(resend && requested){
        const ready=proofReadyCache.get(id)===true;
        resend.disabled=!ready;
        resend.title=ready
          ? 'Perbaikan + foto terbaru sudah lengkap. Klik untuk kirim ulang ke Owner.'
          : 'Klik ikon Biaya di luar Cashout yang berkedip merah. Edit data dan upload foto terbaru terlebih dahulu.';
        let hint=resend.parentElement?.querySelector('[data-corr-ready-hint]');
        if(!hint && resend.parentElement){
          hint=document.createElement('span');
          hint.className='s3-corr-ready-hint';
          hint.dataset.corrReadyHint='1';
          resend.parentElement.appendChild(hint);
        }
        if(hint) hint.textContent=ready?'Siap dikirim ulang':'Perbaiki via ikon merah dulu';

        freshCorrectionReady(id,saved).then(v=>{
          proofReadyCache.set(id,v);
          if(resend.isConnected){
            resend.disabled=!v;
            resend.title=v?'Perbaikan + foto terbaru sudah lengkap. Klik untuk kirim ulang ke Owner.':'Klik ikon Biaya di luar Cashout yang berkedip merah. Edit data dan upload foto terbaru terlebih dahulu.';
            const h=resend.parentElement?.querySelector('[data-corr-ready-hint]');
            if(h) h.textContent=v?'Siap dikirim ulang':'Perbaiki via ikon merah dulu';
          }
        });
      }
    });
  }

  function decoratePopup(id){
    if(!isSvp()) return;
    const saved=flow.savedRows.get(key(id))||{};
    if(statusOf(saved)!=="REQUESTED") return;
    const modal=document.getElementById('s3OutsideCostModal');
    const form=modal?.querySelector('.s3-outside-form');
    if(!modal||!form) return;
    let box=form.querySelector('[data-s3-corr-owner-note]');
    if(!box){
      box=document.createElement('div');
      box.className='s3-corr-owner-note-box';
      box.dataset.s3CorrOwnerNote='1';
      form.insertBefore(box,form.firstElementChild);
    }
    const note=String(saved.outside_correction_note||'Mohon perbaiki data Biaya di luar Cashout.').trim();
    box.innerHTML=`<strong>⚠ KOREKSI DARI OWNER</strong><span>${flow.esc?flow.esc(note):note}</span><small>Perbaiki nominal + keterangan, lalu wajib upload foto bukti TERBARU. Setelah SIMPAN, tombol KIRIM ULANG akan aktif.</small>`;

    const st=modal.querySelector('#s3OutsideProofStatus');
    if(st) st.textContent='Koreksi Owner aktif — upload foto bukti terbaru wajib.';
  }

  /* Saat REQUESTED, SIMPAN popup wajib memakai foto BARU. Foto lama tidak cukup. */
  document.addEventListener('click',e=>{
    const open=e.target.closest?.('[data-s3-outside-open]');
    if(open){
      const id=Number(open.dataset.s3OutsideOpen||0);
      setTimeout(()=>decoratePopup(id),40);
      return;
    }

    const save=e.target.closest?.('#s3OutsideCostModal [data-outside-save]');
    if(!save||!isSvp()) return;
    const modal=document.getElementById('s3OutsideCostModal');
    const id=Number(modal?.dataset?.branchId||0);
    const saved=flow.savedRows.get(key(id))||{};
    if(statusOf(saved)!=="REQUESTED") return;
    const file=modal?.querySelector('#s3OutsideFile')?.files?.[0];
    if(!file){
      e.preventDefault();
      e.stopImmediatePropagation();
      flow.fail?.('Koreksi Owner: wajib upload foto bukti TERBARU sebelum SIMPAN.');
    }
  },true);

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const r=baseRender(...arguments);
    setTimeout(decorateAttention,0);
    return r;
  };

  const observer=new MutationObserver(()=>decorateAttention());
  function bind(){
    ensureStyle();
    const body=document.getElementById('s3sheetBody');
    if(body) observer.observe(body,{childList:true,subtree:true});
    decorateAttention();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,160),{once:true});
  else setTimeout(bind,160);
})();
