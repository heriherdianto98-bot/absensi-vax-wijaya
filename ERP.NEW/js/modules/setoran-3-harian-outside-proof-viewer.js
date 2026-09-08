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
      #s3OutsideProofPreview .s3sheet-modal-panel{width:min(860px,calc(100vw - 34px));max-height:92vh;padding:0;overflow:auto;border:1px solid rgba(216,165,59,.42);box-shadow:0 24px 80px rgba(0,0,0,.72)}
      #s3OutsideProofPreview .s3-outside-proof-preview-body{padding:16px;text-align:center}
      #s3OutsideProofPreview img{display:block;max-width:100%;max-height:72vh;margin:0 auto;border-radius:11px;border:1px solid rgba(216,165,59,.24);object-fit:contain;background:#070d12}
      #s3OutsideProofPreview .s3-outside-proof-preview-meta{margin-top:9px;color:#91a1af;font-size:11px;font-weight:800}
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
          <div><strong>BUKTI BIAYA DI LUAR CASHOUT</strong><small id="s3OutsideProofPreviewMeta">—</small></div>
          <button type="button" data-outside-proof-preview-close>×</button>
        </div>
        <div class="s3-outside-proof-preview-body"><div id="s3OutsideProofPreviewBody">Memuat foto...</div></div>
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
      meta.textContent=`${branch}${proof.uploaded_at?' · '+new Date(proof.uploaded_at).toLocaleString('id-ID'):''}`;
      body.innerHTML='';
      const img=document.createElement('img');
      img.src=signed.signedUrl;
      img.alt='Bukti Biaya di luar Cashout';
      body.appendChild(img);
    }catch(err){
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
