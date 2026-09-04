/*
=========================================================
VAX ERP — TABEL HARIAN ROW FOCUS
=========================================================
UI ONLY.
Klik nama cabang pada Tabel Harian -> fokus/kedip satu baris.
Tidak mengubah data, formula, sync, atau source.
=========================================================
*/
"use strict";

(function(){
    const TABLE_ID = "thcTable";
    const STYLE_ID = "thcRowFocusStyle";

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${TABLE_ID} tbody td:nth-child(2){
                cursor:pointer;
            }
            #${TABLE_ID} tbody tr{
                transition:background .16s ease, box-shadow .16s ease, filter .16s ease;
            }
            #${TABLE_ID} tbody tr.thc-row-focus > td{
                animation:thcRowFocusPulse 1.05s ease-in-out infinite;
            }
            #${TABLE_ID} tbody tr.thc-row-focus > td:first-child{
                box-shadow:inset 4px 0 0 #f4c43d !important;
            }
            #${TABLE_ID} tbody tr.thc-row-focus > td:nth-child(1),
            #${TABLE_ID} tbody tr.thc-row-focus > td:nth-child(2){
                background:#27271f !important;
            }
            @keyframes thcRowFocusPulse{
                0%,100%{background:rgba(244,196,61,.055)}
                50%{background:rgba(244,196,61,.20)}
            }
            @media (prefers-reduced-motion: reduce){
                #${TABLE_ID} tbody tr.thc-row-focus > td{
                    animation:none;
                    background:rgba(244,196,61,.16);
                }
            }
        `;
        document.head.appendChild(style);
    }

    function clearFocus(table){
        table?.querySelectorAll("tbody tr.thc-row-focus").forEach(tr => tr.classList.remove("thc-row-focus"));
    }

    function bind(){
        ensureStyle();
        document.addEventListener("click", (event) => {
            const branchCell = event.target.closest?.(`#${TABLE_ID} tbody td:nth-child(2)`);
            if(!branchCell) return;
            const row = branchCell.closest("tr");
            const table = branchCell.closest("table");
            if(!row || !table) return;

            const alreadyFocused = row.classList.contains("thc-row-focus");
            clearFocus(table);
            if(!alreadyFocused) row.classList.add("thc-row-focus");
        });
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once:true });
    else bind();
})();
