/* ERP VAX — UI-only viewer bukti foto Biaya di luar Cashout.
   Hanya membaca proof OUTSIDE_CASHOUT + signed URL. Tidak mengubah engine/rumus/data. */
"use strict";
(function bootOutsideProofViewer(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsideProofViewer,80);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__outsideProofViewerInstalled) return;
  flow.__outsideProofViewerInstalled=true;

  function ensureStyle(){
    if(document.getElementById('s3OutsideProofViewerStyle')) return;
    const s=document.createElement('style');
    s.id='s3OutsideProofViewerStyle';
    s.textContent=`
      .s3-outside-view-proof{margin-left:auto;min-height:28px;padding:5px 9px;border:1px solid rgba(74,222,128,.38);border-radius:7px;background:rgba(22,101,52,.14);color:#8deab1;font-size:10px;font-weight:1000;cursor:pointer;white-space:nowrap}
      .s3-outside-view-proof:hover{background:rgba(22,101,52,.24);border-color:rgba(74,222,128,.68)}

      #s3OutsideProofPreview{z-index:10080}
      #s3OutsideProofPreview .s3sheet-modal-backdrop{background:rgba(2,6,10,.88);backdrop-filter:blur(8px)}
      #s3OutsideProofPreview .s3sheet-modal-panel{
        width:min(760px,calc(100vw - 34px));
        max-height:92vh;
        padding:0;
        overflow:hidden;
        border:1px solid rgba(216,165,59,.34);
        border-radius:16px;
        background:#0a141e;
        box-shadow:0 28px 90px rgba(0,0,0,.78),0 0 0 1px rgba(255,255,255,.025) inset
      }
      #s3OutsideProofPreview .s3sheet-modal-head{
        min-height:58px;
        padding:13px 16px;
        border-bottom:1px solid rgba(216,165,59,.16);
        background:linear-gradient(180deg,rgba(216,165,59,.055),rgba(8,17,25,.18));
        display:flex;align-items:center;justify-content:space-between;gap:12px
      }
      #s3OutsideProofPreview .s3sheet-modal-head strong{display:block;font-size:15px;letter-spacing:.035em;color:#f4f7fa}
      #s3OutsideProofPreview .s3sheet-modal-head small{display:block;margin-top:3px;color:#8999a8;font-size:10px;font-weight:800}
      #s3OutsideProofPreview .s3sheet-modal-head button{
        width:32px;height:32px;border:1px solid rgba(255,255,255,.10);border-radius:9px;background:#0e1923;color:#d7e0e8;font-size:20px;line-height:1;cursor:pointer
      }
      #s3OutsideProofPreview .s3sheet-modal-head button:hover{border-color:rgba(216,165,59,.46);color:#f4c85b}

      #s3OutsideProofPreview .s3-outside-proof-preview-body{
        padding:16px;
        overflow:auto;
        max-height:calc(92vh - 59px);
        background:
          radial-gradient(circle at 50% 18%,rgba(216,165,59,.06),transparent 34%),
          #071019
      }
      #s3OutsideProofPreview .s3-proof-gallery-stage{
        width:100%;
        min-height:420px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:14px;
        box-sizing:border-box;
        border:1px solid rgba(255,255,255,.055);
        border-radius:14px;
        background:linear-gradient(145deg,#0b1620,#08111a);
        box-shadow:0 12px 32px rgba(0,0,0,.28) inset
      }
      #s3OutsideProofPreview .s3-proof-gallery-card{
        position:relative;
        display:flex;
        align-items:center;
        justify-content:center;
        max-width:100%;
        max-height:72vh;
        padding:9px;
        border:1px solid rgba(216,165,59,.22);
        border-radius:12px;
        background:#050a0f;
        box-shadow:0 18px 48px rgba(0,0,0,.48)
      }
      #s3OutsideProofPreview img{
        display:block;
        width:auto;
        height:auto;
        max-width:100%;
        max-height:68vh;
        margin:0 auto;
        border-radius:8px;
        object-fit:contain;
        background:#05090d;
        user-select:none
      }
      #s3OutsideProofPreview .s3-proof-gallery-caption{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-top:11px;
        padding:10px 12px;
        border:1px solid rgba(255,255,255,.055);
        border-radius:10px;
        background:#0b151f;
        color:#8f9eab;
        font-size:10px;
        font-weight:800
      }
      #s3OutsideProofPreview .s3-proof-gallery-badge{color:#79e5aa;font-size:10px;font-weight:1000;white-space:nowrap}
      #s3OutsideProofPreview .s3-proof-loading{min-height:420px;display:flex;align-items:center;justify-content:center;color:#91a1af;font-size:12px;font-weight:800}

      @media(max-width:700px){
        #s3OutsideProofPreview .s3sheet-modal-panel{width:calc(100vw - 18px);max-height:94vh;border-radius:13px}
        #s3OutsideProofPreview .s3-outside-proof-preview-body{padding:10px;max-height:calc(94vh - 59px)}
        #s3OutsideProofPreview .s3-proof-gallery-stage{min-height:320px;padding:8px}
        #s3OutsideProofPreview .s3-proof-gallery-card{padding:6px;max-height:75vh}
        #s3OutsideProofPreview img{max-height:71vh}
      }
    `;
    document.head.appendChild(s);
  }

  function ensurePreview(){
    let m=document.getElementById('s3OutsideProofPreview');
    if(m) return m;
    m=document.createElement('div');
    m.className='s3sheet-modal';
    m.id='s3OutsideProofPreview';
    m.hidden=true;
    m.innerHTML=`
      <div class="s3sheet-modal-backdrop" data-outside-proof-preview-close></div>
      <div class="s3sheet-modal-panel">
        <div class="s3sheet-modal-head">
          <div><strong>GALERI BUKTI BIAYA</strong><small id="s3OutsideProofPreviewMeta">—</small></div>
          <button type="button" aria-label="Tutup" data-outside-proof-preview-close>×</button>
        </div>
        <div class="s3-outside-proof-preview-body"><div id="s3OutsideProofPreviewBody" class="s3-proof-loading">Memuat foto...</div></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-outside-proof-preview-close]').forEach(x=>x.addEventListener('click',()=>{m.hidden=true;}));
    return m;
  }

  function hasOutsideProof(id){
    const saved=flow.savedRows.get(flow.key(id))||{};
    return Boolean(saved?._proofByKind?.OUTSIDE_CASHOUT);
  }

  function syncButton(){
    ensureStyle();
    const modal=document.getElementById('s3OutsideCostModal');
    if(!modal||modal.hidden) return;
    const id=Number(modal.dataset.branchId||0);
    const row=modal.querySelector('#s3OutsideProofMini')?.closest('.s3-outside-proof-row');
    if(!row||!id) return;
    let btn=row.querySelector('[data-s3-outside-view-proof]');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='s3-outside-view-proof';
      btn.dataset.s3OutsideViewProof='1';
      btn.textContent='👁 LIHAT FOTO';
      row.appendChild(btn);
    }
    btn.hidden=!hasOutsideProof(id);
  }

  async function openPhoto(){
    const source=document.getElementById('s3OutsideCostModal');
    const id=Number(source?.dataset?.branchId||0);
    if(!id) return;
    const saved=flow.savedRows.get(flow.key(id));
    if(!saved?.id) return flow.fail?.('Bukti biaya belum tersedia.');

    const preview=ensurePreview();
    const body=preview.querySelector('#s3OutsideProofPreviewBody');
    const meta=preview.querySelector('#s3OutsideProofPreviewMeta');
    body.className='s3-proof-loading';
    body.textContent='Memuat foto...';
    meta.textContent='—';
    preview.hidden=false;
    try{
      const {data,error}=await db.from(flow.PROOF_TABLE)
        .select('id,storage_path,proof_kind,uploaded_at')
        .eq('setoran_id',saved.id)
        .eq('proof_kind','OUTSIDE_CASHOUT')
        .order('uploaded_at',{ascending:false})
        .limit(1);
      if(error) throw error;
      const proof=(data||[])[0];
      if(!proof?.storage_path) throw new Error('Foto bukti biaya tidak ditemukan.');
      const {data:signed,error:se}=await db.storage.from(flow.PROOF_BUCKET).createSignedUrl(proof.storage_path,3600);
      if(se) throw se;
      if(!signed?.signedUrl) throw new Error('URL foto bukti tidak tersedia.');
      const branch=flow.canonicalName(flow.branches.find(b=>Number(b.id)===id)?.nama_cabang||'');
      const stamp=proof.uploaded_at?new Date(proof.uploaded_at).toLocaleString('id-ID'):'';
      meta.textContent=`${branch}${stamp?' · '+stamp:''}`;
      body.className='';
      body.innerHTML=`
        <div class="s3-proof-gallery-stage">
          <div class="s3-proof-gallery-card"><img alt="Bukti Biaya di luar Cashout"></div>
        </div>
        <div class="s3-proof-gallery-caption">
          <span>${branch||'Bukti biaya'}${stamp?' · '+stamp:''}</span>
          <span class="s3-proof-gallery-badge">✓ OUTSIDE CASHOUT</span>
        </div>`;
      body.querySelector('img').src=signed.signedUrl;
    }catch(err){
      body.className='s3-proof-loading';
      body.textContent=err?.message||String(err);
    }
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-s3-outside-open]')) setTimeout(syncButton,30);
    if(e.target.closest?.('[data-s3-outside-view-proof]')){
      e.preventDefault();
      e.stopPropagation();
      openPhoto();
    }
  });

  const observer=new MutationObserver(()=>syncButton());
  const attach=()=>{
    const modal=document.getElementById('s3OutsideCostModal');
    if(modal) observer.observe(modal,{attributes:true,attributeFilter:['hidden'],subtree:true,childList:true,characterData:true});
    syncButton();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(attach,120),{once:true});
  else setTimeout(attach,120);
})();
