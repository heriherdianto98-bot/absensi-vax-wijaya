/* Owner-only credential UI bridge. Existing Master Karyawan engine remains unchanged. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const modal = $('mkModal');
  const form = $('mkForm');
  if (!modal || !form || typeof db === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    #mkCredentialSection{grid-column:1/-1;padding:14px;border:1px solid rgba(220,177,73,.46);border-radius:13px;background:linear-gradient(145deg,#222522,#121516);color:#eee6d6}
    #mkCredentialSection h4{margin:0 0 9px;color:#efd184;font-size:15px}
    #mkCredentialSection .mkc-line{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:13px;overflow-wrap:anywhere}
    #mkCredentialSection .mkc-line strong{text-align:right;max-width:65%;color:#fff}
    #mkCredentialSection .mkc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #mkCredentialSection button{border:1px solid #aa843c;border-radius:9px;background:#292923;color:#ffe4a5;font-size:13px;font-weight:700;padding:9px 12px;cursor:pointer}
    #mkCredentialSection button:disabled{opacity:.5;cursor:not-allowed}
    #mkCredentialSection .mkc-secret{margin-top:12px;border:1px solid #c59e4e;border-radius:9px;background:#0a0b0b;padding:11px;overflow-wrap:anywhere;color:#ffe3a0;font:700 13px/1.6 ui-monospace,monospace}
    #mkCredentialSection .mkc-note{font-size:12px;color:#c4bbab;margin:9px 0 0}
    #mkCredentialSection .mkc-error{color:#ffa5a5}
  `;
  document.head.appendChild(style);
  const section = document.createElement('section');
  section.id = 'mkCredentialSection';
  section.hidden = true;
  section.setAttribute('aria-label', 'Akses Login Karyawan');
  section.innerHTML = `<h4>Akses Login · Owner</h4>
    <div class="mkc-line"><span>Kode login</span><strong id="mkcCode">—</strong></div>
    <div class="mkc-line"><span>Status password</span><strong id="mkcStatus">Memuat…</strong></div>
    <div class="mkc-actions"><button type="button" id="mkcView">Lihat Kredensial</button><button type="button" id="mkcReset">Reset Password</button></div>
    <p class="mkc-note" id="mkcNote">Password lama tidak dapat dilihat. Reset menerbitkan password unik satu kali dan mengakhiri sesi karyawan yang masih aktif.</p>
    <div id="mkcResult" class="mkc-secret" hidden><div id="mkcOneTime"></div><button type="button" id="mkcCopy">Salin password sementara</button><button type="button" id="mkcClear">Tutup & hapus tampilan</button></div>`;
  const address = $('mkFormAddress')?.closest('.mk-field');
  if (address) address.insertAdjacentElement('afterend', section);
  else form.insertBefore(section, $('mkFormError'));
  let currentId = 0;
  let requestId = 0;
  let secret = '';
  function clearSecret(){ secret = ''; $('mkcOneTime').textContent = ''; $('mkcResult').hidden = true; }
  function note(text, error = false){ const n=$('mkcNote'); n.textContent=text; n.classList.toggle('mkc-error',error); }
  async function detail(id){
    const r = await db.rpc('karyawan_credential_owner_detail', {p_karyawan_id:id});
    if (r.error || r.data?.ok !== true) throw new Error(r.data?.reason || r.error?.message || 'Akses Owner diperlukan.');
    return r.data;
  }
  function render(data){
    $('mkcCode').textContent=data.kode_login || 'Belum tersedia';
    $('mkcStatus').textContent={PASSWORD_PRIBADI_ATAU_SEMENTARA:'Password tersimpan (tidak dapat dilihat)',KREDENSIAL_LAMA:'Password/PIN awal masih aktif',BELUM_ADA_PASSWORD:'Belum ada password'}[data.status]||'Belum diketahui';
    $('mkcReset').disabled = data.aktif !== true || !data.kode_login;
    note('Password lama tidak bisa ditampilkan. Reset membuat password unik baru, mencabut kredensial lama, dan mengakhiri sesi karyawan.');
  }
  async function refresh(id){
    const seq=++requestId;
    clearSecret();
    section.hidden = !id;
    if(!id) return;
    $('mkcCode').textContent='Memuat…'; $('mkcStatus').textContent='Memuat…';
    $('mkcReset').disabled=true;
    try { const data=await detail(id); if(seq===requestId && id===currentId && modal.getAttribute('aria-hidden')==='false') render(data); }
    catch(e){ if(seq===requestId){ $('mkcStatus').textContent='Tidak tersedia'; note(e.message,true); $('mkcReset').disabled=true; } }
  }
  const observer = new MutationObserver(() => {
    if(modal.getAttribute('aria-hidden')!=='false'){
      ++requestId; currentId=0; section.hidden=true; clearSecret(); return;
    }
    const id=Number($('mkFormId')?.value||0);
    if(id!==currentId){currentId=id; refresh(id);}
  });
  observer.observe(modal,{attributes:true,attributeFilter:['aria-hidden']});
  document.addEventListener('click', e=>{
    if(!e.target.closest?.('[data-edit-id]'))return;
    queueMicrotask(()=>{
      if(modal.getAttribute('aria-hidden')==='false'){
        const id=Number($('mkFormId')?.value||0);
        if(id!==currentId){currentId=id;refresh(id);}
      }
    });
  });
  $('mkcView').addEventListener('click',()=>{if(currentId)refresh(currentId);});
  $('mkcReset').addEventListener('click',async()=>{
    const id=currentId; if(!id)return;
    let data;
    try{data=await detail(id);}catch(e){note(e.message,true);return;}
    if(id!==currentId)return;
    if(!window.confirm(`Reset password ${data.nama} (${data.kode_login})? Password/PIN lama berhenti berlaku dan karyawan akan keluar dari sesi aktif.`))return;
    $('mkcReset').disabled=true; clearSecret();
    try{
      const r=await db.rpc('karyawan_credential_reset_owner',{p_karyawan_id:id});
      if(r.error||r.data?.ok!==true)throw new Error(r.data?.reason||r.error?.message||'Reset gagal.');
      if(id!==currentId||modal.getAttribute('aria-hidden')!=='false')return;
      secret=String(r.data.password_sementara_sekali||'');
      $('mkcOneTime').textContent=`Kode login: ${r.data.kode_login}\nPassword sementara: ${secret}`;
      $('mkcResult').hidden=false;
      $('mkcCode').textContent=r.data.kode_login;
      $('mkcStatus').textContent='Password sementara baru terbit';
      note('Password hanya ditampilkan kali ini. Salin dan berikan secara pribadi. Karyawan diminta mengganti password di Profil.');
    }catch(e){note(e.message,true);}
    finally{$('mkcReset').disabled=false;}
  });
  $('mkcCopy').addEventListener('click',async()=>{
    if(!secret)return;
    try{await navigator.clipboard.writeText(`Kode login: ${$('mkcCode').textContent}\nPassword sementara: ${secret}`);note('Disalin. Berikan hanya kepada karyawan yang bersangkutan.');}
    catch(_){note('Salin manual dari teks password satu kali di atas.',true);}
  });
  $('mkcClear').addEventListener('click',clearSecret);
  window.addEventListener('pagehide',clearSecret);
})();