/*
=========================================================
VAX ERP — ARUS KAS V2 WALLET SOURCE LABEL UI
UI / presentation only. Tidak mengubah engine, data, formula, query,
wallet balance, source of truth, ataupun workflow transaksi.

Prinsip tampilan:
- Semua KET. menjawab dulu: uang ini DIAMBIL / BERASAL DARI mana.
- Baris 1 selalu: "Dari [sumber uang]".
- Baris 2 kecil: kebutuhan / jenis transaksi / periode.
- Berlaku untuk pemasukan dan pengeluaran, akun Owner dan SVP.
- Tidak menambah kolom baru dan tetap rapat untuk audit satu layar.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__walletRouteUiInstalled) return;
  flow.__walletRouteUiInstalled=true;

  let decorateQueued=false;

  const WALLET_LABELS={
    EXTERNAL:"Eksternal",
    KAS_BESAR:"Kas Besar",
    DANA_PRODUK:"Dana Produk",
    KAS_DENDA:"Kas Denda",
    PIUTANG_SETORAN:"Piutang Setoran",
    PIUTANG_DENDA:"Piutang Denda"
  };

  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;

  function walletLabel(value){
    const key=String(value||"").trim().toUpperCase();
    if(WALLET_LABELS[key]) return WALLET_LABELS[key];
    if(!key) return "—";
    return key
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map(x=>x.charAt(0).toUpperCase()+x.slice(1))
      .join(" ");
  }

  function findLedgerCells(tr){
    const hasCabang=!!tr.querySelector(":scope > td.ak2-cabang-col");
    const o=hasCabang?1:0;
    return {
      masuk:tr.children[1+o],
      ketMasuk:tr.children[2+o],
      keluar:tr.children[3+o],
      ketKeluar:tr.children[4+o]
    };
  }

  function hasNominal(cell){
    if(!cell) return false;
    const text=String(cell.textContent||"").replace(/\s+/g," ").trim();
    return !!text && text!=="—" && text!=="-";
  }

  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

  function parseDateOnly(value){
    const m=String(value||"").slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return {y:Number(m[1]),m:Number(m[2]),d:Number(m[3])};
  }

  function periodFromMetadata(row){
    const md=row?.metadata||{};
    const a=parseDateOnly(row?.source_period_start||md.period_start||md.source_period_start);
    const b=parseDateOnly(row?.source_period_end||md.period_end||md.source_period_end);
    if(!a||!b) return "";
    if(a.y===b.y&&a.m===b.m){
      if(a.d===b.d) return `tgl ${a.d} ${MONTHS[a.m-1]}`;
      return `tgl ${a.d} sd ${b.d} ${MONTHS[b.m-1]}`;
    }
    return `tgl ${a.d} ${MONTHS[a.m-1]} sd ${b.d} ${MONTHS[b.m-1]}`;
  }

  function periodFromDescription(row){
    const desc=String(row?.description||"");
    const m=desc.match(/(\d{1,2})\s+Sep(?:tember)?\s+2026\s*[—-]\s*(\d{1,2})\s+Sep(?:tember)?\s+2026/i)
      || desc.match(/(\d{1,2})\s+Sep(?:tember)?\s+2026\s*(?:sd|s\/d|to)\s*(\d{1,2})\s+Sep(?:tember)?\s+2026/i);
    if(m) return `tgl ${Number(m[1])} sd ${Number(m[2])} Sep`;

    const compact=desc.match(/(\d{1,2})\s*(?:sd|s\/d|[-–—])\s*(\d{1,2})\s*Sep/i);
    if(compact) return `tgl ${Number(compact[1])} sd ${Number(compact[2])} Sep`;
    return "";
  }

  function periodLabel(row){
    return periodFromMetadata(row)||periodFromDescription(row);
  }

  function cleanDescription(row){
    return String(row?.description||flow.categoryName?.(row?.category)||"Transaksi")
      .replace(/\s+/g," ")
      .trim();
  }

  function secondLine(row){
    const category=String(row?.category||"").toUpperCase();
    const period=periodLabel(row);
    const desc=cleanDescription(row);

    if(category==="SETORAN_3_HARIAN"){
      const correction=/^koreksi\s+setoran/i.test(desc);
      return `${correction?"Koreksi setoran":"Setoran"}${period?` ${period}`:""}`;
    }
    if(category==="TRANSFER_DANA_PRODUK"){
      return `Dana Produk${period?` ${period}`:""}`;
    }
    return desc;
  }

  function sourceLabel(row){
    const category=String(row?.category||"").toUpperCase();
    const from=String(row?.from_wallet||"").toUpperCase();
    if(category==="SETORAN_3_HARIAN" && from==="EXTERNAL") return "Setoran";
    return walletLabel(row?.from_wallet);
  }

  function labelParts(row){
    return {
      primary:`Dari ${sourceLabel(row)}`,
      secondary:secondLine(row)
    };
  }

  function fullText(row){
    const parts=labelParts(row);
    return `${parts.primary} · ${parts.secondary}`;
  }

  function setDescription(cell,row){
    if(!cell) return;
    const deleted=typeof flow.isDeleteInactive==="function" && flow.isDeleteInactive(row);
    const parts=labelParts(row);
    cell.textContent="";

    const wrap=document.createElement("span");
    wrap.className=deleted
      ? "ak2-wallet-route ak2-deleted-history-text ak2-deleted-desc"
      : "ak2-wallet-route";

    const primary=document.createElement("span");
    primary.className="ak2-wallet-route-main";
    primary.textContent=parts.primary;

    const secondary=document.createElement("span");
    secondary.className="ak2-wallet-route-sub";
    secondary.textContent=parts.secondary;

    wrap.append(primary,secondary);
    wrap.title=fullText(row);
    cell.appendChild(wrap);
    cell.title=fullText(row);
  }

  function compactHeaders(){
    const th=[...document.querySelectorAll(".ak2-ledger-card .ak2-table thead th")];
    if(!th.length) return;
    const twoLine={
      "KET. PEMASUKAN":"KET.<br>PEMASUKAN",
      "KET. PENGELUARAN":"KET.<br>PENGELUARAN",
      "SALDO KAS BESAR":"SALDO KAS<br>BESAR"
    };
    th.forEach(cell=>{
      const key=String(cell.textContent||"").replace(/\s+/g," ").trim().toUpperCase();
      if(twoLine[key] && cell.dataset.ak2CompactHead!=="1"){
        cell.innerHTML=twoLine[key];
        cell.dataset.ak2CompactHead="1";
      }
    });
  }

  function decorateRows(){
    compactHeaders();
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;

    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);
      if(!row) return;
      const c=findLedgerCells(tr);
      if(hasNominal(c.masuk)) setDescription(c.ketMasuk,row);
      if(hasNominal(c.keluar)) setDescription(c.ketKeluar,row);
    });
  }

  function scheduleDecorate(){
    if(decorateQueued) return;
    decorateQueued=true;
    requestAnimationFrame(()=>{
      decorateQueued=false;
      decorateRows();
      setTimeout(decorateRows,0);
    });
  }

  function installStyle(){
    if(document.getElementById("ak2WalletRouteUiStyle")) return;
    const s=document.createElement("style");
    s.id="ak2WalletRouteUiStyle";
    s.textContent=`
      body.page-arus-kas .ak2-wallet-route{
        display:flex;
        flex-direction:column;
        justify-content:center;
        gap:0;
        width:100%;
        max-width:100%;
        overflow:hidden;
        line-height:1;
      }
      body.page-arus-kas .ak2-wallet-route-main,
      body.page-arus-kas .ak2-wallet-route-sub{
        display:block;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      body.page-arus-kas .ak2-wallet-route-main{
        color:#eef3f8;
        font-size:13px;
        font-weight:850;
        line-height:1.05;
      }
      body.page-arus-kas .ak2-wallet-route-sub{
        margin-top:2px;
        color:#8f9daa;
        font-size:10px;
        font-weight:650;
        line-height:1;
      }

      /* UI ONLY — override min-width 1420px layer lama supaya tabel benar-benar rapat. */
      body.page-arus-kas .ak2-ledger-card .ak2-table{
        width:100%!important;
        min-width:1000px!important;
        max-width:none!important;
        table-layout:fixed!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table thead th{
        white-space:normal!important;
        overflow-wrap:normal!important;
        word-break:keep-all!important;
        line-height:1.02!important;
        padding:6px 4px!important;
        text-align:left;
        vertical-align:middle;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td{
        padding-top:3px!important;
        padding-bottom:3px!important;
        padding-left:5px!important;
        padding-right:5px!important;
        line-height:1.06!important;
        overflow:hidden;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr{height:40px!important}

      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(1),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(1){width:100px!important;min-width:100px!important;max-width:100px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(2),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(2){width:100px!important;min-width:100px!important;max-width:100px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(3),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(3){width:88px!important;min-width:88px!important;max-width:88px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(4),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(4){width:135px!important;min-width:135px!important;max-width:135px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(5),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(5){width:92px!important;min-width:92px!important;max-width:92px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(6),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(6){width:135px!important;min-width:135px!important;max-width:135px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(7),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(7){width:122px!important;min-width:122px!important;max-width:122px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(8),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(8){width:72px!important;min-width:72px!important;max-width:72px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(9),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(9){width:126px!important;min-width:126px!important;max-width:126px!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-child(10),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-child(10){width:48px!important;min-width:48px!important;max-width:48px!important}

      /* UI ONLY — tanggal tidak freeze, semua tanggal putih, saldo Kas Besar ukuran normal. */
      body.page-arus-kas .ak2-ledger-card .ak2-table thead th:first-child,
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td:first-child{
        position:static!important;
        left:auto!important;
        z-index:auto!important;
        box-shadow:none!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td:first-child,
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr.ak2-date-start td:first-child{
        color:#f5f7fa!important;
        background:transparent!important;
        font-size:inherit!important;
        font-weight:800!important;
        text-shadow:none!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td:nth-child(7){
        font-size:inherit!important;
        font-weight:800!important;
        letter-spacing:normal!important;
        text-shadow:none!important;
      }

      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc{color:#d9b7b7!important}
      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc .ak2-wallet-route-main,
      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc .ak2-wallet-route-sub{color:#d9a1a1!important}

      @media(max-width:1200px){
        body.page-arus-kas .ak2-ledger-card .ak2-table{min-width:960px!important}
        body.page-arus-kas .ak2-wallet-route-main{font-size:12px}
        body.page-arus-kas .ak2-wallet-route-sub{font-size:9.5px}
        body.page-arus-kas .ak2-ledger-card .ak2-table thead th{font-size:11px!important}
      }
    `;
    document.head.appendChild(s);
  }

  installStyle();
  compactHeaders();
  const body=document.getElementById("ak2LedgerBody");
  if(body) new MutationObserver(()=>scheduleDecorate()).observe(body,{childList:true,subtree:false});
  document.addEventListener("erp:finance-ready",scheduleDecorate);
  scheduleDecorate();
})();
