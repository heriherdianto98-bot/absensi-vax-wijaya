/* ARUS KAS V2 — LEDGER HEADER ORBIT UI ONLY
   Efek orbit halus di garis bawah header Buku Arus Kas.
   Tidak mengubah engine, data, query, formula, saldo, atau workflow.
*/
"use strict";

(function(){
  if(window.__ak2LedgerHeaderOrbitUiInstalled)return;
  window.__ak2LedgerHeaderOrbitUiInstalled=true;

  const style=document.createElement("style");
  style.id="ak2LedgerHeaderOrbitUiStyle";
  style.textContent=`
    body.page-arus-kas .ak2-ledger-card .ak2-table thead{
      position:relative!important;
      overflow:visible!important;
    }
    body.page-arus-kas .ak2-ledger-card .ak2-table thead::after{
      content:"";
      position:absolute;
      left:0;
      bottom:-1px;
      width:88px;
      height:2px;
      border-radius:999px;
      pointer-events:none;
      z-index:40;
      background:linear-gradient(90deg,transparent 0%,rgba(255,204,92,.28) 18%,#ffd36b 48%,#fff0b2 58%,rgba(255,204,92,.28) 82%,transparent 100%);
      box-shadow:0 0 5px rgba(255,202,89,.62),0 0 11px rgba(255,187,62,.30);
      animation:ak2HeaderOrbitSweep 7.5s linear infinite;
      will-change:transform;
    }
    @keyframes ak2HeaderOrbitSweep{
      0%{transform:translateX(-92px);opacity:.45}
      8%{opacity:1}
      92%{opacity:1}
      100%{transform:translateX(calc(100vw - 250px));opacity:.45}
    }
    @media(prefers-reduced-motion:reduce){
      body.page-arus-kas .ak2-ledger-card .ak2-table thead::after{animation:none;display:none}
    }
  `;
  document.head.appendChild(style);
})();
