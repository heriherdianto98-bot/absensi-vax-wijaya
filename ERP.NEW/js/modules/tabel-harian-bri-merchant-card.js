/*
=========================================================
VAX ERP — TABEL HARIAN BRI MERCHANT TOTAL CARD
=========================================================
READ ONLY presenter.
Canonical source: public.bri_merchant_daily.bri_non_cash_actual

Flow:
1. Card BRI Merchant = total periode/filter aktif.
2. Klik card -> rincian total per cabang.
3. Klik cabang -> rincian tanggal + nominal BRI Merchant.

PENTING:
- TIDAK mengubah DailyDataEngine
- TIDAK mengubah SetoranMoneyEngine
- TIDAK mengubah rowFromEngine / computeTotals / rumus Tabel Harian
- TIDAK mengubah tabel public.bri_merchant_daily
=========================================================
*/
"use strict";

(function(){
    const VALUE_ID = "thcTotBriMerchant";
    const CARD_ID = "thcCardBriMerchant";
    const MODAL_ID = "thcBriMerchantCardModal";
    const STYLE_ID = "thcBriMerchantCardStyle";

    let rows = [];
    let seq = 0;
    let patched = false;
    let gridObserver = null;

    function esc(value){
        return String(value ?? "")
            .replace(/&/g,"&amp;")
            .replace(/</g,"&lt;")
            .replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;")
            .replace(/'/g,"&#039;");
    }

    function rupiah(value){
        const n = Number(value || 0);
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Number.isFinite(n) ? n : 0);
    }

    function shortName(name){
        return String(name || "—")
            .replace(/^vax\s+wijaya\s+/i, "")
            .replace(/^vaxwijaya\s+/i, "")
            .trim() || "—";
    }

    function branchMap(){
        const map = new Map();
        if(typeof DashboardEngine?.getOperationalCabangList === "function"){
            for(const c of DashboardEngine.getOperationalCabangList() || []){
                map.set(Number(c.id), shortName(c.nama_cabang || `Cabang #${c.id}`));
            }
        }else if(Array.isArray(DashboardEngine?.cabangList)){
            for(const c of DashboardEngine.cabangList){
                map.set(Number(c.id), shortName(c.nama_cabang || `Cabang #${c.id}`));
            }
        }
        return map;
    }

    function getFilter(){
        if(typeof DashboardEngine === "undefined") return null;
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || start;
        if(!start || !end) return null;

        const cabangId = typeof DashboardEngine.resolveCabangId === "function"
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;
        const opIds = cabangId == null && typeof DashboardEngine.getOperationalCabangIds === "function"
            ? DashboardEngine.getOperationalCabangIds().map(Number).filter(Number.isFinite)
            : null;

        return {
            start,
            end,
            cabangId: cabangId == null ? null : Number(cabangId),
            opIds
        };
    }

    async function fetchRows(filter){
        if(typeof db === "undefined") throw new Error("Supabase client tidak tersedia");
        if(!filter?.start || !filter?.end) return [];

        const out = [];
        const pageSize = 1000;
        let from = 0;

        while(true){
            let q = db
                .from("bri_merchant_daily")
                .select("tanggal,cabang_id,bri_non_cash_actual")
                .gte("tanggal", filter.start)
                .lte("tanggal", filter.end)
                .order("tanggal", { ascending: true })
                .range(from, from + pageSize - 1);

            if(filter.cabangId != null){
                q = q.eq("cabang_id", filter.cabangId);
            }else if(Array.isArray(filter.opIds) && filter.opIds.length){
                q = q.in("cabang_id", filter.opIds);
            }else{
                return [];
            }

            const { data, error } = await q;
            if(error) throw error;
            const batch = data || [];
            out.push(...batch);
            if(batch.length < pageSize) break;
            from += pageSize;
        }

        return out;
    }

    function normalizedRows(){
        const names = branchMap();
        return (rows || [])
            .map(r => ({
                tanggal: String(r.tanggal || "").slice(0, 10),
                cabangId: Number(r.cabang_id),
                cabang: names.get(Number(r.cabang_id)) || `Cabang #${r.cabang_id}`,
                nominal: Number(r.bri_non_cash_actual || 0)
            }))
            .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.tanggal) && Number.isFinite(r.nominal) && r.nominal >= 0)
            .sort((a,b) => a.cabang.localeCompare(b.cabang) || a.tanggal.localeCompare(b.tanggal));
    }

    function groups(){
        const map = new Map();
        for(const row of normalizedRows()){
            const key = String(row.cabangId);
            if(!map.has(key)) map.set(key, { key, cabang: row.cabang, total: 0, rows: [] });
            const group = map.get(key);
            group.total += row.nominal;
            group.rows.push(row);
        }
        return [...map.values()].sort((a,b) => b.total - a.total || a.cabang.localeCompare(b.cabang));
    }

    function total(){
        return normalizedRows().reduce((sum, row) => sum + row.nominal, 0);
    }

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #thcTotals .thc-tot-item.is-bri-merchant{
                --thc-tot-accent:#c084fc;
                --thc-tot-glow-a:0 0 0 1px rgba(192,132,252,.14),0 0 12px rgba(168,85,247,.09);
                --thc-tot-glow-b:0 0 0 1px rgba(192,132,252,.26),0 0 18px rgba(168,85,247,.16);
                border-color:rgba(192,132,252,.58);
                box-shadow:inset 3px 0 0 #a855f7,0 0 20px rgba(168,85,247,.08);
                cursor:pointer;
                height:72px;
                min-height:72px;
                max-height:72px;
                box-sizing:border-box;
            }
            #thcTotals .thc-tot-item.is-bri-merchant > span,
            #thcTotals .thc-tot-item.is-bri-merchant > strong{color:#d8b4fe}
            #thcTotals .thc-tot-item.is-bri-merchant .bri-card-desc{
                display:block;margin-top:4px;color:#aeb8c7;font-size:11px;line-height:1.25;
                font-style:normal;font-weight:500;letter-spacing:0;text-transform:none;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            }
            #thcTotals .thc-tot-item.is-bri-merchant .bri-card-hint{
                position:absolute;top:10px;right:12px;display:inline-flex;align-items:center;gap:5px;
                color:#d8b4fe;font-size:10px;font-weight:800;letter-spacing:.04em;opacity:.92;
                pointer-events:none;white-space:nowrap;
            }
            #thcTotals .thc-tot-item.is-bri-merchant .bri-card-hint-icon{
                display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;
                border:1px solid rgba(192,132,252,.38);border-radius:7px;background:rgba(168,85,247,.10);font-size:13px;
            }
            #thcTotals .thc-tot-item.is-bri-merchant:focus-visible{
                outline:2px solid rgba(192,132,252,.78);outline-offset:2px;
            }

            /* 17 card desktop: 4 + 5 + 4 + 4. Baris lain tetap 4 card seperti layout existing. */
            #thcTotals .thc-totals-grid.thc-grid-17{
                grid-template-columns:repeat(20,minmax(0,1fr));
            }
            #thcTotals .thc-totals-grid.thc-grid-17 > .thc-tot-item{grid-column:span 5}
            #thcTotals .thc-totals-grid.thc-grid-17 > .thc-tot-item:nth-child(n+5):nth-child(-n+9){grid-column:span 4}

            @media (max-width:1100px){
                #thcTotals .thc-totals-grid.thc-grid-17{grid-template-columns:repeat(2,minmax(0,1fr))}
                #thcTotals .thc-totals-grid.thc-grid-17 > .thc-tot-item,
                #thcTotals .thc-totals-grid.thc-grid-17 > .thc-tot-item:nth-child(n+5):nth-child(-n+9){grid-column:span 1}
                #thcTotals .thc-tot-item.is-bri-merchant{
                    height:auto;
                    min-height:72px;
                    max-height:none;
                }
            }
            @media (max-width:680px){
                #thcTotals .thc-totals-grid.thc-grid-17{grid-template-columns:minmax(0,1fr)}
            }

            #${MODAL_ID}[hidden]{display:none!important}
            #${MODAL_ID}{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px}
            #${MODAL_ID} .bmc-backdrop{position:absolute;inset:0;background:rgba(2,6,12,.78);backdrop-filter:blur(3px)}
            #${MODAL_ID} .bmc-panel{position:relative;width:min(820px,96vw);max-height:82vh;overflow:hidden;border:1px solid rgba(192,132,252,.46);border-radius:16px;background:#0c131d;box-shadow:0 24px 80px rgba(0,0,0,.45);color:#eaf0f7}
            #${MODAL_ID} .bmc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(192,132,252,.24)}
            #${MODAL_ID} .bmc-head h3{margin:0;font-size:18px;color:#d8b4fe}
            #${MODAL_ID} .bmc-head p{margin:3px 0 0;color:#9fb0c3;font-size:12px}
            #${MODAL_ID} .bmc-close{width:38px;height:38px;border-radius:10px;border:1px solid #344254;background:#172231;color:#fff;font-size:22px;cursor:pointer}
            #${MODAL_ID} .bmc-total{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:rgba(168,85,247,.07);border-bottom:1px solid rgba(192,132,252,.18)}
            #${MODAL_ID} .bmc-total strong{font-size:22px;color:#d8b4fe}
            #${MODAL_ID} .bmc-wrap{max-height:58vh;overflow:auto}
            #${MODAL_ID} table{width:100%;border-collapse:collapse;font-size:13px}
            #${MODAL_ID} th{position:sticky;top:0;background:#111b27;color:#d8b4fe;text-align:left;padding:11px 14px;border-bottom:1px solid #2b3948}
            #${MODAL_ID} td{padding:11px 14px;border-bottom:1px solid #1c2936;vertical-align:middle}
            #${MODAL_ID} td:last-child,#${MODAL_ID} th:last-child{text-align:right;white-space:nowrap}
            #${MODAL_ID} .bmc-branch-btn{border:0;background:transparent;color:#d8b4fe;font:inherit;font-weight:800;cursor:pointer;padding:4px 0;text-decoration:underline;text-underline-offset:3px}
            #${MODAL_ID} .bmc-back{display:inline-flex;align-items:center;gap:7px;border:1px solid #344254;background:#172231;color:#dbe7f3;border-radius:9px;padding:7px 10px;cursor:pointer;margin:12px 14px 0}
            #${MODAL_ID} .bmc-empty{padding:28px;text-align:center;color:#9fb0c3}
        `;
        document.head.appendChild(style);
    }

    function applyGridLayout(){
        const grid = document.querySelector("#thcTotals .thc-totals-grid");
        if(!grid) return;
        const count = grid.querySelectorAll(":scope > .thc-tot-item").length;
        grid.classList.toggle("thc-grid-17", count === 17);
    }

    function watchGrid(){
        const grid = document.querySelector("#thcTotals .thc-totals-grid");
        if(!grid || gridObserver) return;
        gridObserver = new MutationObserver(() => {
            ensureCard();
            applyGridLayout();
        });
        gridObserver.observe(grid, { childList: true });
    }

    function ensureCard(){
        const grid = document.querySelector("#thcTotals .thc-totals-grid");
        if(!grid) return null;

        let card = document.getElementById(CARD_ID);
        if(!card){
            card = document.createElement("div");
            card.id = CARD_ID;
            card.className = "thc-tot-item is-bri-merchant is-link";
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            card.setAttribute("aria-label", "Buka rincian BRI Merchant per cabang");
            card.title = "Klik untuk lihat rincian sumber dana BRI Merchant";
            card.innerHTML = `
                <span>BRI Merchant</span>
                <strong id="${VALUE_ID}">—</strong>
                <em class="bri-card-desc">Klik untuk lihat rincian sumber dana</em>
                <span class="bri-card-hint" aria-hidden="true"><span class="bri-card-hint-icon">↗</span><span>DETAIL</span></span>
            `;
        }

        const nonTunai = document.getElementById("thcTotNonTunai")?.closest(".thc-tot-item") || null;
        if(nonTunai && card.previousElementSibling !== nonTunai){
            nonTunai.insertAdjacentElement("afterend", card);
        }else if(!card.isConnected){
            grid.appendChild(card);
        }

        applyGridLayout();
        return card;
    }

    function ensureModal(){
        let modal = document.getElementById(MODAL_ID);
        if(modal) return modal;

        modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <div class="bmc-backdrop" data-bmc-close></div>
            <section class="bmc-panel" role="dialog" aria-modal="true" aria-labelledby="bmcTitle">
                <div class="bmc-head">
                    <div><h3 id="bmcTitle">BRI Merchant per Cabang</h3><p id="bmcPeriod">—</p></div>
                    <button type="button" class="bmc-close" data-bmc-close aria-label="Tutup">×</button>
                </div>
                <div class="bmc-total"><span id="bmcTotalLabel">Total BRI Merchant</span><strong id="bmcGrandTotal">Rp0</strong></div>
                <div class="bmc-wrap"><div id="bmcBody"></div></div>
            </section>`;
        document.body.appendChild(modal);

        modal.addEventListener("click", event => {
            if(event.target.closest("[data-bmc-close]")) return closeModal();
            const branch = event.target.closest("[data-bmc-branch]");
            if(branch) return renderBranch(branch.dataset.bmcBranch);
            if(event.target.closest("[data-bmc-back]")) return renderSummary();
        });

        document.addEventListener("keydown", event => {
            if(event.key === "Escape" && !modal.hidden) closeModal();
        });

        return modal;
    }

    function periodLabel(){
        const filter = getFilter();
        if(!filter) return "—";
        return filter.start === filter.end ? filter.start : `${filter.start} — ${filter.end}`;
    }

    function renderSummary(){
        const modal = ensureModal();
        modal.querySelector("#bmcTitle").textContent = "BRI Merchant per Cabang";
        modal.querySelector("#bmcPeriod").textContent = periodLabel();
        modal.querySelector("#bmcTotalLabel").textContent = "Total BRI Merchant";
        modal.querySelector("#bmcGrandTotal").textContent = rupiah(total());

        const list = groups();
        const body = modal.querySelector("#bmcBody");
        if(!list.length){
            body.innerHTML = `<div class="bmc-empty">Belum ada data BRI Merchant pada periode aktif.</div>`;
            return;
        }

        body.innerHTML = `<table><thead><tr><th>Cabang</th><th>Total BRI Merchant</th></tr></thead><tbody>${list.map(group => `
            <tr><td>${esc(group.cabang)}</td><td><button type="button" class="bmc-branch-btn" data-bmc-branch="${esc(group.key)}">${rupiah(group.total)}</button></td></tr>
        `).join("")}</tbody></table>`;
    }

    function renderBranch(key){
        const modal = ensureModal();
        const group = groups().find(item => item.key === String(key));
        if(!group) return renderSummary();

        modal.querySelector("#bmcTitle").textContent = `BRI Merchant — ${group.cabang}`;
        modal.querySelector("#bmcPeriod").textContent = periodLabel();
        modal.querySelector("#bmcTotalLabel").textContent = `Total ${group.cabang}`;
        modal.querySelector("#bmcGrandTotal").textContent = rupiah(group.total);
        modal.querySelector("#bmcBody").innerHTML = `
            <button type="button" class="bmc-back" data-bmc-back>← Kembali ke Cabang</button>
            <table><thead><tr><th>Tanggal</th><th>Nominal BRI Merchant</th></tr></thead><tbody>${group.rows
                .slice()
                .sort((a,b) => a.tanggal.localeCompare(b.tanggal))
                .map(row => `<tr><td>${esc(row.tanggal)}</td><td>${rupiah(row.nominal)}</td></tr>`)
                .join("")}</tbody></table>`;
    }

    function openModal(){
        const modal = ensureModal();
        renderSummary();
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeModal(){
        const modal = document.getElementById(MODAL_ID);
        if(!modal) return;
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    async function refresh(){
        ensureStyle();
        ensureCard();
        watchGrid();

        const filter = getFilter();
        const currentSeq = ++seq;
        const value = document.getElementById(VALUE_ID);
        if(!filter){
            if(value) value.textContent = "—";
            return;
        }

        try{
            const nextRows = await fetchRows(filter);
            if(currentSeq !== seq) return;
            rows = nextRows;
            if(value) value.textContent = rupiah(total());
        }catch(error){
            console.error("[TabelHarianBriMerchantCard] load gagal:", error);
            if(currentSeq === seq && value) value.textContent = "—";
        }
    }

    function patchPresenter(){
        if(patched) return;
        if(typeof TabelHarianCabang === "undefined" || typeof TabelHarianCabang.renderTotals !== "function") return;
        const original = TabelHarianCabang.renderTotals.bind(TabelHarianCabang);
        TabelHarianCabang.renderTotals = (...args) => {
            const result = original(...args);
            queueMicrotask(() => refresh());
            return result;
        };
        patched = true;
    }

    function bindCard(){
        document.addEventListener("click", event => {
            const card = event.target.closest(`#${CARD_ID}`);
            if(!card) return;
            event.preventDefault();
            openModal();
        });

        document.addEventListener("keydown", event => {
            const card = event.target.closest?.(`#${CARD_ID}`);
            if(!card || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            openModal();
        });
    }

    function boot(){
        ensureStyle();
        ensureCard();
        watchGrid();
        patchPresenter();
        bindCard();
        refresh();

        document.addEventListener("erp:bri-merchant-daily-saved", () => refresh());
        document.addEventListener("erp:components-ready", () => {
            patchPresenter();
            refresh();
        });
    }

    window.TabelHarianBriMerchantCard = { boot, refresh };
})();
