/* ERP VAX — dashboard-only INV shortcut. Reuses authenticated invoice form in an isolated iframe.
 * UI integration only; no changes to invoice, finance, auth engines or database.
 */
'use strict';
(() => {
  if (!/\/erp-dashboard\.html$/i.test(location.pathname) || window.__vaxDashboardInvoiceShortcut) return;
  window.__vaxDashboardInvoiceShortcut = true;
  const ROLES = new Set(['svp','spv']);
  const state = {busy:false, overlay:null, frame:null, previousFocus:null, previousOverflow:null, request:0, userId:null};
  const role = v => String(v || '').trim().toLowerCase();
  const client = () => (typeof db !== 'undefined' ? db : window.db);

  function style() {
    if (document.getElementById('vaxDashboardInvoiceShortcutStyle')) return;
    const s = document.createElement('style');
    s.id = 'vaxDashboardInvoiceShortcutStyle';
    s.textContent = `
      #vaxInvoiceQuickBtn{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 44px!important;width:44px!important;height:42px!important;margin:0 8px!important;padding:0!important;border:1px solid rgba(218,174,71,.48)!important;border-radius:11px!important;background:linear-gradient(160deg,#25313b,#151d25)!important;color:#f8d47d!important;font:900 12px/1 'Source Sans 3',sans-serif!important;cursor:pointer!important}
      #vaxInvoiceQuickBtn:hover{border-color:#e5bc59!important;box-shadow:0 0 14px rgba(219,167,56,.22)!important}
      #vaxInvoiceQuickBtn:focus-visible{outline:2px solid #f5d36b!important;outline-offset:2px!important}
      #vaxInvoiceQuickOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,10,.82);backdrop-filter:blur(5px)}
      #vaxInvoiceQuickOverlay[hidden]{display:none!important}
      #vaxInvoiceQuickOverlay .vax-inv-frame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:transparent}
      #vaxInvoiceQuickOverlay .vax-inv-loading{position:absolute;inset:0;z-index:2;display:grid;place-items:center;padding:32px;text-align:center;color:#f8d47d;font:800 15px/1.5 'Source Sans 3',sans-serif;pointer-events:none}
      #vaxInvoiceQuickOverlay .vax-inv-loading[hidden]{display:none!important}
      #vaxInvoiceQuickOverlay .vax-inv-close{position:fixed;right:12px;top:12px;z-index:3;width:40px;height:40px;border:1px solid #50606e;border-radius:10px;background:#1b2630;color:#fff;font-size:24px;cursor:pointer}
      @media(max-width:700px){#vaxInvoiceQuickOverlay .vax-inv-close{right:6px;top:6px;width:34px;height:34px}}
    `;
    document.head.appendChild(s);
  }

  async function authorized() {
    const auth = client();
    if (!auth?.auth?.getSession || !auth?.from) return false;
    const {data, error} = await auth.auth.getSession();
    if (error || !data?.session?.user?.id) return false;
    const {data:profile,error:profileError} = await auth.from('profiles').select('role,aktif').eq('id',data.session.user.id).maybeSingle();
    if (profileError || !profile || profile.aktif === false || !ROLES.has(role(profile.role))) return false;
    state.userId = String(data.session.user.id);
    return true;
  }

  function close() {
    state.request++;
    if (!state.overlay) return;
    state.overlay.hidden = true;
    state.frame?.remove();
    state.frame = null;
    state.busy = false;
    document.body.style.overflow = state.previousOverflow ?? '';
    state.previousFocus?.focus?.();
  }

  function ensureOverlay() {
    if (state.overlay) return state.overlay;
    style();
    const root = document.createElement('div');
    root.id = 'vaxInvoiceQuickOverlay';
    root.hidden = true;
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','Buat Invoice Owner');
    root.innerHTML = '<div class="vax-inv-loading" role="status">Memuat formulir invoice…</div><button type="button" class="vax-inv-close" aria-label="Tutup invoice">×</button>';
    root.querySelector('.vax-inv-close').addEventListener('click',close);
    root.addEventListener('click',e => {if(e.target === root) close();});
    document.addEventListener('keydown',e => {if(e.key === 'Escape' && !root.hidden) close();});
    document.body.appendChild(root);
    state.overlay = root;
    return root;
  }

  function error(message, request) {
    if (request !== state.request || !state.overlay || state.overlay.hidden) return;
    state.frame?.remove();
    state.frame = null;
    state.busy = false;
    const label = state.overlay.querySelector('.vax-inv-loading');
    label.hidden = false;
    label.textContent = message + ' Tutup dengan tombol ×.';
  }

  async function open() {
    if (state.busy || (state.overlay && !state.overlay.hidden)) return;
    state.busy = true;
    const request = ++state.request;
    state.previousFocus = document.activeElement;
    state.previousOverflow = document.body.style.overflow;
    const root = ensureOverlay();
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    const label = root.querySelector('.vax-inv-loading');
    label.hidden = false;
    label.textContent = 'Memuat formulir invoice…';
    try {
      if (!await authorized()) { error('Sesi SVP tidak valid. Silakan login sebagai SVP.',request); return; }
      if (request !== state.request) return;
      const expectedUserId = state.userId;
      const frame = document.createElement('iframe');
      state.frame = frame;
      frame.className = 'vax-inv-frame';
      frame.title = 'Formulir Buat Invoice Owner';
      frame.style.visibility = 'hidden';
      frame.addEventListener('load', () => {
        const started = Date.now();
        let checking = false;
        const poll = setInterval(async () => {
          if (request !== state.request || state.frame !== frame || root.hidden) {clearInterval(poll);return;}
          if (checking) return;
          if (Date.now() - started > 25000) {clearInterval(poll);error('Formulir invoice tidak siap. Coba buka kembali.',request);return;}
          checking = true;
          try {
            const win = frame.contentWindow;
            const doc = win?.document;
            const inv = win?.SvPInvoice;
            const mt = win?.MasterTagihan;
            /* Both modules initialize asynchronously. __workflowV2 appears before
             * SvPInvoice.init finishes loading its role, and the SVP delivery
             * wrapper installs later still. Never reject a valid SVP mid-boot. */
            if (!doc || !inv?.user?.id || !mt?.user?.id || !role(inv.role) || !role(mt.role)
                || !inv.__workflowV2 || !inv.__svpOwnerReturnInstalled
                || !inv.__newAndDeliveryFixInstalled || doc.body.dataset.mtInvoiceRole !== 'svp') return;
            if (!ROLES.has(role(mt.role)) || !ROLES.has(role(inv.role))
                || String(inv.user.id) !== expectedUserId || String(mt.user.id) !== expectedUserId) {
              clearInterval(poll);
              error('Sesi invoice berbeda dengan sesi SVP. Tutup, muat ulang Dashboard, lalu coba lagi.',request);
              return;
            }
            const modal = doc.getElementById('mtInvoiceModal');
            if (!modal || typeof inv.open !== 'function') return;
            clearInterval(poll);
            const css = doc.createElement('style');
            css.textContent = 'html,body{background:transparent!important;overflow:hidden!important}body>.erp-wrapper,body>#sidebar,body>.erp-bottom-nav,body>#footer,body>#mtModal{visibility:hidden!important;pointer-events:none!important}body>#mtInvoiceModal{visibility:visible!important;pointer-events:auto!important}#mtInvoiceModal .mt-invoice-backdrop{background:transparent!important;backdrop-filter:none!important}#mtInvoiceModal .mt-invoice-dialog{max-height:calc(100vh - 34px)!important}';
            doc.head.appendChild(css);
            await inv.open(null);
            if (request !== state.request || root.hidden || state.frame !== frame) return;
            if (modal.hidden) {error('Formulir invoice tidak terbuka.',request);return;}
            frame.style.visibility = 'visible';
            label.hidden = true;
            state.busy = false;
            const watch = new win.MutationObserver(() => {if(modal.hidden){watch.disconnect();close();}});
            watch.observe(modal,{attributes:true,attributeFilter:['hidden']});
            doc.addEventListener('keydown',e => {if(e.key === 'Escape') close();});
          } catch(e) {
            clearInterval(poll);
            console.warn('[Dashboard INV]',e);
            error('Formulir invoice gagal dimuat.',request);
          } finally {checking = false;}
        },100);
      },{once:true});
      root.insertBefore(frame,root.querySelector('.vax-inv-loading'));
      frame.src = './master-tagihan.html?quickInvoice=1';
    } catch(e) {
      console.warn('[Dashboard INV]',e);
      error('Gagal memeriksa sesi invoice.',request);
    }
  }

  async function mount() {
    if (document.getElementById('vaxInvoiceQuickBtn')) return true;
    const header = document.querySelector('#header .erp-header-vax,#header .top-header,#header .erp-header');
    if (!header || !client()?.auth?.getSession) return false;
    if (!await authorized()) return false;
    if (document.getElementById('vaxInvoiceQuickBtn')) return true;
    style();
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'vaxInvoiceQuickBtn';
    button.textContent = 'INV';
    button.title = 'Buat Invoice Owner';
    button.setAttribute('aria-label','Buat Invoice Owner');
    button.addEventListener('click',open);
    const help = [...header.querySelectorAll('a,button')].find(el => /help\s*desk/i.test(el.textContent || ''));
    const owner = header.querySelector('.vax-owner');
    if (help) help.insertAdjacentElement('afterend',button);
    else if (owner) owner.insertAdjacentElement('beforebegin',button);
    else header.appendChild(button);
    return true;
  }
  let tries = 0, pending = false;
  const timer = setInterval(() => {
    if (pending) return;
    pending = true;
    mount().then(ok => {if (ok || ++tries > 100) clearInterval(timer);})
      .catch(e => {console.warn('[Dashboard INV mount]',e);if (++tries > 100) clearInterval(timer);})
      .finally(() => {pending = false;});
  },300);
})();