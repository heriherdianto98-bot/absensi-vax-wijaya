/*
=========================================================
VAX ERP — PROTEKSI CARD BINDER
=========================================================
UI consumer only.
Canonical source: DailyDataEngine -> daily_recap_source.keterangan_cash_out
Rule keyword: protek / proteksi / protect.

Important:
- Existing TabelHarianShareCards historically owned the same card/value id.
- Patch its proteksi parser so both old presenter and canonical binder agree.
=========================================================
*/
"use strict";

(function(){
    const VALUE_ID = "thcTotProteksi";
    let subscribed = false;
    let renderSeq = 0;
    let legacyPatched = false;

    function rupiah(value){
        const n = Number(value || 0);
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Number.isFinite(n) ? n : 0);
    }

    function patchLegacyPresenter(){
        if(legacyPatched) return true;
        if(typeof TabelHarianShareCards === "undefined") return false;
        if(typeof ProteksiEngine === "undefined") return false;

        TabelHarianShareCards.proteksiFromKeterangan = function(rawText){
            return ProteksiEngine.parseCashOutDetail(rawText)
                .filter((item) => item.isProteksi && Number(item.nominal || 0) > 0)
                .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
        };

        const card = document.getElementById(VALUE_ID)?.closest(".thc-tot-item");
        const desc = card?.querySelector(".thc-share-desc");
        if(desc) desc.textContent = "Akumulasi Cash Out: PROTEK / PROTEKSI / PROTECT pada periode aktif";

        legacyPatched = true;
        return true;
    }

    function activeFilter(){
        if(typeof DashboardEngine === "undefined") return null;
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || start;
        if(!start || !end) return null;

        const cabangId = typeof DashboardEngine.resolveCabangId === "function"
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;
        return { start, end, cabangId };
    }

    function paint(summary){
        const valueEl = document.getElementById(VALUE_ID);
        if(!valueEl) return;
        const total = Number(summary?.total || 0);
        valueEl.textContent = rupiah(total);
        valueEl.dataset.value = String(total);
    }

    async function render(){
        if(typeof DashboardEngine === "undefined" || typeof ProteksiEngine === "undefined") return;
        patchLegacyPresenter();
        const filter = activeFilter();
        if(!filter) return;

        const seq = ++renderSeq;
        try{
            const fresh = await ProteksiEngine.load({
                client: (typeof db !== "undefined" ? db : undefined),
                start: filter.start,
                end: filter.end,
                cabangId: filter.cabangId
            });
            if(seq !== renderSeq) return;
            paint(fresh);
        }catch(err){
            console.warn("[ProteksiCard] canonical load gagal:", err);
        }
    }

    function bind(){
        if(typeof DashboardEngine === "undefined" || typeof DashboardEngine.subscribe !== "function" || typeof ProteksiEngine === "undefined"){
            setTimeout(bind, 100);
            return;
        }

        const patchTimer = setInterval(() => {
            if(patchLegacyPresenter()){
                clearInterval(patchTimer);
                if(typeof TabelHarianShareCards !== "undefined" && typeof TabelHarianShareCards.refresh === "function"){
                    TabelHarianShareCards.refresh();
                }
                setTimeout(render, 50);
            }
        }, 100);

        render();

        if(!subscribed){
            subscribed = true;
            DashboardEngine.subscribe((event) => {
                if(event === "loaded" || event === "calculated") render();
            });
        }

        document.addEventListener("change", (e) => {
            if(e.target?.id === "branchFilter" || e.target?.id === "periodFilter"){
                setTimeout(render, 150);
            }
        });
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", bind, { once: true });
    }else{
        bind();
    }
})();
