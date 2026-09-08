/*
=========================================================
VAX ERP — ARUS KAS V2 WALLET ROUTE LABEL UI
UI / presentation only. Tidak mengubah engine, data, formula, query,
wallet balance, source of truth, ataupun workflow transaksi.

Tujuan:
- Setiap nominal yang tampil di Buku Arus Kas mempunyai petunjuk jelas
  sumber wallet -> tujuan wallet.
- Berlaku untuk akun Owner dan SVP.
- Tidak menambah kolom baru; rute wallet ditampilkan di kolom keterangan
  pemasukan / pengeluaran yang sudah ada.
- Label dibuat ringkas agar tabel tetap muat dalam 1 pandangan dan tidak
  melebar hanya karena keterangan rute wallet.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__walletRouteUiInstalled) return;
  flow.__walletRouteUiInstalled=true;

  let decorateQueued=false;

  const WALLET_LABELS={
    EXTERNAL:"Ext",
    KAS_BESAR:"Besar",
    DANA_PRODUK:"Produk",
    KAS_DENDA:"Denda",
    PIUTANG_SETORAN:"P.Setoran",
    PIUTANG_DENDA:"P.Denda"
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

  function fullWalletLabel(value){
    const key=String(value||"").trim().toUpperCase();
    const full={
      EXTERNAL:"Eksternal",
      KAS_BESAR:"Kas Besar",
      DANA_PRODUK:"Dana Produk",
      KAS_DENDA:"Kas Denda",
      PIUTANG_SETORAN:"Piutang Setoran",
      PIUTANG_DENDA:"Piutang Denda"
    };
    return full[key]||walletLabel(value);
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

  function compactPeriod(row){
    const md=row?.metadata||{};
    const a=parseDateOnly(row?.source_period_start||md.period_start||md.source_period_start);
    const b=parseDateOnly(row?.source_period_end||md.period_end||md.source_period_end);
    if(!a||!b) return "";
    if(a.y===b.y&&a.m===b.m){
      if(a.d===b.d) return `${String(a.d).padStart(2,"0")} ${MONTHS[a.m-1]}`;
      return `${String(a.d).padStart(2,"0")}–${String(b.d).padStart(2,"0")} ${MONTHS[b.m-1]}`;
    }
    return `${String(a.d).padStart(2,"0")} ${MONTHS[a.m-1]}–${String(b.d).padStart(2,"0")} ${MONTHS[b.m-1]}`;
  }

  function compactDescription(row){
    const desc=String(row?.description||flow.categoryName?.(row?.category)||"Transaksi").trim();
    const period=compactPeriod(row);
    const category=String(row?.category||"").toUpperCase();

    if(category==="SETORAN_3_HARIAN"){
      if(/^koreksi\s+setoran/i.test(desc)) return period?`Koreksi Setoran ${period}`:"Koreksi Setoran";
      return period?`Setoran ${period}`:"Setoran";
    }
    if(category==="TRANSFER_DANA_PRODUK") return period?`Nett Produk ${period}`:"Nett Produk";

    return desc;
  }

  function routeText(row){
    const from=walletLabel(row?.from_wallet);
    const to=walletLabel(row?.to_wallet);
    const desc=compactDescription(row);
    return `${from}→${to} · ${desc}`;
  }

  function fullRouteText(row){
    const from=fullWalletLabel(row?.from_wallet);
    const to=fullWalletLabel(row?.to_wallet);
    const desc=String(row?.description||flow.categoryName?.(row?.category)||"Transaksi").trim();
    return `${from} → ${to} · ${desc}`;
  }

  function setDescription(cell,text,row){
    if(!cell) return;
    const deleted=typeof flow.isDeleteInactive==="function" && flow.isDeleteInactive(row);
    cell.textContent="";
    const span=document.createElement("span");
    span.className=deleted
      ? "ak2-wallet-route ak2-deleted-history-text ak2-deleted-desc"
      : "ak2-wallet-route";
    span.textContent=text;
    span.title=fullRouteText(row);
    cell.appendChild(span);
    cell.title=fullRouteText(row);
  }

  function decorateRows(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;

    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);
      if(!row) return;
      const c=findLedgerCells(tr);
      const text=routeText(row);

      if(hasNominal(c.masuk)) setDescription(c.ketMasuk,text,row);
      if(hasNominal(c.keluar)) setDescription(c.ketKeluar,text,row);
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
        display:block;
        width:100%;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:#e6edf4;
        font-weight:700;
        line-height:1.15;
      }

      /* UI ONLY — ledger lebih rapat untuk audit satu layar. */
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td{
        padding-top:4px!important;
        padding-bottom:4px!important;
        padding-left:10px!important;
        padding-right:10px!important;
        line-height:1.12!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr{
        height:40px!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table thead th{
        padding-top:10px!important;
        padding-bottom:10px!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-source,
      body.page-arus-kas .ak2-ledger-card .ak2-status{
        min-height:28px!important;
        padding:4px 10px!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-ledger-edit-icon{
        width:30px!important;
        height:30px!important;
        font-size:15px!important;
      }

      body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(4),
      body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(6){
        width:215px!important;
        min-width:215px!important;
        max-width:215px!important;
        overflow:hidden!important;
      }
      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc{
        color:#d9b7b7!important;
      }
      @media(max-width:1200px){
        body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(4),
        body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(6){
          width:190px!important;
          min-width:190px!important;
          max-width:190px!important;
        }
        body.page-arus-kas .ak2-ledger-card .ak2-table tbody td{
          padding-top:3px!important;
          padding-bottom:3px!important;
          padding-left:8px!important;
          padding-right:8px!important;
        }
        body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr{
          height:38px!important;
        }
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
