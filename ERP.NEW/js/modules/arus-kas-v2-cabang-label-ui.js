/*
=========================================================
VAX ERP — ARUS KAS V2 / CABANG LEDGER LABEL UI
UI / presentation only.

Tujuan:
- Ledger tetap 1 transaksi = 1 baris seperti engine asli.
- Nama cabang hanya tampil pada baris pertama dari rangkaian transaksi
  cabang + periode yang sama; baris berikutnya cukup tanda em dash.
- Nama cabang dipendekkan untuk kebutuhan UI Owner (contoh: KALIJATI,
  CINANGSI, SPBU PAGADEN) tanpa mengubah data sumber.
- Tanggal juga hanya tampil pada baris pertama bila cabang + tanggal sama.
- Header SALDO diperjelas menjadi SALDO BERJALAN.
- Keterangan transaksi AUTO dipadatkan agar row tidak terlalu tinggi.
- Popup detail dinonaktifkan untuk transaksi AUTO.
- Popup detail hanya boleh dibuka lewat icon detail pada transaksi MANUAL.
- Card saldo dipindahkan ke bawah Buku Arus Kas, tepat di atas Rekonsiliasi QRIS / GoPay.
- Toolbar Arus Kas dibuat freeze secara UI di bawah header ERP.
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
      body.page-arus-kas .ak2-toolbar{
        background:linear-gradient(180deg,rgba(12,18,24,.985),rgba(10,15,20,.97)) !important;
        border:1px solid rgba(79,102,126,.58) !important;
        border-radius:14px !important;
        box-shadow:0 10px 28px rgba(0,0,0,.34),0 1px 0 rgba(215,170,85,.16) inset !important;
        backdrop-filter:blur(10px) saturate(120%);
      }
      body.page-arus-kas .ak2-toolbar.ak2-ui-frozen{
        position:fixed !important;
        z-index:1200 !important;
        margin:0 !important;
      }
      body.page-arus-kas .ak2-toolbar-freeze-placeholder{
        display:none;
        width:100%;
        pointer-events:none;
      }
      body.page-arus-kas .ak2-toolbar-freeze-placeholder.is-active{display:block}

      body.page-arus-kas .ak2-table th.ak2-cabang-col,
      body.page-arus-kas .ak2-table td.ak2-cabang-col{
        min-width:138px;
        width:138px;
      }
      body.page-arus-kas .ak2-table td.ak2-cabang-col{
        font-weight:900;
        color:#f0c969;
        letter-spacing:.015em;
      }
      body.page-arus-kas .ak2-cabang-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        max-width:132px;
        min-height:30px;
        padding:6px 10px;
        border:1px solid rgba(218,170,76,.34);
        border-radius:9px;
        background:linear-gradient(180deg,rgba(72,52,18,.26),rgba(20,25,31,.72));
        color:#f4d27c;
        font-size:14px;
        font-weight:900;
        line-height:1.1;
        letter-spacing:.025em;
        text-transform:uppercase;
        white-space:normal;
        text-align:center;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.025);
      }
      body.page-arus-kas .ak2-cabang-repeat,
      body.page-arus-kas .ak2-tanggal-repeat{
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
      body.page-arus-kas .ak2-ledger-card .ak2-table td.ak2-compact-desc{
        line-height:1.25 !important;
        white-space:normal;
      }
      body.page-arus-kas #ak2LedgerBody tr[data-id]{cursor:default !important}
      @media(max-width:900px){
        body.page-arus-kas .ak2-table th.ak2-cabang-col,
        body.page-arus-kas .ak2-table td.ak2-cabang-col{min-width:120px;width:120px}
        body.page-arus-kas .ak2-cabang-badge{max-width:114px;font-size:12px}
      }
      @media print{
        body.page-arus-kas .ak2-toolbar{position:static !important;left:auto!important;top:auto!important;width:auto!important;box-shadow:none !important;backdrop-filter:none !important}
        body.page-arus-kas .ak2-toolbar-freeze-placeholder{display:none!important}
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

  function shortCabangName(name, row){
    if(row?.entry_type === "MANUAL") return "MANUAL / UMUM";
    const raw = String(name || "").trim();
    if(!raw || raw === "—") return "—";
    return raw
      .replace(/^vax\s+wijaya\s+/i, "")
      .replace(/^vax\s+/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
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

  function parseDateOnly(value){
    if(!value) return null;
    const s = String(value).slice(0,10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return {y:Number(m[1]),m:Number(m[2]),d:Number(m[3])};
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

  function compactPeriodFor(row){
    const metadata = row?.metadata || {};
    const startRaw = row?.source_period_start || metadata.period_start || metadata.source_period_start || row?.tanggal;
    const endRaw = row?.source_period_end || metadata.period_end || metadata.source_period_end || row?.tanggal;
    const a = parseDateOnly(startRaw);
    const b = parseDateOnly(endRaw);
    if(!a || !b) return "";
    if(a.y === b.y && a.m === b.m){
      if(a.d === b.d) return `${String(a.d).padStart(2,"0")} ${MONTHS[a.m-1]} ${a.y}`;
      return `${String(a.d).padStart(2,"0")} sd ${String(b.d).padStart(2,"0")} ${MONTHS[b.m-1]} ${b.y}`;
    }
    if(a.y === b.y){
      return `${String(a.d).padStart(2,"0")} ${MONTHS[a.m-1]} sd ${String(b.d).padStart(2,"0")} ${MONTHS[b.m-1]} ${b.y}`;
    }
    return `${String(a.d).padStart(2,"0")} ${MONTHS[a.m-1]} ${a.y} sd ${String(b.d).padStart(2,"0")} ${MONTHS[b.m-1]} ${b.y}`;
  }

  function compactAutoDescriptions(tr, row){
    if(row?.entry_type !== "AUTO") return;
    const period = compactPeriodFor(row);
    if(!period) return;

    const inDesc = tr.children[3];
    const outDesc = tr.children[5];

    if(inDesc){
      const text = String(inDesc.textContent || "").trim();
      if(/^setoran\b/i.test(text)){
        inDesc.textContent = `Setoran ${period}`;
        inDesc.classList.add("ak2-compact-desc");
      }
    }
    if(outDesc){
      const text = String(outDesc.textContent || "").trim();
      if(/^nett\s+produk\b/i.test(text)){
        outDesc.textContent = `Nett Produk ${period}`;
        outDesc.classList.add("ak2-compact-desc");
      }else if(/^koreksi\s+setoran\b/i.test(text)){
        outDesc.textContent = `Koreksi Setoran ${period}`;
        outDesc.classList.add("ak2-compact-desc");
      }
    }
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
    let previousDateKey = null;

    body.querySelectorAll("tr[data-id]").forEach(tr => {
      const row = rowById.get(String(tr.dataset.id));
      if(!row) return;

      tr.querySelector("td.ak2-cabang-col")?.remove();
      tr.querySelectorAll(".ak2-row-detail-trigger").forEach(x => x.remove());

      const groupKey = branchKeyFor(row);
      const repeated = previousGroupKey === groupKey;
      const dateKey = `${groupKey}:${row?.tanggal || ""}`;
      const repeatedDate = previousDateKey === dateKey;
      const fullName = cabangNameFor(row);
      const shortName = shortCabangName(fullName, row);

      const dateCell = tr.children[0];
      if(dateCell && repeatedDate){
        dateCell.innerHTML = '<span class="ak2-tanggal-repeat" title="Tanggal sama dengan transaksi cabang di atas">—</span>';
      }

      const td = document.createElement("td");
      td.className = "ak2-cabang-col";

      if(repeated){
        const repeat = document.createElement("span");
        repeat.className = "ak2-cabang-repeat";
        repeat.textContent = "—";
        repeat.title = `Masih transaksi cabang ${shortName}`;
        td.appendChild(repeat);
      }else{
        const badge = document.createElement("span");
        badge.className = `ak2-cabang-badge${row?.entry_type === "MANUAL" ? " is-manual" : ""}`;
        badge.textContent = shortName;
        badge.title = fullName === "—" ? "Nama cabang tidak tersedia pada metadata transaksi" : `Cabang: ${fullName}`;
        td.appendChild(badge);
      }

      const first = tr.children[0];
      if(first?.nextSibling) tr.insertBefore(td, first.nextSibling);
      else tr.appendChild(td);

      compactAutoDescriptions(tr, row);

      previousGroupKey = groupKey;
      previousDateKey = dateKey;
    });

    const empty = body.querySelector("tr:not([data-id]) td[colspan]");
    if(empty) empty.colSpan = 9;
  }

  function moveSummaryCards(){
    const cards = document.querySelector(".ak2-cards");
    const qris = document.querySelector(".ak2-qris-card");
    if(!cards || !qris) return;
    if(qris.previousElementSibling === cards) return;
    qris.parentNode?.insertBefore(cards, qris);
  }

  function freezeToolbar(){
    const toolbar = document.querySelector(".ak2-toolbar");
    if(!toolbar || toolbar.dataset.ak2FreezeUi === "1") return;
    toolbar.dataset.ak2FreezeUi = "1";

    const placeholder = document.createElement("div");
    placeholder.className = "ak2-toolbar-freeze-placeholder";
    toolbar.parentNode?.insertBefore(placeholder, toolbar);

    let raf = 0;
    const headerBottom = () => {
      const header = document.getElementById("header");
      const rect = header?.getBoundingClientRect?.();
      if(rect && Number.isFinite(rect.bottom) && rect.bottom > 0) return Math.round(rect.bottom);
      const css = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--erp-top-header-h"));
      return Number.isFinite(css) ? css : 72;
    };

    const sync = () => {
      raf = 0;
      const top = headerBottom();
      const anchor = placeholder.classList.contains("is-active") ? placeholder : toolbar;
      const rect = anchor.getBoundingClientRect();
      const shouldFreeze = rect.top <= top;

      if(shouldFreeze){
        if(!placeholder.classList.contains("is-active")){
          placeholder.style.height = `${Math.ceil(toolbar.getBoundingClientRect().height)}px`;
          placeholder.classList.add("is-active");
        }
        const pRect = placeholder.getBoundingClientRect();
        toolbar.classList.add("ak2-ui-frozen");
        toolbar.style.top = `${top}px`;
        toolbar.style.left = `${Math.round(pRect.left)}px`;
        toolbar.style.width = `${Math.round(pRect.width)}px`;
      }else{
        toolbar.classList.remove("ak2-ui-frozen");
        toolbar.style.top = "";
        toolbar.style.left = "";
        toolbar.style.width = "";
        placeholder.classList.remove("is-active");
        placeholder.style.height = "";
      }
    };

    const schedule = () => {
      if(raf) return;
      raf = requestAnimationFrame(sync);
    };

    window.addEventListener("scroll", schedule, {passive:true});
    window.addEventListener("resize", schedule, {passive:true});
    document.addEventListener("erp:finance-ready", schedule);
    setTimeout(schedule, 0);
    setTimeout(schedule, 250);
  }

  function installDetailClickGate(){
    const body = document.getElementById("ak2LedgerBody");
    const flow = window.ArusKasV2;
    if(!body || !flow || body.dataset.ak2DetailGate === "1") return;
    body.dataset.ak2DetailGate = "1";

    body.addEventListener("click", e => {
      const rowEl = e.target.closest("tr[data-id]");
      if(!rowEl) return;

      const row = (flow.ledger || []).find(x => String(x.id) === String(rowEl.dataset.id));
      const manualIcon = e.target.closest(".ak2-ledger-detail-icon");

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if(row?.entry_type === "MANUAL" && manualIcon && typeof flow.openDetail === "function"){
        flow.openDetail(rowEl.dataset.id);
      }
    }, true);
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
      moveSummaryCards();
      installDetailClickGate();
      return result;
    };

    installStyle();
    ensureHeader();
    decorateRows();
    moveSummaryCards();
    freezeToolbar();
    installDetailClickGate();
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
