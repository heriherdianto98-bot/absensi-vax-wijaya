/* ERP VAX — SVP invoice presentation only; no changes to locked engines or send/payment workflows. */
"use strict";
(() => {
  /* MasterTagihan is declared with top-level const, not necessarily on window. */
  const masterRole = () => typeof MasterTagihan !== 'undefined'
    ? MasterTagihan?.role : window.MasterTagihan?.role;
  const isSvp = role => ['svp','spv'].includes(String(role || '').toLowerCase());
  const isOwnSvpInvoice = (row, userId) =>
    isSvp(row?.sender_role) && String(row?.created_by || '') === String(userId || '');

  function ensureInvoiceHeadingStyle() {
    if (document.getElementById('mtSvpInvoiceHeadingTypography')) return;
    const style = document.createElement('style');
    style.id = 'mtSvpInvoiceHeadingTypography';
    style.textContent = `
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-invoice-head strong {
        font-size:21px!important;line-height:1.25!important;font-weight:900!important;letter-spacing:.015em;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-invoice-head small {
        font-size:14px!important;line-height:1.5!important;margin-top:7px!important;color:#c0ccd7!important;
      }
      /* Hide only the redundant Lihat link when the same row has the eye action. */
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-invoice-buttons:has(.mt-action-svp-view) > .mt-internal-view {
        display:none!important;
      }
      /* Draft accordion only: red panel and a proper heading, including the zero-draft state. */
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-internal-drafts,
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-inbox-drafts {
        background:#271417!important;border-top:1px solid #a84750!important;border-bottom:1px solid #a84750!important;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-internal-drafts > summary,
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-inbox-drafts > summary {
        background:#60252e!important;color:#fff4f4!important;border:0!important;
        font-size:18px!important;font-weight:900!important;line-height:1.35!important;
        padding:15px 19px!important;letter-spacing:.005em!important;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-internal-drafts > summary:hover,
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-inbox-drafts > summary:hover {
        background:#74303a!important;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-internal-drafts > summary::after,
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-inbox-drafts > summary::after {
        color:#ffe3e3!important;font-size:19px!important;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-internal-drafts > .mt-internal-empty,
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-inbox-drafts > .mt-invoice-empty {
        color:#ffe2e2!important;background:#271417!important;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-svp-delete-draft {
        border:1px solid #b85b5b!important;background:#392026!important;color:#ffdddd!important;
        border-radius:9px!important;font-weight:850!important;min-height:36px;padding:7px 11px!important;
        cursor:pointer;white-space:nowrap;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-svp-delete-draft:hover {
        background:#58282c!important;border-color:#ed8b8b!important;color:#fff!important;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-svp-delete-draft:disabled {
        opacity:.55!important;cursor:wait!important;
      }
    `;
    document.head.appendChild(style);
  }

  function labels() {
    if (!isSvp(masterRole()) || !isSvp(window.SvPInvoice?.role)) return;
    const head = document.querySelector('#mtInvoiceCard .mt-invoice-head strong');
    if (head) head.textContent = 'INVOICE SVP → OWNER';
    document.querySelectorAll('#mtInvoiceList .mt-internal-active > strong, #mtInvoiceList .mt-inbox-active > strong')
      .forEach(el => { el.textContent = 'INVOICE AKTIF · SVP → OWNER'; });
    const button = document.querySelector('.mt-invoice-top-btn');
    if (button) {
      button.hidden = false;
      button.innerHTML = '<span aria-hidden="true">▤</span> Buat Invoice Owner';
    }
  }

  function decorateDraftDelete() {
    const inv = window.SvPInvoice;
    if (!isSvp(masterRole()) || !isSvp(inv?.role) || !inv?.user?.id) return;
    const list = document.getElementById('mtInvoiceList');
    if (!list) return;
    /* Do not add delete to active, sent, completed, paid, or history rows. */
    list.querySelectorAll('.mt-internal-drafts .mt-invoice-row, .mt-inbox-drafts .mt-invoice-row').forEach(rowEl => {
      const actions = rowEl.querySelector('.mt-invoice-buttons');
      if (!actions || actions.querySelector('[data-svp-draft-delete]')) return;
      const candidateId = rowEl.querySelector('[data-inv-action="edit"][data-id]')?.dataset.id;
      const row = (inv.rows || []).find(x => String(x.id) === String(candidateId));
      if (!candidateId || !row || String(row.status || '').toLowerCase() !== 'draft'
          || !isOwnSvpInvoice(row, inv.user.id)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mt-action mt-svp-delete-draft';
      button.dataset.svpDraftDelete = candidateId;
      button.textContent = 'Hapus';
      button.setAttribute('aria-label', `Hapus draft invoice ${row.invoice_no || ''}`);
      actions.appendChild(button);
    });
  }

  async function deleteDraft(button) {
    const inv = window.SvPInvoice;
    const id = button.dataset.svpDraftDelete;
    if (!isSvp(masterRole()) || !isSvp(inv?.role) || !inv?.user?.id || !id || button.disabled) return;
    const row = (inv.rows || []).find(x => String(x.id) === String(id));
    if (!row || String(row.status || '').toLowerCase() !== 'draft'
        || !isOwnSvpInvoice(row, inv.user.id)) return;
    if (!window.confirm(`Hapus draft invoice ${row.invoice_no || ''}?\nDraft yang dihapus tidak dapat dikembalikan.`)) return;
    button.disabled = true;
    button.textContent = 'Menghapus...';
    try {
      /* Revalidate on the database, then condition DELETE on owner and draft status.
         Parent delete is attempted first: if FK/RLS blocks it, leave item records intact. */
      const {data:current,error:readError} = await db.from('svp_invoices')
        .select('id,status,sender_role,created_by').eq('id',id).maybeSingle();
      if (readError) throw readError;
      if (!current || String(current.status || '').toLowerCase() !== 'draft'
          || !isOwnSvpInvoice(current, inv.user.id)) throw new Error('Draft tidak tersedia atau statusnya sudah berubah.');
      const {data:deleted,error:deleteError} = await db.from('svp_invoices')
        .delete().eq('id',id).eq('status','draft')
        .eq('created_by',inv.user.id).in('sender_role',['svp','spv'])
        .select('id');
      if (deleteError) throw deleteError;
      if (!deleted?.length) throw new Error('Draft tidak terhapus. Periksa izin atau status invoice.');
      await inv.reload();
    } catch (error) {
      window.alert(`Gagal menghapus draft: ${error?.message || String(error)}`);
      button.disabled = false;
      button.textContent = 'Hapus';
    }
  }

  function install() {
    const invoice = window.SvPInvoice;
    if (!isSvp(masterRole()) || !invoice || !isSvp(invoice.role)
        || !invoice.user?.id || !invoice.__svpOwnerReturnInstalled || !invoice.__readCompleteInstalled) return false;
    if (invoice.__svpOnlyInvoiceUiInstalled) return true;
    invoice.__svpOnlyInvoiceUiInstalled = true;
    ensureInvoiceHeadingStyle();
    const render = invoice.render;
    invoice.render = function (...args) {
      if (!isSvp(this.role)) return render.apply(this, args);
      const originalRows = this.rows;
      this.rows = (Array.isArray(originalRows) ? originalRows : [])
        .filter(row => isOwnSvpInvoice(row, this.user?.id));
      try { return render.apply(this, args); }
      finally { this.rows = originalRows; labels(); decorateDraftDelete(); }
    };
    const list = document.getElementById('mtInvoiceList');
    if (list) {
      list.addEventListener('click', event => {
        const button = event.target.closest('[data-svp-draft-delete]');
        if (!button || !list.contains(button)) return;
        event.preventDefault();event.stopPropagation();
        void deleteDraft(button);
      }, true);
      new MutationObserver(decorateDraftDelete).observe(list,{childList:true,subtree:true});
    }
    invoice.render();
    labels();
    decorateDraftDelete();
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => { if (install() || ++attempts > 180) clearInterval(timer); }, 100);
  window.addEventListener('load', () => setTimeout(install, 500));
})();
