/*
=========================================================
VAX ERP — ARUS KAS V2 / CABANG LEDGER LABEL UI
UI / presentation only.

Tujuan:
- Ledger kembali menampilkan 1 transaksi = 1 baris seperti engine asli.
- Nama cabang hanya tampil pada baris pertama dari rangkaian transaksi
  cabang + periode yang sama; baris berikutnya cukup tanda em dash.
- Header SALDO diperjelas menjadi SALDO BERJALAN.
- Data transaksi, saldo, engine, query, formula, status, dan alur AUTO /
  MANUAL tidak diubah.
=========================================================
*/
"use strict";

(function(){
  const STYLE_ID = "ak2CabangLabelUiStyle";

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.page-arus-kas .ak2-table th.ak2-cabang-col,
      body.page-arus-kas .ak2-table td.ak2-cabang-col{
        min-width:170px;
        width:170px;
      }
      body.page-arus-kas .ak2-table td.ak2-cabang-col{
        font-weight:800;
        color:#f0c969;
        letter-spacing:.01em;
      }
      body.page-arus-kas .ak2-cabang-badge{
        display:inline-flex;
        align-items:center;
        max-width:165px;
        min-height:28px;
        padding:5px 9px;
        border:1px solid rgba(218,170,76,.34);
        border-radius:9px;
        background:linear-gradient(180deg,rgba(72,52,18,.26),rgba(20,25,31,.72));
        color:#f4d27c;
        font-size:12px;
        font-weight:850;
        line-height:1.2;
        white-space:normal;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.025);
      }
      body.page-arus-kas .ak2-cabang-repeat{
        display:inline-block;
        min-width:24px;
        text-align:center;
        color:#66788a;
        font-size:15px;
        font-weight:700;
      }
      body.page-arus-kas .ak2-cabang-badge.is-manual{
        border-color:rgba(94,111,128,.34);
        background:rgba(18,25,32,.78);
        color:#9eabb7;
      }
      @media(max-width:900px){
        body.page-arus-kas .ak2-table th.ak2-cabang-col,
        body.page-arus-kas .ak2-table td.ak2-cabang-col{min-width:145px;width:145px}
        body.page-arus-kas .ak2-cabang-badge{max-width:140px;font-size:11px}
      }
      @media print{
        body.page-arus-kas .ak2-cabang-badge{box-shadow:none;background:transparent;color:#111;border-color:#999}
      }
    `;
    document.head.appendChild(style);
  }

  function cabangNameFor(row){
    const metadata = row?.metadata || {};
    const explicit = row?.cabang_name || row?.nama_cabang || metadata.cabang_name || metadata.nama_cabang || metadata.branch_name || null;
    if(explicit) return String(explicit);

    const id = Number(row?.cabang_id ?? metadata.cabang_id ?? metadata.branch_id);
    if(Number.isFinite(id) && window.ArusKasV2?.consumerCabangNames instanceof Map){
      const fromMap = window.ArusKasV2.consumerCabangNames.get(id);
      if(fromMap) return String(fromMap);
    }

    if(row?.entry_type === "MANUAL") return "Manual / Umum";
    return "—";
  }

  function branchKeyFor(row){
    const metadata = row?.metadata || {};
    const id = row?.cabang_id ?? metadata.cabang_id ?? metadata.branch_id;
    const start = row?.source_period_start || metadata.period_start || metadata.source_period_start || row?.tanggal || "";
    const end = row?.source_period_end || metadata.period_end || metadata.source_period_end || row?.tanggal || "";
    if(row?.entry_type === "MANUAL") return `MANUAL:${row?.id || ""}`;
    if(id != null && id !== "") return `AUTO:${id}:${start}:${end}`;
    return `AUTO:${cabangNameFor(row).toLowerCase()}:${start}:${end}`;
  }

  function ensureHeader(){
    const headRow = document.querySelector(".ak2-ledger-card .ak2-table thead tr");
    if(!headRow) return;

    if(!headRow.querySelector(".ak2-cabang-col")){
      const th = document.createElement("th");
      th.className = "ak2-cabang-col";
      th.textContent = "Cabang";
      const tanggal = headRow.children[0];
      if(tanggal?.nextSibling) headRow.insertBefore(th, tanggal.nextSibling);
      else headRow.appendChild(th);
    }

    const cells = [...headRow.children];
    const saldo = cells.find(th => String(th.textContent || "").trim().toUpperCase() === "SALDO");
    if(saldo) saldo.textContent = "Saldo Berjalan";
  }

  function decorateRows(){
    const flow = window.ArusKasV2;
    const body = document.getElementById("ak2LedgerBody");
    if(!flow || !body) return;

    const rowById = new Map((flow.ledger || []).map(row => [String(row.id), row]));
    let previousGroupKey = null;

    body.querySelectorAll("tr[data-id]").forEach(tr => {
      const row = rowById.get(String(tr.dataset.id));
      if(!row) return;

      // Hapus dekorasi lama jika render ulang terjadi.
      tr.querySelector("td.ak2-cabang-col")?.remove();

      const groupKey = branchKeyFor(row);
      const repeated = previousGroupKey === groupKey;
      const name = cabangNameFor(row);
      const td = document.createElement("td");
      td.className = "ak2-cabang-col";

      if(repeated){
        const repeat = document.createElement("span");
        repeat.className = "ak2-cabang-repeat";
        repeat.textContent = "—";
        repeat.title = `Masih transaksi cabang ${name}`;
        td.appendChild(repeat);
      }else{
        const badge = document.createElement("span");
        badge.className = `ak2-cabang-badge${row?.entry_type === "MANUAL" ? " is-manual" : ""}`;
        badge.textContent = name;
        badge.title = name === "—" ? "Nama cabang tidak tersedia pada metadata transaksi" : `Cabang: ${name}`;
        td.appendChild(badge);
      }

      const first = tr.children[0];
      if(first?.nextSibling) tr.insertBefore(td, first.nextSibling);
      else tr.appendChild(td);

      previousGroupKey = groupKey;
    });

    const empty = body.querySelector("tr:not([data-id]) td[colspan]");
    if(empty) empty.colSpan = 9;
  }

  function install(){
    const flow = window.ArusKasV2;
    if(!flow || typeof flow.renderLedger !== "function" || flow.__cabangLabelUiInstalled) return false;

    flow.__cabangLabelUiInstalled = true;
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
