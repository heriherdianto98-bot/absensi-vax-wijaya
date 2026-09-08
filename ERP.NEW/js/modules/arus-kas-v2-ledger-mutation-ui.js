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

  flow.renderLedger = function(){
    const r = this.range();
    const status = document.getElementById("ak2StatusFilter")?.value || "ALL";

    let running = 0;
    const balanceAt = new Map();
    for(const row of this.ledger){
      running += this.kasEffect(row);
      balanceAt.set(row.id,running);
    }

    const rows = this.ledger.filter(x =>
      x.tanggal >= r.start &&
      x.tanggal <= r.end &&
      (status === "ALL" || x.verification_status === status)
    );

    const body = document.getElementById("ak2LedgerBody");
    if(!body) return;

    if(!rows.length){
      body.innerHTML = '<tr><td colspan="8" class="ak2-empty">Belum ada transaksi pada periode ini.</td></tr>';
      const count = document.getElementById("ak2RowCount");
      if(count) count.textContent = "0 transaksi";
      markSaldoHeader();
      return;
    }

    body.innerHTML = rows.map(row => {
      const amount = this.money(row.amount);
      const move = movementFor(row,amount);
      const baseDesc = row.description || this.categoryName(row.category);
      const inDesc = move.incoming ? baseDesc : "";
      const outDesc = move.outgoing ? baseDesc : "";
      const route = `${this.categoryName(row.from_wallet)} → ${this.categoryName(row.to_wallet)}`;

      return `<tr data-id="${row.id}" title="${this.esc(route)}">
        <td>${this.fmtDate(row.tanggal)}</td>
        <td class="ak2-money-in">${move.incoming ? this.rupiah(move.incoming) : "—"}</td>
        <td>${this.esc(inDesc) || "—"}</td>
        <td class="ak2-money-out">${move.outgoing ? this.rupiah(move.outgoing) : "—"}</td>
        <td>${this.esc(outDesc) || "—"}</td>
        <td class="ak2-balance">${this.rupiah(balanceAt.get(row.id) || 0)}</td>
        <td>${this.sourceBadge(row)}</td>
        <td>${this.statusBadge(row.verification_status)}</td>
      </tr>`;
    }).join("");

    const count = document.getElementById("ak2RowCount");
    if(count) count.textContent = `${rows.length} transaksi`;
    markSaldoHeader();
  };

  /* Jika modul dimuat setelah render awal, refresh tampilan sekali tanpa query baru. */
  if(Array.isArray(flow.ledger) && flow.ledger.length){
    setTimeout(() => {
      try{ flow.renderLedger(); }catch(_e){}
    },0);
  }
})();
