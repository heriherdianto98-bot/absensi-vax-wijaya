/* ERP VAX — dashboard-only invoice shortcut. Reuses the existing Master Tagihan
 * invoice form in a same-origin iframe; no invoice/finance engine or DB writes here.
 */
'use strict';
(() => {
  if (!/\/erp-dashboard\.html$/i.test(location.pathname) || window.__vaxDashboardInvoiceShortcut) return;
  window.__vaxDashboardInvoiceShortcut = true;
  const STYLE_ID = 'vaxDashboardInvoiceShortcutStyle';
  const ROLE_SET = new Set(['spv', 'svp']);
  let busy = false;
  let overlay = null;
  let frame = null;
  let priorFocus = null;

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
      .erp-header-vax #vaxInvoiceQuickBtn{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;width:44px!important;height:42px!important;padding:0!important;margin:0 8px 0 0!important;border:1px solid rgba(218,174,71,.45)!important;border-radius:11px!important;background:linear-gradient(160deg,#25313b,#151d25)!important;color:#f8d47d!important;font:900 12px/1 'Source Sans 3',sans-serif!important;letter-spacing:.025em!important;cursor:pointer!important}
      .erp-header-vax #vaxInvoiceQuickBtn:hover{border-color:#e5bc59!important;box-shadow:0 0 14px rgba(219,167,56,.2)!important}
      .erp-header-vax #vaxInvoiceQuickBtn:focus-visible{outline:2px solid #f5d36b!important;outline-offset:2px!important}
      #vaxInvoiceQuickOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,10,.82);backdrop-filter:blur(5px);display:grid;place-items:center}
      #vaxInvoiceQuickOverlay[hidden]{display:none!important}
      #vaxInvoiceQuickOverlay .vax-inv-frame{width:100%;height:100%;border:0;background:transparent;display:block}
      #vaxInvoiceQuickOverlay .vax-inv-loading{position:absolute;inset:0;display:grid;place-items:center;color:#f8d47d;font-size:15px;font-weight:800;pointer-events:none}
      #vaxInvoiceQuickOverlay .vax-inv-close{position:fixed;right:16px;top:13px;z-index:3;width:38px;height:38px;border:1px solid #50606e;border-radius:9px;background:#1b2630;color:#fff;font-size:24px;cursor:pointer}
      #vaxInvoiceQuickOverlay .vax-inv-close:focus-visible{outline:2px solid #f8d47d}
      @media(max-width:700px){#vaxInvoiceQuickOverlay .vax-inv-close{right:7px;top:5px;width:32px;height:32px}}
    `;
    document.head.appendChild(el);
  }

  async function isAuthorized() {
    const db = window.db;
    if (!db?.auth?.getSession || !db?.from) return false;
    const {data, error} = await db.auth.getSession();
    if (error || !data?.session?.user?.id) return false;
    const {data:profile, error:profileError} = await db.from('profiles').select('role,aktif').eq('id', data.session.user.id).maybeSingle();
    if (profileError || !profile || profile.aktif === false) return false;
    return ROLE_SET.has(String(profile.role || '').toLowerCase());
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    frame?.remove();
    frame = null;
    busy = false;
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
    overlay.id = 'vaxInvoiceQuickOverlay';
    overlay.hidden = true;
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Buat Invoice Owner');
    overlay.innerHTML = '<div class="vax-inv-loading" role="status">Memuat formulir invoice…</div><button type="button" class="vax-inv-close" aria-label="Tutup invoice">×</button>';
    overlay.querySelector('.vax-inv-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) close(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  async function open() {
    if (busy) return;
    busy = true;
    priorFocus = document.activeElement;
    ensureOverlay();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    const loading = overlay.querySelector('.vax-inv-loading');
    loading.textContent = 'Memuat formulir invoice…';
    loading.style.pointerEvents = 'none';
    // The invoice page uses the existing authenticated workflow and save/print handlers.
    frame = document.createElement('iframe');
    frame.className = 'vax-inv-frame';
    frame.title = 'Formulir Buat Invoice Owner';
    frame.src = './master-tagihan.html?quickInvoice=1';
    frame.addEventListener('load', () => {
      const currentFrame = frame;
      if (!currentFrame || overlay.hidden) return;
      let tries = 0;
      const poll = setInterval(async () => {
        if (frame !== currentFrame || overlay.hidden) { clearInterval(poll); return; }
        try {
          const win = currentFrame.contentWindow;
          const doc = win?.document;
          const invoice = win?.SvPInvoice;
          const mt = win?.MasterTagihan;
          if (!doc || !invoice || !mt || !invoice.__workflowV2 || !invoice.user || !mt.role) {
            if (++tries >= 200) { clearInterval(poll); showError('Formulir belum siap. Tutup dan coba lagi.'); }
            return;
          }
          if (!ROLE_SET.has(String(mt.role).toLowerCase()) || !ROLE_SET.has(String(invoice.role).toLowerCase())) {
            clearInterval(poll); showError('Akses Buat Invoice Owner hanya untuk SVP.'); return;
          }
          const modal = doc.getElementById('mtInvoiceModal');
          if (!modal || typeof invoice.open !== 'function') { if (++tries >= 200) { clearInterval(poll); showError('Formulir invoice tidak tersedia.'); } return; }
          clearInterval(poll);
          const css = doc.createElement('style');
          css.textContent = 'html,body{background:transparent!important;overflow:hidden!important}body>.erp-wrapper,body>#sidebar,body>.erp-bottom-nav,body>#footer,body>#mtModal{display:none!important}#mtInvoiceModal .mt-invoice-backdrop{background:transparent!important;backdrop-filter:none!important}#mtInvoiceModal .mt-invoice-dialog{max-height:calc(100vh - 34px)!important}';
          doc.head.appendChild(css);
          await invoice.open();
          if (frame !== currentFrame || overlay.hidden) return;
          const watch = new win.MutationObserver(() => { if (modal.hidden) { watch.disconnect(); close(); } });
          watch.observe(modal, {attributes:true,attributeFilter:['hidden']});
          doc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
          loading.textContent = '';
          busy = false;
        } catch (error) {
          clearInterval(poll);
          console.warn('[Dashboard INV]', error);
          showError('Formulir gagal dimuat. Tutup dan coba lagi.');
        }
      }, 100);
    });
    overlay.insertBefore(frame, overlay.querySelector('.vax-inv-close'));
  }

  async function mount() {
    if (document.getElementById('vaxInvoiceQuickBtn')) return true;
    const header = document.querySelector('.erp-header-vax,.top-header,.erp-header');
    if (!header || !window.db) return false;
    if (!await isAuthorized()) return false;
    if (document.getElementById('vaxInvoiceQuickBtn')) return true;
    styles();
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'vaxInvoiceQuickBtn';
    button.textContent = 'INV';
    button.title = 'Buat Invoice Owner';
    button.setAttribute('aria-label', 'Buat Invoice Owner');
    button.addEventListener('click', open);
    const help = [...header.querySelectorAll('a,button')].find(el => /help\s*desk/i.test(el.textContent || ''));
    const owner = header.querySelector('.vax-owner');
    if (help && help.parentElement === header) help.insertAdjacentElement('afterend', button);
    else if (owner) header.insertBefore(button, owner);
    else header.appendChild(button);
    return true;
  }
  let tries = 0;
  const timer = setInterval(() => { mount().then(ok => { if (ok || ++tries > 90) clearInterval(timer); }).catch(() => { if (++tries > 90) clearInterval(timer); }); }, 300);
})();