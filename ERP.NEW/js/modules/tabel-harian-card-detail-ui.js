/*
=========================================================
VAX ERP — TABEL HARIAN TOTAL CARD DETAIL UI
=========================================================
UI / PRESENTER ONLY.

Tujuan:
- Card TOTAL PERIODE tertentu dapat diklik.
- Popup menampilkan sumber data + total + rincian per tanggal.
- Mengikuti filter cabang/periode aktif.
- Warna popup mengikuti warna card yang diklik.

BATAS KERAS:
- TIDAK mengubah DashboardEngine.
- TIDAK mengubah DailyDataEngine.
- TIDAK mengubah SetoranMoneyEngine.
- TIDAK menulis / mengubah data Supabase.
- TIDAK mengubah formula canonical.
=========================================================
*/
"use strict";

(function(){
    const MODAL_ID = "thcCardDetailModal";
    const STYLE_ID = "thcCardDetailUiStyle";

    const DEFINITIONS = {
        thcTotCustomer: {
            label: "Customer",
            kind: "count",
            source: "DashboardEngine.rawData → DashboardEngine.summarizeRows().customer",
            formula: "Jumlah customer pada row harian yang sedang tampil.",
            value: (r) => Number(r.customer || 0)
        },
        thcTotTransaksi: {
            label: "Transaksi",
            kind: "count",
            source: "DashboardEngine.rawData → DashboardEngine.summarizeRows().transaction",
            formula: "Jumlah transaksi / struk pada row harian yang sedang tampil.",
            value: (r) => Number(r.transaction || 0)
        },
        thcTotServices: {
            label: "Services",
            kind: "count",
            source: "DashboardEngine.rawData → DashboardEngine.summarizeRows().service",
            formula: "Jumlah layanan/service pada row harian yang sedang tampil.",
            value: (r) => Number(r.services || 0)
        },
        thcTotOmzet: {
            label: "Omzet / Gross",
            kind: "money",
            source: "DashboardEngine.rawData → DashboardEngine.summarizeRows().omzet",
            formula: "Total penjualan jasa + produk sebelum potongan.",
            value: (r) => Number(r.omzet || 0)
        },
        thcTotGrossService: {
            label: "Gross Service",
            kind: "money",
            source: "Presenter Tabel Harian dari row canonical yang sama",
            formula: "Omzet / Gross − Product Terjual",
            value: (r) => Number(r.omzet || 0) - Number(r.produk || 0)
        },
        thcTotProduk: {
            label: "Product Terjual",
            kind: "money",
            source: "DashboardEngine.rawData → DashboardEngine.summarizeRows().product",
            formula: "Total nilai penjualan produk pada row harian yang sedang tampil.",
            value: (r) => Number(r.produk || 0)
        },
        thcTotNettProduk: {
            label: "Nett Produk",
            kind: "money",
            source: "daily_recap_source.produk + daily_recap_source.share_produk (READ ONLY)",
            formula: "Produk − Share Produk",
            asyncRows: true
        },
        thcTotNett: {
            label: "Nett Revenue",
            kind: "money",
            source: "DailyDataEngine canonical_money.netRevenueErp",
            formula: "Nilai canonical Nett Revenue ERP; popup hanya membaca hasil engine.",
            value: (r) => Number(r.nett || 0)
        },
        thcTotNonTunai: {
            label: "Non Tunai",
            kind: "money",
            source: "DailyDataEngine canonical_money.nonCash",
            formula: "Nilai canonical non-cash; popup hanya membaca hasil engine.",
            value: (r) => Number(r.non_cash || 0)
        },
        thcTotCash: {
            label: "Cash Kotor",
            kind: "money",
            source: "Presenter Tabel Harian dari row canonical yang sama",
            formula: "Omzet / Gross − Non Tunai",
            value: (r) => Number(r.omzet || 0) - Number(r.non_cash || 0)
        },
        thcTotSetoran: {
            label: "Cash Bersih",
            kind: "money",
            source: "DailyDataEngine canonical_money.cashReference",
            formula: "Uang fisik bersih canonical yang tersedia di kasir; popup tidak menghitung ulang.",
            value: (r) => Number(r.setoran_cash_aktual || 0)
        },
        thcTotShareProduk: {
            label: "Share Produk",
            kind: "money",
            source: "public.daily_recap_source.share_produk (READ ONLY)",
            formula: "Total share provider dari penjualan produk pada periode/filter aktif.",
            asyncRows: true
        }
    };

    function esc(value){
        return String(value ?? "")
            .replace(/&/g,"&amp;")
            .replace(/</g,"&lt;")
            .replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;")
            .replace(/'/g,"&#039;");
    }

    function money(value){
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Number(value || 0));
    }

    function count(value){
        return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value || 0));
    }

    function fmt(def, value){
        return def.kind === "count" ? count(value) : money(value);
    }

    function fmtDate(iso){
        const s = String(iso || "").slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
        const [y,m,d] = s.split("-").map(Number);
        return new Intl.DateTimeFormat("id-ID", {
            day:"2-digit", month:"short", year:"numeric", timeZone:"UTC"
        }).format(new Date(Date.UTC(y,m-1,d,12,0,0)));
    }

    function filterInfo(){
        const start = DashboardEngine?.lastRange?.start || null;
        const end = DashboardEngine?.lastRange?.end || start;
        const branchLabel = document.getElementById("branchFilter")?.selectedOptions?.[0]?.textContent?.trim()
            || "Semua Cabang";
        const periodLabel = document.getElementById("periodFilter")?.selectedOptions?.[0]?.textContent?.trim()
            || "Periode aktif";
        const cabangId = typeof DashboardEngine?.resolveCabangId === "function"
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;
        const opIds = cabangId == null && typeof DashboardEngine?.getOperationalCabangIds === "function"
            ? DashboardEngine.getOperationalCabangIds().map(Number).filter(Number.isFinite)
            : null;
        return {
            start,
            end,
            branchLabel,
            periodLabel,
            cabangId: cabangId == null ? null : Number(cabangId),
            opIds
        };
    }

    function currentRows(){
        return Array.isArray(TabelHarianCabang?.rows) ? TabelHarianCabang.rows : [];
    }

    function aggregatePresenter(def){
        const map = new Map();
        for(const row of currentRows()){
            const tanggal = String(row?.tanggal || "").slice(0,10);
            if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) continue;
            const value = Number(def.value?.(row) || 0);
            map.set(tanggal, (map.get(tanggal) || 0) + (Number.isFinite(value) ? value : 0));
        }
        return [...map.entries()]
            .map(([tanggal, value]) => ({ tanggal, value }))
            .sort((a,b) => a.tanggal.localeCompare(b.tanggal));
    }

    async function fetchDailyRecap(fields){
        if(typeof db === "undefined") throw new Error("Supabase client tidak tersedia.");
        const f = filterInfo();
        if(!f.start || !f.end) return [];
        const out = [];
        const pageSize = 1000;
        let from = 0;
        while(true){
            let q = db.from("daily_recap_source")
                .select(fields)
                .gte("tanggal", f.start)
                .lte("tanggal", f.end)
                .range(from, from + pageSize - 1);
            if(f.cabangId != null) q = q.eq("cabang_id", f.cabangId);
            else if(Array.isArray(f.opIds) && f.opIds.length) q = q.in("cabang_id", f.opIds);
            else return [];
            const { data, error } = await q;
            if(error) throw error;
            const batch = data || [];
            out.push(...batch);
            if(batch.length < pageSize) break;
            from += pageSize;
        }
        return out;
    }

    async function aggregateAsync(id){
        if(id === "thcTotShareProduk"){
            const rows = await fetchDailyRecap("tanggal,cabang_id,share_produk");
            const map = new Map();
            for(const row of rows){
                const tanggal = String(row?.tanggal || "").slice(0,10);
                if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) continue;
                map.set(tanggal, (map.get(tanggal) || 0) + Number(row?.share_produk || 0));
            }
            return [...map.entries()].map(([tanggal,value]) => ({tanggal,value}))
                .sort((a,b) => a.tanggal.localeCompare(b.tanggal));
        }

        if(id === "thcTotNettProduk"){
            const shareRows = await fetchDailyRecap("tanggal,cabang_id,share_produk");
            const shareByDate = new Map();
            for(const row of shareRows){
                const tanggal = String(row?.tanggal || "").slice(0,10);
                if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) continue;
                shareByDate.set(tanggal, (shareByDate.get(tanggal) || 0) + Number(row?.share_produk || 0));
            }
            const productByDate = new Map();
            for(const row of currentRows()){
                const tanggal = String(row?.tanggal || "").slice(0,10);
                if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) continue;
                productByDate.set(tanggal, (productByDate.get(tanggal) || 0) + Number(row?.produk || 0));
            }
            const dates = new Set([...productByDate.keys(), ...shareByDate.keys()]);
            return [...dates].sort().map(tanggal => ({
                tanggal,
                value: Number(productByDate.get(tanggal) || 0) - Number(shareByDate.get(tanggal) || 0)
            }));
        }
        return [];
    }

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #thcTotals .thc-tot-item[data-thc-detail-ready="1"]{position:relative;cursor:pointer;transition:transform .15s ease,filter .15s ease,box-shadow .15s ease}
            #thcTotals .thc-tot-item[data-thc-detail-ready="1"]:hover{transform:translateY(-1px);filter:brightness(1.05)}
            #thcTotals .thc-tot-item[data-thc-detail-ready="1"]:focus-visible{outline:2px solid currentColor;outline-offset:2px}
            #thcTotals .thc-tot-item[data-thc-detail-ready="1"]::after{content:"↗";position:absolute;top:8px;right:10px;font-size:11px;font-weight:900;opacity:.68;pointer-events:none}

            #${MODAL_ID}[hidden]{display:none!important}
            #${MODAL_ID}{--td-accent:#facc15;position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px}
            #${MODAL_ID} .td-backdrop{position:absolute;inset:0;background:rgba(2,6,12,.80);backdrop-filter:blur(4px)}
            #${MODAL_ID} .td-panel{position:relative;width:min(860px,96vw);max-height:84vh;overflow:hidden;border:1px solid color-mix(in srgb,var(--td-accent) 46%,transparent);border-radius:16px;background:#0c131d;box-shadow:0 24px 80px rgba(0,0,0,.5);color:#eef4fa}
            #${MODAL_ID} .td-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid color-mix(in srgb,var(--td-accent) 24%,transparent)}
            #${MODAL_ID} .td-title{margin:0;color:var(--td-accent);font-size:19px;line-height:1.2}
            #${MODAL_ID} .td-sub{margin:5px 0 0;color:#9fb0c3;font-size:12px}
            #${MODAL_ID} .td-close{flex:0 0 auto;width:38px;height:38px;border:1px solid #344254;border-radius:10px;background:#172231;color:#fff;font-size:21px;cursor:pointer}
            #${MODAL_ID} .td-total{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 20px;background:color-mix(in srgb,var(--td-accent) 8%,transparent);border-bottom:1px solid color-mix(in srgb,var(--td-accent) 18%,transparent)}
            #${MODAL_ID} .td-total span{font-size:12px;color:#cbd5e1}
            #${MODAL_ID} .td-total strong{font-size:24px;color:var(--td-accent);font-variant-numeric:tabular-nums;white-space:nowrap}
            #${MODAL_ID} .td-source{margin:14px 18px 8px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--td-accent) 24%,transparent);border-radius:11px;background:color-mix(in srgb,var(--td-accent) 5%,transparent)}
            #${MODAL_ID} .td-source-row{display:grid;grid-template-columns:110px 1fr;gap:10px;padding:3px 0;font-size:12px;line-height:1.4}
            #${MODAL_ID} .td-source-row b{color:var(--td-accent)}
            #${MODAL_ID} .td-source-row span{color:#c6d1dd;overflow-wrap:anywhere}
            #${MODAL_ID} .td-wrap{max-height:53vh;overflow:auto;padding:0 18px 18px}
            #${MODAL_ID} table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
            #${MODAL_ID} th{position:sticky;top:0;background:#111b27;color:var(--td-accent);text-align:left;padding:11px 14px;border-bottom:1px solid #314052;text-transform:uppercase;letter-spacing:.025em}
            #${MODAL_ID} td{padding:11px 14px;border-bottom:1px solid #1d2a37}
            #${MODAL_ID} td:last-child,#${MODAL_ID} th:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
            #${MODAL_ID} tbody tr:hover{background:color-mix(in srgb,var(--td-accent) 5%,transparent)}
            #${MODAL_ID} .td-empty{padding:30px 16px;text-align:center;color:#9fb0c3}
            #${MODAL_ID} .td-loading{padding:30px 16px;text-align:center;color:var(--td-accent);font-weight:800}
            @media(max-width:640px){#${MODAL_ID}{padding:10px}#${MODAL_ID} .td-source-row{grid-template-columns:1fr;gap:2px}#${MODAL_ID} .td-total strong{font-size:19px}}
        `;
        document.head.appendChild(style);
    }

    function ensureModal(){
        let modal = document.getElementById(MODAL_ID);
        if(modal) return modal;
        modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.hidden = true;
        modal.setAttribute("aria-hidden","true");
        modal.innerHTML = `
            <div class="td-backdrop" data-td-close></div>
            <section class="td-panel" role="dialog" aria-modal="true" aria-labelledby="tdTitle">
                <div class="td-head"><div><h3 class="td-title" id="tdTitle">Rincian Card</h3><p class="td-sub" id="tdSub">—</p></div><button type="button" class="td-close" data-td-close aria-label="Tutup">×</button></div>
                <div class="td-total"><span id="tdTotalLabel">Total periode</span><strong id="tdTotalValue">—</strong></div>
                <div class="td-source"><div class="td-source-row"><b>SUMBER DATA</b><span id="tdSource">—</span></div><div class="td-source-row"><b>FORMULA / ARTI</b><span id="tdFormula">—</span></div></div>
                <div class="td-wrap"><div id="tdBody"></div></div>
            </section>`;
        document.body.appendChild(modal);
        modal.addEventListener("click", (e) => {
            if(e.target.closest("[data-td-close]")) closeModal();
        });
        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && !modal.hidden) closeModal();
        });
        return modal;
    }

    function closeModal(){
        const modal = document.getElementById(MODAL_ID);
        if(!modal) return;
        modal.hidden = true;
        modal.setAttribute("aria-hidden","true");
        document.body.style.overflow = "";
    }

    function accentFromCard(card){
        const value = card?.querySelector("strong");
        return value && typeof getComputedStyle === "function"
            ? getComputedStyle(value).color || "#facc15"
            : "#facc15";
    }

    function activateCards(){
        ensureStyle();
        for(const id of Object.keys(DEFINITIONS)){
            const value = document.getElementById(id);
            const card = value?.closest(".thc-tot-item");
            if(!card) continue;
            card.dataset.thcDetailReady = "1";
            card.setAttribute("role","button");
            card.setAttribute("tabindex","0");
            card.setAttribute("aria-label", `Buka rincian ${DEFINITIONS[id].label}`);
            card.title = `Klik untuk lihat sumber data dan rincian ${DEFINITIONS[id].label} per tanggal`;
        }
    }

    function totalOf(rows){
        return rows.reduce((sum,row) => sum + Number(row.value || 0), 0);
    }

    function renderRows(def, rows){
        const body = ensureModal().querySelector("#tdBody");
        if(!rows.length){
            body.innerHTML = `<div class="td-empty">Belum ada data pada periode/filter aktif.</div>`;
            return;
        }
        body.innerHTML = `<table><thead><tr><th>Tanggal</th><th>${def.kind === "count" ? "Jumlah" : "Nominal"}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(fmtDate(row.tanggal))}</td><td>${esc(fmt(def,row.value))}</td></tr>`).join("")}</tbody></table>`;
    }

    async function openCard(id, card){
        const def = DEFINITIONS[id];
        if(!def) return;
        const modal = ensureModal();
        const f = filterInfo();
        const accent = accentFromCard(card);
        modal.style.setProperty("--td-accent", accent);
        modal.querySelector("#tdTitle").textContent = `${def.label} — Rincian per Tanggal`;
        modal.querySelector("#tdSub").textContent = `${f.branchLabel} · ${f.periodLabel} · ${f.start || "—"} — ${f.end || "—"}`;
        modal.querySelector("#tdSource").textContent = def.source;
        modal.querySelector("#tdFormula").textContent = def.formula;
        modal.querySelector("#tdTotalLabel").textContent = `Total ${def.label}`;
        modal.querySelector("#tdTotalValue").textContent = document.getElementById(id)?.textContent?.trim() || "—";
        modal.querySelector("#tdBody").innerHTML = `<div class="td-loading">Memuat rincian read only…</div>`;
        modal.hidden = false;
        modal.setAttribute("aria-hidden","false");
        document.body.style.overflow = "hidden";

        try{
            const rows = def.asyncRows ? await aggregateAsync(id) : aggregatePresenter(def);
            renderRows(def, rows);
            const cardTotalText = document.getElementById(id)?.textContent?.trim();
            if(!cardTotalText || cardTotalText === "—" || /memuat/i.test(cardTotalText)){
                modal.querySelector("#tdTotalValue").textContent = fmt(def, totalOf(rows));
            }
        }catch(err){
            console.error("[TabelHarianCardDetailUI]", err);
            modal.querySelector("#tdBody").innerHTML = `<div class="td-empty">Rincian tidak dapat dibaca: ${esc(err?.message || "unknown error")}</div>`;
        }
    }

    function idFromCard(card){
        if(!card) return null;
        for(const id of Object.keys(DEFINITIONS)){
            if(card.querySelector(`#${id}`)) return id;
        }
        return null;
    }

    function bind(){
        if(document.documentElement.dataset.thcCardDetailBound === "1") return;
        document.documentElement.dataset.thcCardDetailBound = "1";
        document.addEventListener("click", (e) => {
            const card = e.target.closest("#thcTotals .thc-tot-item[data-thc-detail-ready='1']");
            if(!card) return;
            const id = idFromCard(card);
            if(!id) return;
            e.preventDefault();
            openCard(id, card);
        });
        document.addEventListener("keydown", (e) => {
            if(e.key !== "Enter" && e.key !== " ") return;
            const card = e.target.closest?.("#thcTotals .thc-tot-item[data-thc-detail-ready='1']");
            if(!card) return;
            const id = idFromCard(card);
            if(!id) return;
            e.preventDefault();
            openCard(id, card);
        });
    }

    function boot(){
        ensureStyle();
        ensureModal();
        bind();
        activateCards();
        const totals = document.getElementById("thcTotals");
        if(totals && typeof MutationObserver === "function"){
            const observer = new MutationObserver(() => activateCards());
            observer.observe(totals, { childList:true, subtree:true });
        }
        document.addEventListener("erp:components-ready", activateCards);
        setTimeout(activateCards, 300);
        setTimeout(activateCards, 900);
    }

    window.TabelHarianCardDetailUI = { boot, activateCards };

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
    else boot();
})();
