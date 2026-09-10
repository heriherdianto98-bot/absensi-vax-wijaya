/*
=========================================================
VAX ERP — ARUS KAS V2 / KASBON COLUMN UI
UI / presentation only.

Tujuan:
- Tambah kolom KASBON tepat sebelum Saldo Kas Besar.
- Transaksi category KASBON tampil nominalnya di kolom KASBON,
  bukan dobel di kolom Pengeluaran.
- Saldo tetap dihitung oleh engine Arus Kas V2 yang sudah ada.
- Tidak mengubah query, transaksi, wallet, formula saldo, atau backend.
=========================================================
*/
"use strict";

(function(){
  const STYLE_ID = "ak2KasbonColumnUiStyle";

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.page-arus-kas .ak2-table th.ak2-kasbon-col,
      body.page-arus-kas .ak2-table td.ak2-kasbon-col{
        min-width:118px;
        width:118px;
        text-align:right;
      }
      body.page-arus-kas .ak2-table th.ak2-kasbon-col{
        color:#67e8f9;
      }
      body.page-arus-kas .ak2-table td.ak2-kasbon-col{
        color:#67e8f9;
        font-weight:900;
        white-space:nowrap;
      }
      body.page-arus-kas .ak2-kasbon-amount{
        color:#67e8f9;
        font-weight:900;
        text-shadow:0 0 8px rgba(34,211,238,.18);
      }
      @media(max-width:900px){
        body.page-arus-kas .ak2-table th.ak2-kasbon-col,
        body.page-arus-kas .ak2-table td.ak2-kasbon-col{min-width:108px;width:108px}
      }
      @media print{
        body.page-arus-kas .ak2-table th.ak2-kasbon-col,
        body.page-arus-kas .ak2-table td.ak2-kasbon-col,
        body.page-arus-kas .ak2-kasbon-amount{color:#111!important;text-shadow:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function isKasbon(row){
    return String(row?.category || "").trim().toUpperCase() === "KASBON";
  }

  function ensureHeader(){
    const headRow = document.querySelector(".ak2-ledger-card .ak2-table thead tr");
    if(!headRow) return;

    headRow.querySelector("th.ak2-kasbon-col")?.remove();
    const cells = [...headRow.children];
    const saldo = cells.find(th => /^SALDO\b/i.test(String(th.textContent || "").trim()));
    if(!saldo) return;

    const th = document.createElement("th");
    th.className = "ak2-kasbon-col";
    th.textContent = "Kasbon";
    headRow.insertBefore(th, saldo);
  }

  function decorateRows(){
    const flow = window.ArusKasV2;
    const body = document.getElementById("ak2LedgerBody");
    if(!flow || !body) return;

    const rowById = new Map((flow.ledger || []).map(row => [String(row.id), row]));

    body.querySelectorAll("tr[data-id]").forEach(tr => {
      const row = rowById.get(String(tr.dataset.id));
      if(!row) return;

      tr.querySelector("td.ak2-kasbon-col")?.remove();

      const cells = [...tr.children];
      const saldoCell = cells.find(td => td.classList.contains("ak2-balance"));
      if(!saldoCell) return;

      const td = document.createElement("td");
      td.className = "ak2-kasbon-col";

      if(isKasbon(row)){
        td.innerHTML = `<span class="ak2-kasbon-amount">${flow.rupiah(row.amount)}</span>`;

        // Setelah Cabang UI: Pengeluaran berada sebelum Ket. Pengeluaran.
        // Temukan berdasarkan class money-out agar tidak bergantung index.
        const outgoing = tr.querySelector("td.ak2-money-out");
        if(outgoing) outgoing.textContent = "—";
      }else{
        td.textContent = "—";
      }

      tr.insertBefore(td, saldoCell);
    });

    const empty = body.querySelector("tr:not([data-id]) td[colspan]");
    if(empty) empty.colSpan = 10;
  }

  function install(){
    const flow = window.ArusKasV2;
    if(!flow || typeof flow.renderLedger !== "function" || flow.__kasbonColumnUiInstalled) return false;

    flow.__kasbonColumnUiInstalled = true;
    const baseRenderLedger = flow.renderLedger;
    flow.renderLedger = function(){
      const result = baseRenderLedger.apply(this, arguments);
      ensureHeader();
      decorateRows();
      return result;
    };

    installStyle();
    ensureHeader();
    decorateRows();
    return true;
  }

  if(!install()){
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if(install() || attempts >= 80) clearInterval(timer);
    }, 50);
  }
})();
