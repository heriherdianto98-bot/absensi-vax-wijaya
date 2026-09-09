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

    function ensureGlobalNotifications(){
        if(window.ERPGlobalNotifications || document.querySelector('script[data-erp-thc-notif]')) return;
        const s=document.createElement('script');
        s.src='../js/modules/erp-global-notifications.js?v=20260909-1';
        s.async=false;
        s.dataset.erpThcNotif='1';
        document.head.appendChild(s);
    }

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${TABLE_ID} tbody td:nth-child(2){
                cursor:pointer;
            }

            #${TABLE_ID} tbody tr{
                transition:filter .16s ease, opacity .16s ease;
            }

            /*
               Pulse ditempel ke TR (filter/brightness), bukan background TD.
               Background beberapa cell Tabel Harian memakai !important,
               sehingga animasi background sebelumnya tertimpa dan tidak terlihat.
            */
            #${TABLE_ID} tbody tr.thc-row-focus{
                animation:thcRowFocusPulse 1.05s ease-in-out infinite !important;
            }

            #${TABLE_ID} tbody tr.thc-row-focus > td{
                border-top:1px solid rgba(244,196,61,.75) !important;
                border-bottom:1px solid rgba(244,196,61,.75) !important;
            }

            #${TABLE_ID} tbody tr.thc-row-focus > td:first-child{
                box-shadow:inset 4px 0 0 #f4c43d !important;
            }

            #${TABLE_ID} tbody tr.thc-row-focus > td:nth-child(1),
            #${TABLE_ID} tbody tr.thc-row-focus > td:nth-child(2){
                background:#27271f !important;
            }

            @keyframes thcRowFocusPulse{
                0%,100%{
                    filter:brightness(1) saturate(1);
                    opacity:1;
                }
                50%{
                    filter:brightness(1.38) saturate(1.35);
                    opacity:.86;
                }
            }

            @media (prefers-reduced-motion: reduce){
                #${TABLE_ID} tbody tr.thc-row-focus{
                    animation:none !important;
                    filter:brightness(1.18) saturate(1.15);
                }
            }
        `;
        document.head.appendChild(style);
    }

    function clearFocus(table){
        table?.querySelectorAll("tbody tr.thc-row-focus").forEach(tr => tr.classList.remove("thc-row-focus"));
    }

    function bind(){
        ensureGlobalNotifications();
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
