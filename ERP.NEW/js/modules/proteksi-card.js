/*
=========================================================
VAX ERP — PROTEKSI CARD BINDER
=========================================================
UI consumer only.
Source: DashboardEngine.rawData -> ProteksiEngine.
Card mengikuti filter aktif Tabel Harian (tanggal + cabang).
=========================================================
*/
"use strict";

(function(){
    const CARD_ID = "thcProteksiCard";
    const VALUE_ID = "thcTotProteksi";
    let subscribed = false;

    function rupiah(value){
        const n = Number(value || 0);
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Number.isFinite(n) ? n : 0);
    }

    function ensureCard(){
        const grid = document.querySelector("#thcTotals .thc-totals-grid");
        if(!grid) return null;

        let card = document.getElementById(CARD_ID);
        if(card) return card;

        card = document.createElement("div");
        card.id = CARD_ID;
        card.className = "thc-tot-item is-proteksi is-explained";
        card.innerHTML = `
            <span>Proteksi Capster</span>
            <strong id="${VALUE_ID}">Rp0</strong>
            <em class="thc-tot-desc">Otomatis dari Cash Out: protek / proteksi / protect</em>
        `;
        grid.appendChild(card);
        return card;
    }

    function render(){
        if(typeof DashboardEngine === "undefined") return;
        if(typeof ProteksiEngine === "undefined") return;

        ensureCard();
        const valueEl = document.getElementById(VALUE_ID);
        if(!valueEl) return;

        const summary = ProteksiEngine.summarizeRows(DashboardEngine.rawData || []);
        valueEl.textContent = rupiah(summary.total);
        valueEl.dataset.value = String(Number(summary.total || 0));

        const card = document.getElementById(CARD_ID);
        if(card){
            card.title = `${summary.details.length} baris Cash Out mengandung proteksi pada periode aktif`;
        }
    }

    function bind(){
        if(typeof DashboardEngine === "undefined" || typeof DashboardEngine.subscribe !== "function"){
            setTimeout(bind, 100);
            return;
        }
        if(typeof ProteksiEngine === "undefined"){
            setTimeout(bind, 100);
            return;
        }

        ensureCard();
        render();

        if(!subscribed){
            subscribed = true;
            DashboardEngine.subscribe((event) => {
                if(event === "loaded" || event === "calculated") render();
            });
        }
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", bind, { once: true });
    }else{
        bind();
    }
})();
