/* ERP VAX — Tabel Harian Full Print presenter
   UI/print only. Mengambil seluruh kolom tabel yang sedang tampil + seluruh card total aktif.
   Tidak mengubah engine, rumus, source data, atau nilai harian. */
(function(){
  "use strict";

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function normalizeLabel(v){
    return String(v || "").replace(/\s+/g, " ").trim();
  }

  function toneFor(label){
    const s = normalizeLabel(label).toLowerCase();
    if(s.includes("cash out")) return "red";
    if(s.includes("cash bersih")) return "green";
    if(s.includes("non tunai")) return "blue";
    if(s.includes("nett produk")) return "teal";
    if(s.includes("share produk")) return "rose";
    if(s.includes("share cukur")) return "cyan";
    if(s.includes("nett revenue")) return "gold";
    if(s.includes("product")) return "purple";
    if(s.includes("omzet")) return "gold";
    if(s.includes("proteksi")) return "orange";
    if(s.includes("transaksi")) return "green2";
    if(s.includes("customer")) return "sky";
    if(s.includes("services")) return "orange";
    if(s.includes("avg ticket")) return "lime";
    return "neutral";
  }

  function snapshotCards(){
    return [...document.querySelectorAll("#thcTotals .thc-tot-item")].map((card) => {
      const label = normalizeLabel(card.querySelector("span")?.textContent || "");
      const value = normalizeLabel(card.querySelector("strong")?.textContent || "—");
      return { label, value, tone: toneFor(label) };
    }).filter((x) => x.label);
  }

  function snapshotTable(){
    const table = document.getElementById("thcTable");
    if(!table) return null;
    const headers = [...table.querySelectorAll("thead th")].map((th) => normalizeLabel(th.textContent));
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.cells].map((td) => ({
        text: normalizeLabel(td.textContent),
        num: td.classList.contains("thc-num") || td.classList.contains("thc-int") || /^-?Rp\s*[\d.]+/i.test(normalizeLabel(td.textContent)),
        neg: /^-/.test(normalizeLabel(td.textContent)) || /-Rp/i.test(normalizeLabel(td.textContent))
      }))
    );
    return { headers, rows };
  }

  function totalValueByHeader(header){
    const key = normalizeLabel(header).toLowerCase();
    const map = {
      "omzet / gross":"thcTotOmzet",
      "nett produk":"thcTotNettProduk",
      "share produk":"thcTotShareProduk",
      "share cukur":"thcTotShareCukur",
      "nett revenue":"thcTotNett",
      "non tunai":"thcTotNonTunai",
      "cash out":"thcTotCashOut",
      "cash bersih":"thcTotSetoran",
      "customer":"thcTotCustomer",
      "transaksi":"thcTotTransaksi",
      "services":"thcTotServices"
    };
    const id = map[key];
    return id ? normalizeLabel(document.getElementById(id)?.textContent || "") : "";
  }

  function buildTableHtml(snapshot){
    const head = snapshot.headers.map((h, i) => `<th class="${i >= 2 ? "num" : ""}">${esc(h)}</th>`).join("");
    const body = snapshot.rows.map((cells) => `<tr>${cells.map((c, i) => `<td class="${i >= 2 || c.num ? "num" : ""}${c.neg ? " is-neg" : ""}">${esc(c.text)}</td>`).join("")}</tr>`).join("");
    const total = snapshot.headers.map((h, i) => {
      if(i === 0) return `<td>Grand Total</td>`;
      if(i === 1) return `<td></td>`;
      return `<td class="num">${esc(totalValueByHeader(h) || "—")}</td>`;
    }).join("");
    return `<table class="rpt is-daily-full"><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr class="grand-total">${total}</tr></tfoot></table>`;
  }

  function buildCardsHtml(cards){
    return `<section class="summary full-summary keep">${cards.map((c) => `<div class="sum tone-${c.tone}"><span class="lbl">${esc(c.label)}</span><span class="val sm">${esc(c.value)}</span></div>`).join("")}</section>`;
  }

  function extraCss(){
    return `
      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      .full-summary{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin-bottom:10px!important}
      .full-summary .sum{position:relative;min-height:52px;border:1px solid #cfc8b5!important;border-left:4px solid #d4af37!important;border-top:1px solid #cfc8b5!important;border-radius:7px!important;padding:7px 9px!important;background:linear-gradient(180deg,#fff 0%,#f7f8fa 100%)!important;box-shadow:0 2px 7px rgba(0,0,0,.10)!important}
      .full-summary .sum .lbl{font-size:6.4pt!important;line-height:1.15!important;letter-spacing:.07em!important;color:#5f5a4b!important}
      .full-summary .sum .val{font-size:11.5pt!important;line-height:1.1!important;margin-top:4px!important;color:#111!important}
      .full-summary .tone-gold{border-left-color:#d4af37!important;background:linear-gradient(180deg,#fffdf6 0%,#f8f2df 100%)!important}.full-summary .tone-gold .val{color:#9a7610!important}
      .full-summary .tone-blue{border-left-color:#4968c9!important}.full-summary .tone-blue .val{color:#3e57ad!important}
      .full-summary .tone-teal{border-left-color:#0f8a7b!important}.full-summary .tone-teal .val{color:#0f766e!important}
      .full-summary .tone-purple{border-left-color:#8b5bb8!important}.full-summary .tone-purple .val{color:#7a4ca6!important}
      .full-summary .tone-red{border-left-color:#b91c1c!important;background:linear-gradient(180deg,#fffafa 0%,#fbefef 100%)!important}.full-summary .tone-red .val{color:#b91c1c!important}
      .full-summary .tone-green,.full-summary .tone-green2{border-left-color:#0f766e!important;background:linear-gradient(180deg,#f8fffc 0%,#edf8f3 100%)!important}.full-summary .tone-green .val,.full-summary .tone-green2 .val{color:#0f766e!important}
      .full-summary .tone-rose{border-left-color:#e05a7a!important}.full-summary .tone-rose .val{color:#b63859!important}
      .full-summary .tone-cyan{border-left-color:#0891b2!important}.full-summary .tone-cyan .val{color:#0e7490!important}
      .full-summary .tone-orange{border-left-color:#d97706!important}.full-summary .tone-orange .val{color:#b45309!important}
      .full-summary .tone-sky{border-left-color:#0284c7!important}.full-summary .tone-sky .val{color:#0369a1!important}
      .full-summary .tone-lime{border-left-color:#65a30d!important}.full-summary .tone-lime .val{color:#4d7c0f!important}
      table.rpt.is-daily-full{table-layout:auto!important;width:100%!important}
      table.rpt.is-daily-full th{font-size:6.1pt!important;padding:5px 3px!important;white-space:normal!important;line-height:1.15!important;text-align:center!important}
      table.rpt.is-daily-full td{font-size:6.7pt!important;padding:4px 4px!important;line-height:1.2!important}
      table.rpt.is-daily-full th:first-child,table.rpt.is-daily-full td:first-child{white-space:nowrap!important;text-align:left!important}
      table.rpt.is-daily-full th:nth-child(2),table.rpt.is-daily-full td:nth-child(2){white-space:nowrap!important;text-align:left!important}
      table.rpt.is-daily-full th.num,table.rpt.is-daily-full td.num{text-align:right!important;white-space:nowrap!important}
      table.rpt.is-daily-full td.num{font-size:6.8pt!important;font-weight:800!important}
      table.rpt.is-daily-full td.is-neg{color:#8b1a1a!important;background:#fff1f1!important}
      table.rpt.is-daily-full tfoot td{font-size:6.7pt!important}
      @media print{.full-summary .sum{box-shadow:0 1.5px 5px rgba(0,0,0,.14)!important}.full-summary{break-inside:avoid!important;page-break-inside:avoid!important}}
    `;
  }

  function install(){
    const th = window.TabelHarianCabang;
    if(!th || th.__fullPrintInstalled) return false;
    th.__fullPrintInstalled = true;

    th.openReport = async function(mode){
      if(!this.rows?.length){ alert("Tidak ada data untuk diekspor pada filter aktif."); return; }
      const snap = snapshotTable();
      if(!snap || !snap.headers.length || !snap.rows.length){ alert("Tabel harian belum siap dicetak."); return; }

      const w = window.open("", "_blank");
      if(!w){ alert("Popup print diblokir browser."); return; }
      try{ w.document.write('<!doctype html><html><body style="font-family:Arial;padding:28px">Menyiapkan seluruh data Tabel Harian...</body></html>'); }catch(_e){}

      const clock = this.getPrintClock();
      const [logoSrc, sigSrc] = await Promise.all([this.resolvePrintLogoSrc(), this.resolvePrintOwnerSignatureSrc()]);
      const cabang = this.printCabangName();
      const periode = this.periodeRangeLabel();
      const filename = this.buildFilename("pdf");
      const titleHint = mode === "pdf" ? "PDF" : "Print";
      const cards = snapshotCards();
      const dailyTable = buildTableHtml(snap);
      const extra = typeof this.buildHarianExtraPrintSections === "function" ? this.buildHarianExtraPrintSections() : "";
      const signHtml = typeof this.buildPrintSignBlock === "function" ? this.buildPrintSignBlock(sigSrc) : "";
      const baseCss = this.getHarianPrintCss();

      const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(filename)}</title><style>${baseCss}${extraCss()}</style></head><body class="harian-print">
      <footer class="foot" aria-hidden="true"><div><b>ERP VAX WIJAYA</b>HARIAN</div><div class="c">INTERNAL / CONFIDENTIAL<br>Generated automatically</div><div class="r">${esc(clock.dateLabel)}<br>${esc(clock.timeLabel)}</div></footer>
      <div class="sheet">
        <header class="head"><div class="brand">${logoSrc ? `<img src="${logoSrc}" alt="ERP VAX WIJAYA">` : ""}<div class="copy"><h1>ERP VAX WIJAYA</h1><div class="doc">HARIAN</div><div class="sys">Enterprise Management System</div></div></div><div class="head-right"><div class="mark">Dokumen Operasional<em>Internal</em></div></div></header>
        <div class="rule"></div>
        <div class="title-wrap"><div class="t1">TABEL HARIAN</div><p class="sub">Daily Recap · seluruh kolom data yang tampil pada Tabel Harian.</p></div>
        <section class="meta"><div><div class="item"><span class="lbl">Cabang</span><span class="val">${esc(cabang)}</span></div><div class="item"><span class="lbl">Periode</span><span class="val">${esc(periode)}</span></div></div><div><div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${esc(clock.dateLabel)}</span></div><div class="item"><span class="lbl">Waktu Cetak</span><span class="val">${esc(clock.timeLabel)}</span></div></div></section>
        ${buildCardsHtml(cards)}
        ${dailyTable}
        ${extra}
        ${signHtml}
        <p class="audit-note">Seluruh kolom dan card diambil dari tampilan Tabel Harian pada filter aktif. Print/PDF hanya presenter; engine dan rumus tidak diubah.</p>
      </div>
      <p class="no-print"><button type="button" onclick="window.print()">Print / PDF</button></p>
      <script>document.title=${JSON.stringify(filename)};window.onload=function(){setTimeout(function(){window.print();},260)};<\/script>
      </body></html>`;

      if(w.closed) return;
      w.document.open(); w.document.write(html); w.document.close();
      console.log(`[TabelHarianFullPrint] ${titleHint} siap · ${snap.headers.length} kolom · ${snap.rows.length} baris`);
    };
    return true;
  }

  function boot(){ if(!install()) setTimeout(boot,120); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot); else boot();
  document.addEventListener("erp:components-ready",boot);
})();
