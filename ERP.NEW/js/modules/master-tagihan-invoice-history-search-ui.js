/* ERP VAX — UI ONLY: compact invoice history + keyword search.
   Shows 3 history rows by default; the rest stay behind a show-more control.
   Reuses #mtSearch without changing Master Tagihan or invoice engines.
*/
"use strict";
(() => {
  const LIMIT = 3;
  let expanded = false;
  let applying = false;

  const norm = v => String(v || "").toLowerCase().trim();

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
    btn.style.cssText = [
      "display:block","margin:10px auto 2px","padding:7px 14px","border-radius:9px",
      "border:1px solid #315569","background:#101b24","color:#b9d8e8","font-weight:800",
      "font-size:11px","cursor:pointer"
    ].join(";");
    btn.addEventListener("click", () => { expanded = !expanded; apply(); });
    list.appendChild(btn);
    return btn;
  }

  function apply(){
    if(applying) return;
    applying = true;
    try{
      const search = document.getElementById("mtSearch");
      const q = norm(search?.value);
      const { history, list, rows } = historyParts();
      if(!history || !list) return;

      const btn = ensureMoreButton(list);
      if(q){
        list.hidden = false;
        rows.forEach(row => {
          row.hidden = !norm(row.innerText).includes(q);
        });
        if(btn) btn.hidden = true;
        return;
      }

      rows.forEach((row, i) => { row.hidden = !expanded && i >= LIMIT; });
      if(btn){
        const extra = Math.max(0, rows.length - LIMIT);
        btn.hidden = extra === 0;
        btn.textContent = expanded ? "Tampilkan 3 riwayat terbaru" : `Lihat ${extra} riwayat lainnya`;
      }
    } finally {
      applying = false;
    }
  }

  function install(){
    const search = document.getElementById("mtSearch");
    const invoice = document.getElementById("mtInvoiceList");
    if(!search || !invoice) return false;
    if(window.__invoiceHistorySearchUiInstalled) return true;
    window.__invoiceHistorySearchUiInstalled = true;

    search.placeholder = "Cari cabang / kategori / invoice / kata kunci...";
    search.addEventListener("input", apply);

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
