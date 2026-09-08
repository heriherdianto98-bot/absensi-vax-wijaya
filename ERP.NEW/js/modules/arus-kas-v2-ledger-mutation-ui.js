/*
=========================================================
VAX ERP — ARUS KAS V2 LEDGER MUTATION VIEW
Presentation / ledger-view layer only.

Tujuan:
- Buku Arus Kas menampilkan setiap mutasi transaksi, termasuk wallet selain KAS_BESAR.
- Pemasukan ke KAS_DENDA / DANA_PRODUK / wallet lain tetap terlihat sebagai pemasukan.
- Pengeluaran dari wallet non-KAS_BESAR tetap terlihat sebagai pengeluaran.
- Saldo berjalan tetap memakai kasEffect existing (saldo Kas Besar), supaya formula saldo engine tidak diubah.

Tidak mengubah engine, formula, query, payload transaksi, atau wallet balance.
=========================================================
*/
"use strict";

(function(){
  const flow = window.ArusKasV2;
  if(!flow || typeof flow.renderLedger !== "function" || flow.__ledgerMutationUiInstalled) return;

  flow.__ledgerMutationUiInstalled = true;

  function movementFor(row, amount){
    const from = String(row?.from_wallet || "").toUpperCase();
    const to = String(row?.to_wallet || "").toUpperCase();

    if(to === "KAS_BESAR") return {incoming:amount,outgoing:0};
    if(from === "KAS_BESAR") return {incoming:0,outgoing:amount};
    if(from === "EXTERNAL") return {incoming:amount,outgoing:0};
    if(to === "EXTERNAL") return {incoming:0,outgoing:amount};

    return {incoming:0,outgoing:amount};
  }

  function markSaldoHeader(){
    const head = document.querySelector(".ak2-ledger-card .ak2-table thead tr");
    if(!head) return;
    [...head.children].forEach(th => {
      const text = String(th.textContent || "").trim().toUpperCase();
      if(text === "SALDO" || text === "SALDO BERJALAN") th.textContent = "Saldo Kas Besar";
    });
  }

  function patchRenderedRows(){
    const body = document.getElementById("ak2LedgerBody");
    if(!body) return;

    const rowById = new Map((flow.ledger || []).map(row => [String(row.id),row]));
    body.querySelectorAll("tr[data-id]").forEach(tr => {
      const row = rowById.get(String(tr.dataset.id));
      if(!row) return;

      const from = String(row?.from_wallet || "").toUpperCase();
      const to = String(row?.to_wallet || "").toUpperCase();
      const route = `${flow.categoryName(row.from_wallet)} → ${flow.categoryName(row.to_wallet)}`;
      tr.title = route;

      /* Transaksi yang menyentuh KAS_BESAR sudah benar di renderer existing.
         Jangan disentuh agar compact description / cabang UI existing tetap utuh. */
      if(from === "KAS_BESAR" || to === "KAS_BESAR") return;

      const cells = [...tr.children];
      const hasCabangColumn = cells.length >= 9;
      const inIdx = hasCabangColumn ? 2 : 1;
      const inDescIdx = hasCabangColumn ? 3 : 2;
      const outIdx = hasCabangColumn ? 4 : 3;
      const outDescIdx = hasCabangColumn ? 5 : 4;

      const amount = flow.money(row.amount);
      const move = movementFor(row,amount);
      const baseDesc = row.description || flow.categoryName(row.category);

      const inCell = cells[inIdx];
      const inDescCell = cells[inDescIdx];
      const outCell = cells[outIdx];
      const outDescCell = cells[outDescIdx];

      if(inCell) inCell.innerHTML = move.incoming ? flow.rupiah(move.incoming) : "—";
      if(inDescCell) inDescCell.textContent = move.incoming ? baseDesc : "—";
      if(outCell) outCell.innerHTML = move.outgoing ? flow.rupiah(move.outgoing) : "—";
      if(outDescCell) outDescCell.textContent = move.outgoing ? baseDesc : "—";
    });

    markSaldoHeader();
  }

  const baseRenderLedger = flow.renderLedger;
  flow.renderLedger = function(){
    const result = baseRenderLedger.apply(this,arguments);
    patchRenderedRows();
    return result;
  };

  if(Array.isArray(flow.ledger) && flow.ledger.length){
    setTimeout(() => {
      try{ patchRenderedRows(); }catch(_e){}
    },0);
  }
})();
