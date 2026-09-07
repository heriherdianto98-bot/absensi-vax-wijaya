/*
=========================================================
VAX ERP — ARUS KAS V2 / CABANG GROUPED LEDGER UI
UI / presentation only.

Tujuan:
- Menampilkan nama cabang secara eksplisit pada Buku Arus Kas.
- Menggabungkan transaksi AUTO cabang + periode yang sama menjadi
  1 baris tampilan agar Owner mudah membaca pemasukan, pengeluaran,
  dan saldo akhir cabang.
- Data transaksi asli tetap utuh di ArusKasV2.ledger / database.
- Tidak mengubah engine, query, formula, source transaction,
  status verifikasi, ataupun alur AUTO / MANUAL.
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
        flex-direction:column;
        align-items:flex-start;
        gap:2px;
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
      body.page-arus-kas .ak2-cabang-badge small{
        color:#8fa1b2;
        font-size:9px;
        font-weight:750;
        letter-spacing:.04em;
        text-transform:uppercase;
      }
      body.page-arus-kas .ak2-cabang-badge.is-manual{
        border-color:rgba(94,111,128,.34);
        background:rgba(18,25,32,.78);
        color:#9eabb7;
      }
      body.page-arus-kas .ak2-ledger-group-row{
        border-bottom:1px solid rgba(91,122,148,.42) !important;
      }
      body.page-arus-kas .ak2-ledger-group-row td{
        vertical-align:middle;
      }
      body.page-arus-kas .ak2-ledger-group-row .ak2-group-desc{
        line-height:1.35;
      }
      body.page-arus-kas .ak2-ledger-group-row .ak2-group-desc span{
        display:block;
      }
      body.page-arus-kas .ak2-ledger-group-row .ak2-group-desc span + span{
        margin-top:3px;
        padding-top:3px;
        border-top:1px dashed rgba(111,137,158,.20);
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

  function esc(v){
    return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }

  function cabangNameFor(row){
    const metadata = row?.metadata || {};
    const explicit = row?.cabang_name || row?.nama_cabang || metadata.cabang_name || metadata.nama_cabang || metadata.branch_name || null;
    if(explicit) return String(explicit);

    const id = Number(row?.cabang_id ?? metadata.cabang_id);
    if(Number.isFinite(id) && window.ArusKasV2?.consumerCabangNames instanceof Map){
      const fromMap = window.ArusKasV2.consumerCabangNames.get(id);
      if(fromMap) return String(fromMap);
    }

    if(row?.entry_type === "MANUAL") return "Manual / Umum";
    return "—";
  }

  function branchIdFor(row){
    const metadata = row?.metadata || {};
    const id = row?.cabang_id ?? metadata.cabang_id ?? metadata.branch_id;
    return id == null ? "" : String(id);
  }

  function periodFor(row){
    const metadata = row?.metadata || {};
    return {
      start: row?.source_period_start || metadata.period_start || metadata.source_period_start || row?.tanggal || "",
      end: row?.source_period_end || metadata.period_end || metadata.source_period_end || row?.tanggal || ""
    };
  }

  function groupKey(row){
    if(row?.entry_type === "MANUAL") return `MANUAL:${row.id}`;
    const p = periodFor(row);
    const branch = branchIdFor(row) || cabangNameFor(row).toLowerCase();
    return `AUTO:${branch}:${p.start}:${p.end}`;
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
  }

  function statusHtml(flow, rows){
    const statuses = [...new Set(rows.map(r => r.verification_status))];
    if(statuses.length === 1 && typeof flow.statusBadge === "function") return flow.statusBadge(statuses[0]);
    return '<span class="ak2-status is-pending">CAMPURAN</span>';
  }

  function sourceHtml(flow, rows){
    const first = rows[0];
    if(rows.every(r => r.entry_type === "AUTO")) return '<span class="ak2-source is-auto">AUTO</span>';
    return typeof flow.sourceBadge === "function" ? flow.sourceBadge(first) : '<span class="ak2-source">MANUAL</span>';
  }

  function descHtml(rows, direction, flow){
    const parts = [];
    for(const row of rows){
      const effect = typeof flow.kasEffect === "function" ? flow.kasEffect(row) : 0;
      if((direction === "in" && effect <= 0) || (direction === "out" && effect >= 0)) continue;
      const text = row.description || (typeof flow.categoryName === "function" ? flow.categoryName(row.category) : row.category) || "—";
      if(!parts.includes(text)) parts.push(text);
    }
    if(!parts.length) return "—";
    return `<div class="ak2-group-desc">${parts.map(x => `<span>${esc(x)}</span>`).join("")}</div>`;
  }

  function rebuildGroupedRows(){
    const flow = window.ArusKasV2;
    const body = document.getElementById("ak2LedgerBody");
    if(!flow || !body) return;

    const visibleIds = [...body.querySelectorAll("tr[data-id]")].map(tr => String(tr.dataset.id));
    if(!visibleIds.length){
      const empty = body.querySelector("tr:not([data-id]) td[colspan]");
      if(empty) empty.colSpan = 9;
      return;
    }

    const sourceById = new Map((flow.ledger || []).map(row => [String(row.id), row]));
    const visibleRows = visibleIds.map(id => sourceById.get(id)).filter(Boolean);
    if(!visibleRows.length) return;

    // Saldo berjalan tetap dihitung dari ledger asli. UI hanya mengambil
    // saldo setelah transaksi terakhir pada tiap grup.
    let running = 0;
    const balanceAt = new Map();
    for(const row of (flow.ledger || [])){
      running += typeof flow.kasEffect === "function" ? flow.kasEffect(row) : 0;
      balanceAt.set(String(row.id), running);
    }

    const groups = new Map();
    const order = [];
    for(const row of visibleRows){
      const key = groupKey(row);
      if(!groups.has(key)){
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key).push(row);
    }

    body.innerHTML = order.map(key => {
      const rows = groups.get(key);
      const first = rows[0];
      const last = rows[rows.length - 1];
      const name = cabangNameFor(first);
      const incoming = rows.reduce((t,row) => {
        const effect = typeof flow.kasEffect === "function" ? flow.kasEffect(row) : 0;
        return t + (effect > 0 ? effect : 0);
      }, 0);
      const outgoing = rows.reduce((t,row) => {
        const effect = typeof flow.kasEffect === "function" ? flow.kasEffect(row) : 0;
        return t + (effect < 0 ? Math.abs(effect) : 0);
      }, 0);
      const balance = balanceAt.get(String(last.id)) || 0;
      const dateText = typeof flow.fmtDate === "function" ? flow.fmtDate(last.tanggal) : (last.tanggal || "—");
      const money = v => typeof flow.rupiah === "function" ? flow.rupiah(v) : String(v || 0);
      const isManual = first.entry_type === "MANUAL";
      const countLabel = rows.length > 1 ? `<small>${rows.length} transaksi digabung</small>` : "";

      return `<tr class="ak2-ledger-group-row" data-ak2-group="${esc(key)}">
        <td>${esc(dateText)}</td>
        <td class="ak2-cabang-col"><span class="ak2-cabang-badge${isManual ? " is-manual" : ""}">${esc(name)}${countLabel}</span></td>
        <td class="ak2-money-in">${incoming ? money(incoming) : "—"}</td>
        <td>${descHtml(rows,"in",flow)}</td>
        <td class="ak2-money-out">${outgoing ? money(outgoing) : "—"}</td>
        <td>${descHtml(rows,"out",flow)}</td>
        <td class="ak2-balance">${money(balance)}</td>
        <td>${sourceHtml(flow,rows)}</td>
        <td>${statusHtml(flow,rows)}</td>
      </tr>`;
    }).join("");

    const count = document.getElementById("ak2RowCount");
    if(count){
      count.textContent = `${order.length} cabang/baris · ${visibleRows.length} transaksi`;
    }
  }

  function install(){
    const flow = window.ArusKasV2;
    if(!flow || typeof flow.renderLedger !== "function" || flow.__cabangGroupedLedgerUiInstalled) return false;

    flow.__cabangGroupedLedgerUiInstalled = true;
    const baseRenderLedger = flow.renderLedger;
    flow.renderLedger = function(){
      const result = baseRenderLedger.apply(this, arguments);
      ensureHeader();
      rebuildGroupedRows();
      return result;
    };

    installStyle();
    ensureHeader();
    rebuildGroupedRows();
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
