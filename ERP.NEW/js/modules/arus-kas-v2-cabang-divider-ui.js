/* ARUS KAS V2 — CABANG ROW DIVIDER UI ONLY
   Memulihkan garis pembatas horizontal pada kolom Cabang setelah sticky/freeze lama dihapus.
   Tidak mengubah engine, data, formula, query, saldo, atau workflow.
*/
"use strict";

(function(){
  if(document.getElementById("ak2CabangDividerUiStyle")) return;
  const style=document.createElement("style");
  style.id="ak2CabangDividerUiStyle";
  style.textContent=`
    body.page-arus-kas .ak2-ledger-card #ak2LedgerBody td.ak2-cabang-col{
      position:relative!important;
      border-bottom:0!important;
      box-shadow:inset 0 -1px 0 rgba(76,101,126,.44)!important;
    }
    body.page-arus-kas .ak2-ledger-card #ak2LedgerBody td.ak2-cabang-col::after{
      content:"";
      position:absolute;
      left:0;
      right:0;
      bottom:0;
      height:1px;
      background:rgba(76,101,126,.44);
      pointer-events:none;
      z-index:3;
    }
    @media print{
      body.page-arus-kas .ak2-ledger-card #ak2LedgerBody td.ak2-cabang-col::after{display:none!important}
    }
  `;
  document.head.appendChild(style);
})();
