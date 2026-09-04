/*
=========================================================
VAX ERP — PROTEKSI CARD CLICK HINT (UI ONLY)
=========================================================
Menambahkan penanda visual bahwa card Proteksi Capster bisa diklik.
Tidak mengubah data, formula, engine, atau drilldown.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "proteksiCardClickHintStyle";
    const HINT_CLASS = "proteksi-click-hint";

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #thcTotals .thc-tot-item.is-proteksi{
                position:relative;
                cursor:pointer;
                transition:transform .16s ease, filter .16s ease, box-shadow .16s ease;
            }
            #thcTotals .thc-tot-item.is-proteksi .${HINT_CLASS}{
                position:absolute;
                top:10px;
                right:12px;
                display:inline-flex;
                align-items:center;
                gap:5px;
                color:#fdba74;
                font-size:10px;
                font-weight:800;
                letter-spacing:.04em;
                opacity:.88;
                pointer-events:none;
                white-space:nowrap;
            }
            #thcTotals .thc-tot-item.is-proteksi .${HINT_CLASS} .proteksi-click-icon{
                display:inline-flex;
                width:20px;
                height:20px;
                align-items:center;
                justify-content:center;
                border:1px solid rgba(251,146,60,.38);
                border-radius:7px;
                background:rgba(194,65,12,.10);
                font-size:13px;
                line-height:1;
            }
            @media (hover:hover) and (pointer:fine){
                #thcTotals .thc-tot-item.is-proteksi:hover{
                    transform:translateY(-1px);
                    filter:brightness(1.06);
                    box-shadow:inset 3px 0 0 #c2410c, 0 0 22px rgba(194,65,12,.12);
                }
                #thcTotals .thc-tot-item.is-proteksi:hover .${HINT_CLASS}{opacity:1}
            }
            #thcTotals .thc-tot-item.is-proteksi:focus-visible{
                outline:2px solid rgba(253,186,116,.85);
                outline-offset:2px;
            }
        `;
        document.head.appendChild(style);
    }

    function apply(){
        const card = document.getElementById("thcTotProteksi")?.closest(".thc-tot-item");
        if(!card) return false;
        if(!card.querySelector(`.${HINT_CLASS}`)){
            const hint = document.createElement("span");
            hint.className = HINT_CLASS;
            hint.setAttribute("aria-hidden", "true");
            hint.innerHTML = `<span class="proteksi-click-icon">↗</span><span>DETAIL</span>`;
            card.appendChild(hint);
        }
        card.title = "Klik untuk lihat detail Proteksi Capster";
        return true;
    }

    function boot(){
        ensureStyle();
        if(apply()) return;
        const observer = new MutationObserver(() => {
            if(apply()) observer.disconnect();
        });
        observer.observe(document.body, { childList:true, subtree:true });
        setTimeout(() => observer.disconnect(), 15000);
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
    else boot();
})();
