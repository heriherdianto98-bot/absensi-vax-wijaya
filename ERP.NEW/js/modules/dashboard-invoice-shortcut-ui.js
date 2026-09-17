/* ERP VAX — dashboard-only invoice shortcut. Reuse existing Master Tagihan invoice workflow.
 * UI integration only: no changes to invoice, finance, auth, or database engines.
 */
'use strict';
(() => {
  if (!/\/erp-dashboard\.html$/i.test(location.pathname) || window.__vaxDashboardInvoiceShortcut) return;
  window.__vaxDashboardInvoiceShortcut = true;
  const ROLE_SET = new Set(['spv','svp']);
  let overlay = null, frame = null, busy = false, priorFocus = null;

  function style() {
    if (document.getElementById('vaxDashboardInvoiceShortcutStyle')) return;
    const el = document.createElement('style');
    el.id = 'vaxDashboardInvoiceShortcutStyle';
    el.textContent = `
      .erp-header-vax #vaxInvoiceQuickBtn{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 44px!important;width:44px!important;height:42px!important;min-width:44px!important;padding:0!important;margin:0 9px!important;border:1px solid rgba(218,174,71,.5)!important;border-radius:11px!important;background:linear-gradient(160deg,#27323b,#151d25)!important;color:#f8d47d!important;font:900 12px/1 'Source Sans 3',sans-serif!important;letter-spacing:.04em!important;cursor:pointer!important}
      .erp-header-vax #vaxInvoiceQuickBtn:hover{border-color:#e5bc59!important;box-shadow:0 0 14px rgba(219,167,56,.24)!important}
      .erp-header-vax #vaxInvoiceQuickBtn:focus-visible{outline:2px solid #f5d36b!important;outline-offset:2px!important}
      #vaxInvoiceQuickOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,10,.83);backdrop-filter:blur(5px);display:grid;place-items:center}
      #vaxInvoiceQuickOverlay[hidden]{display:none!important}
      #vaxInvoiceQuickOverlay .vax-inv-frame{width:100%;height:100%;border:0;background:transparent;display:block}
      #vaxInvoiceQuickOverlay .vax-inv-loading{position:absolute;inset:0;display:grid;place-items:center;color:#f8d47d;font-size:15px;font-weight:800;pointer-events:none}
      #vaxInvoiceQuickOverlay .vax-inv-close{position:fixed;right:16px;top:13px;z-index:3;width:38px;height:38px;border:1px solid #50606e;border-radius:9px;background:#1b2630;color:#fff;font-size:24px;cursor:pointer}
      #vaxInvoiceQuickOverlay .vax-inv-close:focus-visible{outline:2px solid #f8d47d}
      @media(max-width:700px){#vaxInvoiceQuickOverlay .vax-inv-close{right:7px;top:5px;width:32px;height:32px}}
    `;
    document.head.appendChild(el);
  }

  // connector.js declares `const db`, not `window.db`. A previous window.db check
  // prevented the shortcut from ever mounting despite a valid SVP session.
  async function authorized() {
    if (typeof db === 'undefined' || !db?.auth?.getSession) return false;
    const {data,error} = await db.auth.getSession();
    const uid = data?.session?.user?.id;
    if (error || !uid) return false;
    const profile = window.OwnerAuth?.profile;
    if (profile && String(profile.id) === String(uid))
      return profile.aktif !== false && ROLE_SET.has(String(profile.role || '').toLowerCase());
    const result = await db.from('profiles').select('role,aktif').eq('id',uid).maybeSingle();
    return !result.error && result.data?.aktif !== false && ROLE_SET.has(String(result.data?.role || '').toLowerCase());
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    frame?.remove(); frame = null; busy = false;
    document.body.style.removeProperty('overflow');
    priorFocus?.focus?.();
  }
  function showError(message) {
    if (!overlay || overlay.hidden) return;
    const loading = overlay.querySelector('.vax-inv-loading');
    if (loading) { loading.style.pointerEvents = 'auto'; loading.textContent = message; }
    busy = false;
  }
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'vaxInvoiceQuickOverlay'; overlay.hidden = true;
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Buat Invoice Owner');
    overlay.innerHTML = '<div class="vax-inv-loading" role="status">Memuat formulir invoice…</div><button type="button" class="vax-inv-close" aria-label="Tutup invoice">×</button>';
    overlay.querySelector('.vax-inv-close').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)close()});
    document.body.appendChild(overlay);
    return overlay;
  }
  function open() {
    if (busy) return;
    busy = true; priorFocus = document.activeElement; ensureOverlay();
    overlay.hidden = false; document.body.style.overflow = 'hidden';
    const loading = overlay.querySelector('.vax-inv-loading');
    loading.textContent = 'Memuat formulir invoice…'; loading.style.pointerEvents = 'none';
    const currentFrame = document.createElement('iframe');
    frame = currentFrame; frame.className = 'vax-inv-frame';
    frame.title = 'Formulir Buat Invoice Owner';
    frame.src = './master-tagihan.html?quickInvoice=1';
    frame.addEventListener('load',()=>{
      let tries = 0;
      const poll = setInterval(async()=>{
        if(frame!==currentFrame || overlay.hidden){clearInterval(poll);return}
        try {
          const win = currentFrame.contentWindow;
          const doc = win?.document;
          const invoice = win?.SvPInvoice;
          const master = win?.MasterTagihan;
          if(!doc || !invoice?.__workflowV2 || !invoice.user || !master?.role){
            if(++tries>=200){clearInterval(poll);showError('Formulir belum siap. Tutup dan coba lagi.')}
            return;
          }
          if(!ROLE_SET.has(String(master.role).toLowerCase()) || !ROLE_SET.has(String(invoice.role).toLowerCase())){
            clearInterval(poll);showError('Akses Buat Invoice Owner hanya untuk SVP.');return;
          }
          const modal = doc.getElementById('mtInvoiceModal');
          if(!modal || typeof invoice.open!=='function'){
            if(++tries>=200){clearInterval(poll);showError('Formulir invoice tidak tersedia.')}
            return;
          }
          clearInterval(poll);
          const css=doc.createElement('style');
          css.textContent='html,body{background:transparent!important;overflow:hidden!important}body>.erp-wrapper,body>#sidebar,body>.erp-bottom-nav,body>#footer,body>#mtModal{display:none!important}#mtInvoiceModal .mt-invoice-backdrop{background:transparent!important;backdrop-filter:none!important}#mtInvoiceModal .mt-invoice-dialog{max-height:calc(100vh - 34px)!important}';
          doc.head.appendChild(css);
          await invoice.open();
          if(frame!==currentFrame || overlay.hidden)return;
          const watch=new win.MutationObserver(()=>{if(modal.hidden){watch.disconnect();close()}});
          watch.observe(modal,{attributes:true,attributeFilter:['hidden']});
          doc.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
          loading.textContent='';busy=false;
        }catch(error){clearInterval(poll);console.warn('[Dashboard INV]',error);showError('Formulir gagal dimuat. Tutup dan coba lagi.')}
      },100);
    });
    overlay.insertBefore(frame,overlay.querySelector('.vax-inv-close'));
  }
  async function mount() {
    if(document.getElementById('vaxInvoiceQuickBtn'))return true;
    const header=document.querySelector('#header .erp-header-vax');
    if(!header || typeof db==='undefined')return false;
    if(!await authorized())return false;
    if(document.getElementById('vaxInvoiceQuickBtn'))return true;
    style();
    const button=document.createElement('button');button.type='button';button.id='vaxInvoiceQuickBtn';
    button.textContent='INV';button.title='Buat Invoice Owner';button.setAttribute('aria-label','Buat Invoice Owner');
    button.addEventListener('click',open);
    const help=[...header.querySelectorAll('a,button')].find(el=>/help\s*desk/i.test(el.textContent||''));
    const headerChild=help && [...header.children].find(child=>child===help || child.contains(help));
    if(headerChild)headerChild.insertAdjacentElement('afterend',button);
    else if(header.querySelector('.vax-owner'))header.insertBefore(button,header.querySelector('.vax-owner'));
    else header.appendChild(button);
    return true;
  }
  let tries=0, inFlight=false;
  const timer=setInterval(()=>{
    if(inFlight)return;
    inFlight=true;
    mount().then(ok=>{if(ok||++tries>180)clearInterval(timer)})
      .catch(error=>{if(++tries>180)clearInterval(timer);console.warn('[Dashboard INV] Mount:',error)})
      .finally(()=>{inFlight=false});
  },300);
  document.addEventListener('erp:components-ready',()=>mount().catch(console.warn),{once:true});
})();