/*
=========================================================
VAX ERP — PROTEKSI CARD BINDER
=========================================================
UI consumer only.
Source canonical: DailyDataEngine -> daily_recap_source.keterangan_cash_out
Card mengikuti filter aktif Tabel Harian (tanggal + cabang).

PENTING:
- Jangan hitung hanya dari snapshot DashboardEngine.rawData karena snapshot
  bisa tertinggal dari late Cash Out reconciliation.
- Setiap render mengambil data canonical terbaru lewat ProteksiEngine.load().
=========================================================
*/
"use strict";

(function(){
    const CARD_ID = "thcProteksiCard";
    const VALUE_ID = "thcTotProteksi";
    let subscribed = false;
    let renderSeq = 0;

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

    function activeFilter(){
        if(typeof DashboardEngine === "undefined") return null;
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || start;
        if(!start || !end) return null;

        let cabangId = null;
        if(typeof DashboardEngine.resolveCabangId === "function"){
            cabangId = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
        }

        return { start, end, cabangId };
    }

    function paint(summary){
        ensureCard();
        const valueEl = document.getElementById(VALUE_ID);
        if(!valueEl) return;

        const total = Number(summary?.total || 0);
        valueEl.textContent = rupiah(total);
        valueEl.dataset.value = String(total);

        const card = document.getElementById(CARD_ID);
        if(card){
            const count = Array.isArray(summary?.details) ? summary.details.length : 0;
            card.title = `${count} baris Cash Out mengandung proteksi pada periode aktif`;
        }
    }

    async function render(){
        if(typeof DashboardEngine === "undefined") return;
        if(typeof ProteksiEngine === "undefined") return;

        ensureCard();
        const seq = ++renderSeq;
        const filter = activeFilter();

        try{
            if(filter && typeof ProteksiEngine.load === "function"){
                const fresh = await ProteksiEngine.load({
                    client: (typeof db !== "undefined" ? db : undefined),
                    start: filter.start,
                    end: filter.end,
                    cabangId: filter.cabangId
                });
                if(seq !== renderSeq) return;
                paint(fresh);
                return;
            }
        }catch(err){
            console.warn("[ProteksiCard] fresh canonical load gagal, fallback snapshot:", err);
        }

        if(seq !== renderSeq) return;
        const fallback = ProteksiEngine.summarizeRows(DashboardEngine.rawData || []);
        paint(fallback);
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
