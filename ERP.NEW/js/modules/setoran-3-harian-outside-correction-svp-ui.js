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
  const canonicalRole=()=>String(
    flow.profile?.role || flow.role ||
    ((typeof OwnerAuth!=="undefined" && OwnerAuth?.profile?.role) || "")
  ).toLowerCase();
  const isSvp=()=>["svp","spv"].includes(canonicalRole());
  const key=id=>flow.key(id);
  const ts=v=>{const n=Date.parse(v||"");return Number.isFinite(n)?n:0;};

  /* Cache readiness per correction request. Keyed by branch + requested_at supaya
     query proof hanya sekali untuk satu request, bukan setiap render tabel. */
  const readyCache=new Map();
  const checkedRequest=new Set();
  let decorating=false;
  let queued=false;

  function requestKey(id,saved){
    return `${id}:${saved?.outside_correction_requested_at||""}`;
  }
  function setText(el,text){if(el&&el.textContent!==text) el.textContent=text;}
  function scheduleDecorate(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorateAttention();});
  }

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

  async function checkReadyOnce(id,saved,{force=false}={}){
    if(!saved?.id||statusOf(saved)!=="REQUESTED") return false;
    const rk=requestKey(id,saved);
    if(!force&&checkedRequest.has(rk)) return readyCache.get(rk)===true;
    checkedRequest.add(rk);

    const requestedAt=ts(saved.outside_correction_requested_at);
    if(!requestedAt){readyCache.set(rk,false);return false;}
    const editedAfterRequest=ts(saved.updated_at)>requestedAt;
    if(!editedAfterRequest){readyCache.set(rk,false);return false;}

    try{
      const proofs=await flow.getProofRows(saved.id);
      const latestOutside=(proofs||[])
        .filter(p=>String(p.proof_kind||"").toUpperCase()==="OUTSIDE_CASHOUT")
        .sort((a,b)=>ts(b.uploaded_at)-ts(a.uploaded_at))[0];
      const ready=Boolean(latestOutside&&ts(latestOutside.uploaded_at)>requestedAt);
      readyCache.set(rk,ready);
      return ready;
    }catch(_e){
      readyCache.set(rk,false);
      return false;
    }
  }

  function applyResendState(tr,id,saved){
    const resend=tr.querySelector('[data-corr-resubmit]');
    if(!resend||statusOf(saved)!=="REQUESTED") return;
    const rk=requestKey(id,saved);
    const ready=readyCache.get(rk)===true;
    resend.disabled=!ready;
    resend.title=ready
      ? 'Perbaikan + foto terbaru sudah lengkap. Klik untuk kirim ulang ke Owner.'
      : 'Buka ikon Biaya di luar Cashout yang berkedip merah, perbaiki data lalu upload foto terbaru.';
    let hint=resend.parentElement?.querySelector('[data-corr-ready-hint]');
    if(!hint&&resend.parentElement){
      hint=document.createElement('span');
      hint.className='s3-corr-ready-hint';
      hint.dataset.corrReadyHint='1';
      resend.parentElement.appendChild(hint);
    }
    setText(hint,ready?'Siap dikirim ulang':'Perbaiki via ikon merah dulu');
  }

  function decorateAttention(){
    if(decorating) return;
    decorating=true;
    try{
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
        if(requested){
          applyResendState(tr,id,saved);
          const rk=requestKey(id,saved);
          if(!checkedRequest.has(rk)){
            checkReadyOnce(id,saved).then(()=>{
              if(tr.isConnected) applyResendState(tr,id,flow.savedRows.get(key(id))||saved);
            });
          }
        }
      });
    }finally{decorating=false;}
  }

  function decoratePopupFromOpenModal(){
    if(!isSvp()) return;
    const modal=document.getElementById('s3OutsideCostModal');
    if(!modal||modal.hidden) return;
    const id=Number(modal.dataset.branchId||0);
    if(!id) return;
    const saved=flow.savedRows.get(key(id))||{};
    if(statusOf(saved)!=="REQUESTED") return;
    const form=modal.querySelector('.s3-outside-form');
    if(!form) return;

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
    setText(st,'Koreksi Owner aktif — upload foto bukti terbaru wajib.');
  }

  /* PENTING: tidak ada handler klik kedua pada ikon merah.
     Popup dibuka hanya oleh modul popup utama. Saat field popup menerima focus,
     kita hanya menempel panel koreksi ke popup yang SUDAH terbuka. */
  document.addEventListener('focusin',e=>{
    if(e.target?.id==='s3OutsideAmount') decoratePopupFromOpenModal();
  });

  /* Saat SIMPAN koreksi: validasi foto terbaru. Setelah save selesai, cek proof sekali lagi.
     Tidak query proof pada setiap render. */
  document.addEventListener('click',e=>{
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
      return;
    }

    const rk=requestKey(id,saved);
    checkedRequest.delete(rk);
    readyCache.delete(rk);
    setTimeout(async()=>{
      const latest=flow.savedRows.get(key(id))||saved;
      await checkReadyOnce(id,latest,{force:true});
      scheduleDecorate();
    },700);
  },true);

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const r=baseRender(...arguments);
    scheduleDecorate();
    return r;
  };

  /* Hanya pergantian row langsung. Tidak subtree observer, tidak atribut observer. */
  const observer=new MutationObserver(()=>scheduleDecorate());
  function bind(){
    ensureStyle();
    const body=document.getElementById('s3sheetBody');
    if(body) observer.observe(body,{childList:true});
    scheduleDecorate();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,160),{once:true});
  else setTimeout(bind,160);
})();
