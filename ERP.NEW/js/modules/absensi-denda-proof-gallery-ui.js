/* Private photo gallery for fine proof; handles clicks before downstream pop-up handlers. */
(() => {
  'use strict';
  if(window.__vaxFineProofGallery)return;window.__vaxFineProofGallery=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(){if(document.getElementById('vaxFineProofGallery'))return;
    const el=document.createElement('div');el.id='vaxFineProofGallery';el.hidden=true;
    el.innerHTML='<div class="vax-fine-proof-dialog" role="dialog" aria-modal="true" aria-label="Bukti foto absensi"><div><strong>Bukti Foto · Absensi</strong><button type="button" id="vaxFineProofClose">Tutup</button></div><p id="vaxFineProofMessage">Memuat foto…</p><img id="vaxFineProofImage" alt="Bukti foto pengajuan atau keputusan denda" hidden></div>';
    document.body.appendChild(el);document.getElementById('vaxFineProofClose').onclick=()=>{el.hidden=true;document.getElementById('vaxFineProofImage').src='';};
    el.addEventListener('click',e=>{if(e.target===el)document.getElementById('vaxFineProofClose').click();});
    const style=document.createElement('style');style.textContent='#vaxFineProofGallery[hidden],#vaxFineProofGallery img[hidden]{display:none!important}#vaxFineProofGallery{position:fixed;inset:0;z-index:2700;background:#000d;display:grid;place-items:center;padding:16px}#vaxFineProofGallery .vax-fine-proof-dialog{width:min(760px,100%);max-height:90vh;overflow:auto;background:#19232f;border:1px solid #d6ac50;border-radius:16px;padding:20px;color:#fff}#vaxFineProofGallery .vax-fine-proof-dialog>div{display:flex;justify-content:space-between;align-items:center;gap:15px}#vaxFineProofGallery button{background:#49391e;color:#ffdf91;border:1px solid #c5a05a;border-radius:8px;padding:9px 14px;cursor:pointer}#vaxFineProofGallery img{display:block;max-width:100%;max-height:70vh;margin:15px auto;border-radius:9px;object-fit:contain}';document.head.appendChild(style);
  }
  document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-vax-fine-proof]');if(!button)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();mount();
    const modal=document.getElementById('vaxFineProofGallery'),img=document.getElementById('vaxFineProofImage'),message=document.getElementById('vaxFineProofMessage');modal.hidden=false;img.hidden=true;message.textContent='Memuat foto dari penyimpanan privat…';
    try{const path=String(button.dataset.vaxFineProof||'').replace(/^izin-proofs\//,'');if(!path||/^https?:/i.test(path))throw Error('Path bukti tidak valid');
      const {data,error}=await db.storage.from('izin-proofs').createSignedUrl(path,300);if(error||!data?.signedUrl)throw error||Error('Foto tidak tersedia');
      if(modal.hidden)return;img.src=data.signedUrl;img.hidden=false;message.textContent='Bukti dari penyimpanan privat (akses sementara).';
    }catch(err){message.textContent='Gagal memuat foto: '+(err?.message||String(err));}
  },true);
})();