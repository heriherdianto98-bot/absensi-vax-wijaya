/*
=========================================================
ERP VAX — TABEL HARIAN NEGATIVE VALUE HIGHLIGHT
=========================================================
UI ONLY.
- Nilai uang negatif pada tbody Tabel Harian diberi warna merah.
- Tidak mengubah data, formula, render source, export, print, atau database.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcNegativeValueStyle";
    const NEG_CLASS = "thc-is-negative";

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #thcTable tbody td.${NEG_CLASS}{
                color:#ff5b5b !important;
                font-weight:800 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function isNegativeMoneyText(text){
        const s = String(text || "").replace(/\s+/g, " ").trim();
        if(!s) return false;
        // Format aktif bisa "-Rp 58.000" atau "Rp -58.000".
        return /^-\s*Rp\b/i.test(s) || /^Rp\s*-\s*[\d.]/i.test(s);
    }

    function paint(){
        const tbody = document.getElementById("thcTbody");
        if(!tbody) return;
        tbody.querySelectorAll("td.thc-num").forEach((td) => {
            td.classList.toggle(NEG_CLASS, isNegativeMoneyText(td.textContent));
        });
    }

    function boot(){
        ensureStyle();
        paint();
        const tbody = document.getElementById("thcTbody");
        if(!tbody) return;
        const observer = new MutationObserver(() => paint());
        observer.observe(tbody, { childList:true, subtree:true, characterData:true });
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
    else boot();
})();
