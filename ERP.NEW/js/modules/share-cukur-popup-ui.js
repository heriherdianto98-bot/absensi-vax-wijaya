/*
=========================================================
VAX ERP — Share Cukur Popup UI Enhancement
=========================================================
UI ONLY.
- Header tabel dibuat sticky/opaque agar tidak bertabrakan saat scroll.
- Nama cabang/provider dan total share diperbesar agar mudah dibaca.
- Klik nama memberi fokus kedip pada baris.
- Scrollbar mengikuti tema dark/teal ERP.
Tidak mengubah data, query, formula, atau drilldown source.
=========================================================
*/
"use strict";

(function(){
    const MODAL_ID = "thcShareCukurDrilldownModal";
    const STYLE_ID = "thcShareCukurPopupUiStyles";

    function ensureStyles(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${MODAL_ID} .sc-wrap{
                position:relative;
                isolation:isolate;
                scrollbar-width:thin;
                scrollbar-color:#14b8a6 #111b27;
            }
            #${MODAL_ID} .sc-wrap::-webkit-scrollbar{
                width:10px;
                height:10px;
            }
            #${MODAL_ID} .sc-wrap::-webkit-scrollbar-track{
                background:#111b27;
                border-left:1px solid rgba(45,212,191,.10);
            }
            #${MODAL_ID} .sc-wrap::-webkit-scrollbar-thumb{
                background:linear-gradient(180deg,#1f8f86,#14b8a6);
                border:2px solid #111b27;
                border-radius:999px;
            }
            #${MODAL_ID} .sc-wrap::-webkit-scrollbar-thumb:hover{
                background:#2dd4bf;
            }

            /* Sticky header untuk semua level popup: Cabang, Provider, dan Detail Harian. */
            #${MODAL_ID} table{
                border-collapse:separate !important;
                border-spacing:0 !important;
                position:relative;
            }
            #${MODAL_ID} table thead{
                position:relative;
                z-index:40;
            }
            #${MODAL_ID} table thead th{
                position:sticky !important;
                top:0 !important;
                z-index:50 !important;
                background:#111b27 !important;
                background-clip:padding-box !important;
                box-shadow:0 1px 0 #2b3948, 0 8px 16px rgba(2,6,12,.20);
            }
            #${MODAL_ID} table thead th:first-child{
                font-size:16px !important;
                font-weight:900 !important;
                letter-spacing:.035em;
                color:#f8fafc !important;
                text-transform:uppercase;
            }
            #${MODAL_ID} table thead th:last-child{
                font-size:16px !important;
                font-weight:900 !important;
                letter-spacing:.035em;
                color:#5eead4 !important;
                text-transform:uppercase;
            }

            /* Isi utama dibuat sedikit lebih besar supaya scan per cabang/provider cepat. */
            #${MODAL_ID} tbody tr > td{
                position:relative;
                z-index:1;
                background:#0c131d;
            }
            #${MODAL_ID} tbody tr:nth-child(even) > td{
                background:#0d1621;
            }
            #${MODAL_ID} tbody tr > td:first-child{
                font-size:15.5px;
                font-weight:800;
                color:#e5edf6;
                cursor:pointer;
            }
            #${MODAL_ID} tbody tr > td:last-child{
                font-size:15.5px !important;
                font-weight:900 !important;
                color:#5eead4 !important;
            }
            #${MODAL_ID} .sc-branch-btn{
                font-size:16px !important;
                font-weight:900 !important;
                color:#5eead4 !important;
            }
            #${MODAL_ID} .sc-provider-btn{
                font-size:15.5px !important;
                font-weight:900 !important;
            }

            #${MODAL_ID} tbody tr{
                position:relative;
                transition:background .16s ease, box-shadow .16s ease;
            }
            #${MODAL_ID} tbody tr:hover > td{
                background:rgba(20,184,166,.075);
            }
            #${MODAL_ID} tbody tr.sc-row-focus > td{
                animation:scRowFocusPulse 1.05s ease-in-out infinite;
            }
            #${MODAL_ID} tbody tr.sc-row-focus > td:first-child{
                box-shadow:inset 3px 0 0 #2dd4bf;
            }
            @keyframes scRowFocusPulse{
                0%,100%{ background:rgba(20,184,166,.06); }
                50%{ background:rgba(45,212,191,.18); }
            }
        `;
        document.head.appendChild(style);
    }

    function clearFocus(modal){
        modal?.querySelectorAll("tr.sc-row-focus").forEach(tr => tr.classList.remove("sc-row-focus"));
    }

    function bindModal(modal){
        if(!modal || modal.dataset.scUiBound === "1") return;
        modal.dataset.scUiBound = "1";

        modal.addEventListener("click", (e) => {
            const td = e.target.closest("tbody td:first-child");
            if(!td) return;
            const tr = td.closest("tr");
            if(!tr) return;
            clearFocus(modal);
            tr.classList.add("sc-row-focus");
        });
    }

    function boot(){
        ensureStyles();
        const existing = document.getElementById(MODAL_ID);
        if(existing) bindModal(existing);

        const observer = new MutationObserver(() => {
            const modal = document.getElementById(MODAL_ID);
            if(modal) bindModal(modal);
        });
        observer.observe(document.documentElement, { childList:true, subtree:true });
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
    else boot();
})();
