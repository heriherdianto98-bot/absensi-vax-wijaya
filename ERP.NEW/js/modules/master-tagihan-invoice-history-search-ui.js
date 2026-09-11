/* ERP VAX — UI ONLY: compact invoice history + dedicated keyword search.
   Shows 3 history rows by default; the rest stay behind a show-more control.
   Invoice search is intentionally separate from Master Tagihan search.
*/
"use strict";
(() => {
  const LIMIT = 3;
  const STYLE_ID = "invoiceHistorySearchUiStyle";
  let expanded = false;
  let applying = false;
  let query = "";

  const norm = v => String(v || "").toLowerCase().trim();

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      #mtInvoiceCard .mt-invoice-history-toggle{position:relative;padding-right:112px}
      #mtInvoiceCard .mt-invoice-history-search-ui{
        position:absolute;right:46px;top:50%;transform:translateY(-50%);
        display:flex;align-items:center;justify-content:flex-end;gap:6px;z-index:4;
      }
      #mtInvoiceCard .mt-invoice-history-search-btn{
        width:34px;height:34px;border-radius:10px;border:1px solid #2f6178;
        background:linear-gradient(180deg,#153246,#0e2432);color:#72d8ff;
        display:grid;place-items:center;cursor:pointer;font-size:16px;font-weight:900;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 3px 10px rgba(0,0,0,.22);
      }
      #mtInvoiceCard .mt-invoice-history-search-btn:hover{border-color:#58bce5;background:linear-gradient(180deg,#1b435b,#123044)}
      #mtInvoiceCard .mt-invoice-history-search-input{
        width:0;opacity:0;pointer-events:none;height:34px;padding:0;border-radius:10px;
        border:1px solid transparent;background:#0d1821;color:#e8f7ff;outline:none;
        transition:width .18s ease,opacity .16s ease,padding .18s ease,border-color .18s ease;
        font:700 11px/1.2 "Source Sans 3",sans-serif;
      }
      #mtInvoiceCard .mt-invoice-history-search-ui.is-open .mt-invoice-history-search-input{
        width:230px;opacity:1;pointer-events:auto;padding:0 11px;border-color:#315d72;
      }
      #mtInvoiceCard .mt-invoice-history-search-input::placeholder{color:#7891a0;font-weight:600}
      #mtInvoiceCard .mt-invoice-history-search-clear{
        display:none;width:28px;height:28px;border:0;background:transparent;color:#91a8b4;
        cursor:pointer;font-size:17px;line-height:1
      }
      #mtInvoiceCard .mt-invoice-history-search-ui.has-query .mt-invoice-history-search-clear{display:grid;place-items:center}
      #mtInvoiceCard .mt-invoice-history-more-ui{
        display:block;margin:10px auto 2px;padding:7px 14px;border-radius:9px;
        border:1px solid #315569;background:#101b24;color:#b9d8e8;font-weight:800;
        font-size:11px;cursor:pointer
      }
      @media(max-width:900px){
        #mtInvoiceCard .mt-invoice-history-toggle{padding-right:92px}
        #mtInvoiceCard .mt-invoice-history-search-ui.is-open{
          position:absolute;left:12px;right:42px;top:100%;transform:none;padding:7px 0;
          background:#0d1821;border-bottom:1px solid #243945
        }
        #mtInvoiceCard .mt-invoice-history-search-ui.is-open .mt-invoice-history-search-input{width:100%}
      }
    `;
    document.head.appendChild(s);
  }

  function historyParts(){
    const root = document.getElementById("mtInvoiceList");
    const history = root?.querySelector(".mt-invoice-history");
    const list = history?.querySelector(".mt-invoice-history-list");
    const rows = list ? [...list.querySelectorAll(":scope > .mt-invoice-row")] : [];
    return { root, history, list, rows };
  }

  function ensureMoreButton(list){
    if(!list) return null;
    let btn = list.querySelector("[data-invoice-history-more]");
    if(btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.invoiceHistoryMore = "1";
    btn.className = "mt-invoice-history-more-ui";
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      expanded = !expanded;
      apply();
    });
    list.appendChild(btn);
    return btn;
  }

  function ensureSearchUi(history){
    if(!history) return null;
    const toggle = history.querySelector("[data-history-toggle],.mt-invoice-history-toggle");
    if(!toggle) return null;
    let shell = toggle.querySelector(".mt-invoice-history-search-ui");
    if(shell) return shell;

    shell = document.createElement("span");
    shell.className = "mt-invoice-history-search-ui";
    shell.innerHTML = `
      <button type="button" class="mt-invoice-history-search-btn" data-invoice-search-toggle title="Cari riwayat invoice" aria-label="Cari riwayat invoice">⌕</button>
      <input type="search" class="mt-invoice-history-search-input" data-invoice-search-input placeholder="Cari invoice / kata kunci..." autocomplete="off">
      <button type="button" class="mt-invoice-history-search-clear" data-invoice-search-clear title="Hapus pencarian" aria-label="Hapus pencarian">×</button>
    `;
    toggle.appendChild(shell);

    const btn = shell.querySelector("[data-invoice-search-toggle]");
    const input = shell.querySelector("[data-invoice-search-input]");
    const clear = shell.querySelector("[data-invoice-search-clear]");

    [btn,input,clear].forEach(el => el?.addEventListener("click", e => e.stopPropagation()));
    btn?.addEventListener("click", () => {
      shell.classList.toggle("is-open");
      if(shell.classList.contains("is-open")) setTimeout(() => input?.focus(), 0);
    });
    input?.addEventListener("input", () => {
      query = norm(input.value);
      shell.classList.toggle("has-query", !!query);
      apply();
    });
    clear?.addEventListener("click", () => {
      if(input) input.value = "";
      query = "";
      shell.classList.remove("has-query");
      apply();
      input?.focus();
    });
    return shell;
  }

  function apply(){
    if(applying) return;
    applying = true;
    try{
      const { history, list, rows } = historyParts();
      if(!history || !list) return;

      ensureSearchUi(history);
      const btn = ensureMoreButton(list);
      const q = query;

      if(q){
        list.hidden = false;
        let matches = 0;
        rows.forEach(row => {
          const show = norm(row.innerText).includes(q);
          row.hidden = !show;
          if(show) matches++;
        });
        if(btn){
          btn.hidden = matches !== 0;
          if(matches === 0){
            btn.textContent = "Tidak ada invoice yang cocok";
            btn.disabled = true;
          }
        }
        return;
      }

      rows.forEach((row, i) => { row.hidden = !expanded && i >= LIMIT; });
      if(btn){
        btn.disabled = false;
        const extra = Math.max(0, rows.length - LIMIT);
        btn.hidden = extra === 0;
        btn.textContent = expanded ? "Tampilkan 3 riwayat terbaru" : `Lihat ${extra} riwayat lainnya`;
      }
    } finally {
      applying = false;
    }
  }

  function install(){
    const invoice = document.getElementById("mtInvoiceList");
    if(!invoice) return false;
    ensureStyle();

    if(window.__invoiceHistorySearchUiInstalled){
      apply();
      return true;
    }
    window.__invoiceHistorySearchUiInstalled = true;

    let queued = false;
    new MutationObserver(() => {
      if(queued || applying) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; apply(); });
    }).observe(invoice, { childList:true, subtree:true });

    apply();
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    if(install() || ++tries > 180) clearInterval(timer);
  }, 100);
  window.addEventListener("load", () => { setTimeout(install, 700); setTimeout(apply, 1400); });
})();
