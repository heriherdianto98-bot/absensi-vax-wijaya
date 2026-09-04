/*
=========================================================
VAX ERP — PROTEKSI CARD BINDER + DRILLDOWN
=========================================================
UI consumer only.
Canonical source: DailyDataEngine -> daily_recap_source.keterangan_cash_out
Rule keyword: protek / proteksi / protect.

Drilldown Owner:
- Klik card Proteksi Capster membuka popup rincian.
- Menampilkan tanggal, cabang, provider/capster, nominal.
- Read-only, tidak mengubah Cash Out atau formula core.
=========================================================
*/
"use strict";

(function(){
    const VALUE_ID = "thcTotProteksi";
    const MODAL_ID = "thcProteksiDrilldownModal";
    let subscribed = false;
    let renderSeq = 0;
    let legacyPatched = false;
    let lastSummary = null;

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

    function cardEl(){
        return document.getElementById(VALUE_ID)?.closest(".thc-tot-item") || null;
    }

    function ensureCardInteractive(){
        const card = cardEl();
        if(!card) return;
        card.classList.add("is-link");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", "Buka rincian Proteksi Capster");
        card.title = "Klik untuk lihat rincian Proteksi Capster per cabang dan provider";
        const desc = card.querySelector(".thc-share-desc");
        if(desc) desc.textContent = "Klik untuk lihat cabang, provider/capster, dan nominal proteksi";
    }

    function providerFromRaw(raw){
        return String(raw || "")
            .replace(/\b(?:protek(?:si)?|protect)\b\s*/i, "")
            .replace(/Rp\s*[\d.]+/ig, "")
            .replace(/\s*[-–:]\s*$/g, "")
            .replace(/\s{2,}/g, " ")
            .trim() || "—";
    }

    function flattenDetails(summary){
        const rows = [];
        for(const group of (summary?.details || [])){
            for(const item of (group.items || [])){
                rows.push({
                    tanggal: group.tanggal || "—",
                    cabang: group.nama_cabang || (group.cabang_id ? `Cabang #${group.cabang_id}` : "—"),
                    provider: providerFromRaw(item.raw),
                    nominal: Number(item.nominal || 0),
                    raw: item.raw || ""
                });
            }
        }
        return rows.sort((a,b) => String(a.tanggal).localeCompare(String(b.tanggal)) || String(a.cabang).localeCompare(String(b.cabang)));
    }

    function ensureModal(){
        let modal = document.getElementById(MODAL_ID);
        if(modal) return modal;

        const style = document.createElement("style");
        style.textContent = `
            #${MODAL_ID}[hidden]{display:none!important}
            #${MODAL_ID}{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px}
            #${MODAL_ID} .pc-backdrop{position:absolute;inset:0;background:rgba(2,6,12,.78);backdrop-filter:blur(3px)}
            #${MODAL_ID} .pc-panel{position:relative;width:min(920px,96vw);max-height:82vh;overflow:hidden;border:1px solid rgba(245,158,11,.45);border-radius:16px;background:#0c131d;box-shadow:0 24px 80px rgba(0,0,0,.45);color:#eaf0f7}
            #${MODAL_ID} .pc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(245,158,11,.24)}
            #${MODAL_ID} .pc-head h3{margin:0;font-size:18px;color:#fdba74}
            #${MODAL_ID} .pc-head p{margin:3px 0 0;color:#9fb0c3;font-size:12px}
            #${MODAL_ID} .pc-close{width:38px;height:38px;border-radius:10px;border:1px solid #344254;background:#172231;color:#fff;font-size:22px;cursor:pointer}
            #${MODAL_ID} .pc-total{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:rgba(245,158,11,.07);border-bottom:1px solid rgba(245,158,11,.18)}
            #${MODAL_ID} .pc-total strong{font-size:22px;color:#fdba74}
            #${MODAL_ID} .pc-wrap{max-height:58vh;overflow:auto}
            #${MODAL_ID} table{width:100%;border-collapse:collapse;font-size:13px}
            #${MODAL_ID} th{position:sticky;top:0;background:#111b27;color:#f7c65b;text-align:left;padding:11px 14px;border-bottom:1px solid #2b3948}
            #${MODAL_ID} td{padding:11px 14px;border-bottom:1px solid #1c2936;vertical-align:top}
            #${MODAL_ID} td:last-child,#${MODAL_ID} th:last-child{text-align:right;white-space:nowrap}
            #${MODAL_ID} .pc-empty{padding:28px;text-align:center;color:#9fb0c3}
            #thcTotals .thc-tot-item.is-proteksi.is-link{cursor:pointer}
            #thcTotals .thc-tot-item.is-proteksi.is-link:hover{transform:translateY(-1px);filter:brightness(1.05)}
        `;
        document.head.appendChild(style);

        modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <div class="pc-backdrop" data-pc-close></div>
            <section class="pc-panel" role="dialog" aria-modal="true" aria-labelledby="pcTitle">
                <div class="pc-head">
                    <div><h3 id="pcTitle">Rincian Proteksi Capster</h3><p id="pcPeriod">—</p></div>
                    <button type="button" class="pc-close" data-pc-close aria-label="Tutup">×</button>
                </div>
                <div class="pc-total"><span>Total Proteksi</span><strong id="pcGrandTotal">Rp0</strong></div>
                <div class="pc-wrap"><div id="pcBody"></div></div>
            </section>`;
        document.body.appendChild(modal);

        modal.addEventListener("click", (e) => {
            if(e.target.closest("[data-pc-close]")) closeModal();
        });
        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && !modal.hidden) closeModal();
        });
        return modal;
    }

    function openModal(){
        const modal = ensureModal();
        const rows = flattenDetails(lastSummary);
        const filter = activeFilter();
        modal.querySelector("#pcPeriod").textContent = filter ? `${filter.start} — ${filter.end}` : "Periode aktif";
        modal.querySelector("#pcGrandTotal").textContent = rupiah(lastSummary?.total || 0);
        const body = modal.querySelector("#pcBody");
        if(!rows.length){
            body.innerHTML = `<div class="pc-empty">Belum ada item proteksi pada periode aktif.</div>`;
        }else{
            body.innerHTML = `<table><thead><tr><th>Tanggal</th><th>Cabang</th><th>Provider / Capster</th><th>Nominal</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.tanggal}</td><td>${r.cabang}</td><td>${r.provider}</td><td>${rupiah(r.nominal)}</td></tr>`).join("")}</tbody></table>`;
        }
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        modal.querySelector(".pc-close")?.focus();
    }

    function closeModal(){
        const modal = document.getElementById(MODAL_ID);
        if(!modal) return;
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        cardEl()?.focus();
    }

    function paint(summary){
        lastSummary = summary || null;
        const valueEl = document.getElementById(VALUE_ID);
        if(!valueEl) return;
        const total = Number(summary?.total || 0);
        valueEl.textContent = rupiah(total);
        valueEl.dataset.value = String(total);
        ensureCardInteractive();
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

        document.addEventListener("click", (e) => {
            const card = e.target.closest("#thcTotals .thc-tot-item.is-proteksi");
            if(card) openModal();
        });
        document.addEventListener("keydown", (e) => {
            if((e.key === "Enter" || e.key === " ") && e.target.closest?.("#thcTotals .thc-tot-item.is-proteksi")){
                e.preventDefault();
                openModal();
            }
        });

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
