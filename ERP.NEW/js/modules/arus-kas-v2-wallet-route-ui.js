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

  function routeText(row){
    const from=walletLabel(row?.from_wallet);
    const to=walletLabel(row?.to_wallet);
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
    cell.appendChild(span);
    cell.title=text;
  }

  function decorateRows(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;

    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);
      if(!row) return;
      const c=findLedgerCells(tr);
      const text=routeText(row);

      /* Ikuti kolom nominal yang benar-benar tampil agar UI tetap sesuai
         presentasi ledger existing, termasuk transfer internal. */
      if(hasNominal(c.masuk)){
        setDescription(c.ketMasuk,text,row);
      }
      if(hasNominal(c.keluar)){
        setDescription(c.ketKeluar,text,row);
      }
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
        display:inline;
        color:#e6edf4;
        font-weight:700;
        line-height:1.25;
      }
      body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(4),
      body.page-arus-kas #ak2LedgerBody tr[data-id] td:nth-child(6){
        min-width:220px;
      }
      body.page-arus-kas .ak2-wallet-route.ak2-deleted-desc{
        color:#d9b7b7!important;
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
