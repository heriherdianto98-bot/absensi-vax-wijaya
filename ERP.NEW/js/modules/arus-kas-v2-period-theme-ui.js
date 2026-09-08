/* ARUS KAS V2 — PERIOD DROPDOWN THEME UI ONLY
   Menyamakan warna dropdown bulan/tahun dengan tema dark-gold ERP.
   Tidak mengubah engine, query, formula, periode, atau data flow.
*/
"use strict";

(function(){
  if(document.getElementById("ak2PeriodThemeUiStyle")) return;
  const style=document.createElement("style");
  style.id="ak2PeriodThemeUiStyle";
  style.textContent=`
    body.page-arus-kas .ak2-period-select{
      color-scheme:dark;
      background-color:#111820!important;
      background-image:linear-gradient(180deg,#18222d,#10161d)!important;
      border:1px solid #765a27!important;
      color:#f6e7bc!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;
      scrollbar-color:#9b742e #111820;
    }
    body.page-arus-kas .ak2-period-select:hover{
      border-color:#a77c30!important;
      background-image:linear-gradient(180deg,#1d2935,#121922)!important;
    }
    body.page-arus-kas .ak2-period-select:focus{
      border-color:#d1a34b!important;
      box-shadow:0 0 0 2px rgba(209,163,75,.12),inset 0 1px 0 rgba(255,255,255,.04)!important;
      outline:none!important;
    }
    body.page-arus-kas .ak2-period-select option{
      background:#151d26!important;
      color:#edf2f6!important;
      font-weight:700;
    }
    body.page-arus-kas .ak2-period-select option:checked{
      background:#5a431a!important;
      color:#ffe09a!important;
    }
  `;
  document.head.appendChild(style);
})();
