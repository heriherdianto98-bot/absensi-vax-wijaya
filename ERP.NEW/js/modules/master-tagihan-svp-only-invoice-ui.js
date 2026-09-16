/* ERP VAX — SVP invoice UI only; leave locked engines and send/payment workflows unchanged. */
"use strict";
(() => {
  const masterRole = () => typeof MasterTagihan !== 'undefined'
    ? MasterTagihan?.role : window.MasterTagihan?.role;
  const isSvp = role => ['svp','spv'].includes(String(role || '').toLowerCase());
  const isOwnSvpInvoice = (row, userId) =>
    isSvp(row?.sender_role) && String(row?.created_by || '') === String(userId || '');
  const historyFilter = { query:'', from:'', to:'', itemNames:new Map(), pending:new Set(), loading:false };
  const normalize = value => String(value ?? '').toLocaleLowerCase('id-ID').trim();
  const archived = row => ['paid','completed'].includes(normalize(row?.status));

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
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceList .mt-invoice-buttons:has(.mt-action-svp-view) > .mt-internal-view {
        display:none!important;
      }
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
      /* Search lives only in the SVP invoice header. The date panel is deliberately compact. */
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-invoice-head {
        display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;flex-wrap:wrap;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-tools {
        display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-search {
        box-sizing:border-box;width:min(300px,55vw);height:40px;padding:0 13px;border-radius:10px;
        background:#101921;border:1px solid #456070;color:#f6fbff;font:inherit;font-size:13px;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-search::placeholder {color:#a9bac7;opacity:1}
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-search:focus-visible {outline:2px solid #7cc7e4;outline-offset:1px}
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-calendar {position:relative}
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-calendar > summary {
        list-style:none;display:flex;align-items:center;gap:6px;height:40px;box-sizing:border-box;
        padding:0 12px;border:1px solid #456070;border-radius:10px;background:#152630;
        color:#eef8ff;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-calendar > summary::-webkit-details-marker {display:none}
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-calendar[open] > summary {border-color:#78c8e5}
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-popup {
        box-sizing:border-box;position:absolute;right:0;top:46px;width:245px;max-width:calc(100vw - 35px);
        z-index:150;padding:13px;border-radius:12px;border:1px solid #456070;
        background:#151e27;box-shadow:0 16px 36px rgba(0,0,0,.65);
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-popup label {
        display:block;font-size:12px;font-weight:750;color:#e0eaf2;margin-bottom:10px;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-popup input {
        display:block;box-sizing:border-box;width:100%;height:35px;margin-top:4px;padding:4px 7px;
        font-size:12px;color:#f4f8ff;background:#24313e;border:1px solid #526579;border-radius:7px;color-scheme:dark;
      }
      body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-reset {
        width:100%;padding:8px;border-radius:8px;border:1px solid #566978;
        background:#273440;color:#f4f8ff;font-size:12px;font-weight:800;cursor:pointer;
      }
      @media(max-width:700px){body.page-master-tagihan[data-mt-invoice-role="svp"] #mtInvoiceCard .mt-svp-history-tools{margin-left:0;width:100%}}
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

  function historyMatches(row) {
    const date = String(row.invoice_date || '').slice(0,10);
    if (historyFilter.from && (!date || date < historyFilter.from)) return false;
    if (historyFilter.to && (!date || date > historyFilter.to)) return false;
    const q = normalize(historyFilter.query);
    if (!q) return true;
    const nominal = Number(row.total || 0);
    const numeric = q.replace(/[^\d]/g,'');
    const amountMatch = /^\s*(?:rp\s*)?[\d.,\s]+$/i.test(q) && numeric && String(nominal).includes(numeric);
    const haystack = normalize([row.invoice_no,row.title,row.notes,historyFilter.itemNames.get(String(row.id))].join(' '));
    return haystack.includes(q) || !!amountMatch;
  }

  /* Read-only item lookup lets a name inside an invoice line be searched too. */
  async function loadItemNames() {
    const inv = window.SvPInvoice;
    if (!historyFilter.query || historyFilter.loading || !inv?.user?.id || typeof db === 'undefined') return;
    const ids = (inv.rows || []).filter(row => archived(row) && isOwnSvpInvoice(row,inv.user.id))
      .map(row => String(row.id)).filter(id => id && !historyFilter.itemNames.has(id) && !historyFilter.pending.has(id));
    if (!ids.length) return;
    historyFilter.loading = true;
    try {
      for (let i=0;i<ids.length;i+=50) {
        const batch = ids.slice(i,i+50);
        batch.forEach(id => historyFilter.pending.add(id));
        const {data,error} = await db.from('svp_invoice_items').select('invoice_id,item_name').in('invoice_id',batch);
        if (error) throw error;
        const names = new Map(batch.map(id=>[id,[]]));
        (data || []).forEach(item=>{const id=String(item.invoice_id);if(names.has(id))names.get(id).push(item.item_name || '')});
        names.forEach((values,id)=>historyFilter.itemNames.set(id,values.join(' ')));
        batch.forEach(id => historyFilter.pending.delete(id));
      }
      if (historyFilter.query) inv.render();
    } catch (error) {
      console.warn('[SVP invoice search] Item names could not be loaded:',error);
    } finally {
      historyFilter.pending.clear();historyFilter.loading = false;
    }
  }

  function installHistorySearch(inv) {
    const head = document.querySelector('#mtInvoiceCard .mt-invoice-head');
    if (!head || head.querySelector('.mt-svp-history-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'mt-svp-history-tools';
    tools.innerHTML = `<input class="mt-svp-history-search" type="search" aria-label="Cari riwayat invoice" placeholder="Cari nomor, nama, nominal…" autocomplete="off"><details class="mt-svp-history-calendar"><summary>▦ Periode</summary><div class="mt-svp-history-popup"><label>Dari tanggal<input type="date" data-history-from aria-label="Dari tanggal invoice"></label><label>Sampai tanggal<input type="date" data-history-to aria-label="Sampai tanggal invoice"></label><button type="button" class="mt-svp-history-reset">Reset tanggal</button></div></details>`;
    (head.querySelector('.mt-invoice-actions') || head).appendChild(tools);
    const search = tools.querySelector('.mt-svp-history-search');
    let debounce;
    search.addEventListener('input',()=>{
      historyFilter.query = search.value.trim();
      clearTimeout(debounce);
      debounce = setTimeout(()=>{
        inv.historyOpen = true;
        inv.render();
        void loadItemNames();
      },180);
    });
    const from = tools.querySelector('[data-history-from]');
    const to = tools.querySelector('[data-history-to]');
    const applyDate = () => {
      historyFilter.from = from.value;
      historyFilter.to = to.value;
      inv.historyOpen = true;
      inv.render();
    };
    from.addEventListener('change',applyDate);
    to.addEventListener('change',applyDate);
    tools.querySelector('.mt-svp-history-reset').addEventListener('click',()=>{
      from.value='';to.value='';applyDate();
    });
    const calendar = tools.querySelector('.mt-svp-history-calendar');
    document.addEventListener('click',event=>{if(calendar.open && !calendar.contains(event.target))calendar.open=false});
  }

  function decorateDraftDelete() {
    const inv = window.SvPInvoice;
    if (!isSvp(masterRole()) || !isSvp(inv?.role) || !inv?.user?.id) return;
    const list = document.getElementById('mtInvoiceList');
    if (!list) return;
    list.querySelectorAll('.mt-internal-drafts .mt-invoice-row, .mt-inbox-drafts .mt-invoice-row').forEach(rowEl => {
      const actions = rowEl.querySelector('.mt-invoice-buttons');
      if (!actions || actions.querySelector('[data-svp-draft-delete]')) return;
      const candidateId = rowEl.querySelector('[data-inv-action="edit"][data-id]')?.dataset.id;
      const row = (inv.rows || []).find(x => String(x.id) === String(candidateId));
      if (!candidateId || !row || normalize(row.status) !== 'draft'
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
    if (!row || normalize(row.status) !== 'draft' || !isOwnSvpInvoice(row, inv.user.id)) return;
    if (!window.confirm(`Hapus draft invoice ${row.invoice_no || ''}?\nDraft yang dihapus tidak dapat dikembalikan.`)) return;
    button.disabled = true;
    button.textContent = 'Menghapus...';
    try {
      const {data:current,error:readError} = await db.from('svp_invoices')
        .select('id,status,sender_role,created_by').eq('id',id).maybeSingle();
      if (readError) throw readError;
      if (!current || normalize(current.status) !== 'draft'
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
        .filter(row => isOwnSvpInvoice(row, this.user?.id) && (!archived(row) || historyMatches(row)));
      try { return render.apply(this, args); }
      finally {
        this.rows = originalRows;
        labels();decorateDraftDelete();
        if (historyFilter.query || historyFilter.from || historyFilter.to) {
          const list = document.querySelector('#mtInvoiceList .mt-invoice-history-list');
          if (list && !list.querySelector('.mt-invoice-row')) {
            const empty = list.querySelector('.mt-internal-empty');
            if (empty) empty.textContent = 'Tidak ada riwayat invoice yang cocok dengan pencarian / tanggal.';
          }
        }
      }
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
    installHistorySearch(invoice);
    invoice.render();
    labels();
    decorateDraftDelete();
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => { if (install() || ++attempts > 180) clearInterval(timer); }, 100);
  window.addEventListener('load', () => setTimeout(install, 500));
})();
