/*
=========================================================
VAX ERP — ARUS KAS V2 WALLET ROUTE LABEL UI
UI / presentation only. Tidak mengubah engine, data, formula, query,
wallet balance, source of truth, ataupun workflow transaksi.

Tujuan:
- Setiap nominal di Buku Arus Kas punya petunjuk sumber/tujuan yang jelas.
- Tampilan dibuat sederhana 2 baris dalam kolom keterangan yang sama.
- AUTO: baris 1 "Auto", baris 2 jenis/periode transaksi.
- MANUAL: baris 1 wallet asal ke wallet tujuan, baris 2 keterangan kecil.
- Berlaku untuk akun Owner dan SVP tanpa menambah kolom baru.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__walletRouteUiInstalled) return;
  flow.__walletRouteUiInstalled=true;

  let decorateQueued=false;

  const WALLET_LABELS={
    EXTERNAL:"Luar",
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

  function cleanManualDescription(row){
    let desc=String(row?.description||flow.categoryName?.(row?.category)||"Transaksi").trim();
    desc=desc.replace(/^setoran\s+/i,"Setoran ");
    return desc;
  }

  function autoSecondLine(row){
    const category=String(row?.category||"").toUpperCase();
    const period=periodLabel(row);
    if(category==="SETORAN_3_HARIAN"){
      const correction=/^koreksi\s+setoran/i.test(String(row?.description||""));
      return `${correction?"Koreksi setoran":"Setoran"}${period?` ${period}`:""}`;
    }
    if(category==="TRANSFER_DANA_PRODUK"){
      return `Nett Produk${period?` ${period}`:""}`;
    }
    const desc=cleanManualDescription(row);
    return period && !desc.toLowerCase().includes(period.toLowerCase()) ? `${desc} ${period}` : desc;
  }

  function labelParts(row){
    const isAuto=String(row?.entry_type||"").toUpperCase()==="AUTO";
    if(isAuto){
      return {primary:"Auto",secondary:autoSecondLine(row)};
    }

    const from=walletLabel(row?.from_wallet);
    const to=walletLabel(row?.to_wallet);
    return {
      primary:`${from} ke ${to}`,
      secondary:`(${cleanManualDescription(row)})`
    };
  }

  function fullRouteText(row){
    const from=walletLabel(row?.from_wallet);
    const to=walletLabel(row?.to_wallet);
    const desc=String(row?.description||flow.categoryName?.(row?.category)||"Transaksi").trim();
    return `${from} ke ${to} · ${desc}`;
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
    wrap.title=fullRouteText(row);
    cell.appendChild(wrap);
    cell.title=fullRouteText(row);
  }

  function decorateRows(){
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

      /* UI ONLY — tetap rapat meskipun keterangan 2 baris. */
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td{
        padding-top:3px!important;
        padding-bottom:3px!important;
        padding-left:9px!important;
        padding-right:9px!important;
        line-height:1.08!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr{
        height:40px!important;
      }
      body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(4),
      body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(6){
        width:185px!important;
        min-width:185px!important;
        max-width:185px!important;
        overflow:hidden!important;
      }
      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc{
        color:#d9b7b7!important;
      }
      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc .ak2-wallet-route-main,
      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc .ak2-wallet-route-sub{
        color:#d9a1a1!important;
      }
      @media(max-width:1200px){
        body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(4),
        body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(6){
          width:170px!important;
          min-width:170px!important;
          max-width:170px!important;
        }
        body.page-arus-kas .ak2-wallet-route-main{font-size:12px}
        body.page-arus-kas .ak2-wallet-route-sub{font-size:9.5px}
      }
    `;
    document.head.appendChild(s);
  }

  installStyle();
  const body=document.getElementById("ak2LedgerBody");
  if(body) new MutationObserver(()=>scheduleDecorate()).observe(body,{childList:true,subtree:false});
  document.addEventListener("erp:finance-ready",scheduleDecorate);
  scheduleDecorate();
})();
