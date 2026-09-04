/*
=========================================================
VAX ERP — TABEL HARIAN BRI MERCHANT DAILY INPUT
=========================================================
UI NETRAL + write bridge ke public.bri_merchant_daily.
Owner/SVP dapat input manual per tanggal+cabang.

PENTING:
- TIDAK mengubah DailyDataEngine
- TIDAK mengubah SetoranMoneyEngine
- TIDAK mengubah rowFromEngine / computeTotals / rumus Tabel Harian
- BRI Merchant hanya angka acuan manual untuk rekonsiliasi
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcBriDailyStyle";
    let role = "";
    let userId = null;
    let loadSeq = 0;
    let refreshTimer = null;
    let observer = null;
    let bound = false;

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const s = document.createElement("style");
        s.id = STYLE_ID;
        s.textContent = `
            #thcTable th.thc-bri-daily-head,
            #thcTable td.thc-bri-daily-cell{
                min-width:118px;
                width:118px;
                text-align:right;
            }
            #thcTable th.thc-bri-daily-head{
                color:#e6b8ff !important;
                background:#0f151d !important;
                white-space:nowrap;
            }
            #thcTable td.thc-bri-daily-cell{
                background:#151d27;
                padding-left:8px;
                padding-right:8px;
            }
            #thcTable .thc-bri-daily-input{
                width:96px;
                min-width:96px;
                box-sizing:border-box;
                border:1px solid rgba(190,120,255,.42);
                border-radius:8px;
                background:#101821;
                color:#f2d7ff;
                font:700 13px/1.1 "Source Sans 3",sans-serif;
                text-align:right;
                padding:7px 9px;
                outline:none;
            }
            #thcTable .thc-bri-daily-input:focus{
                border-color:#d28cff;
                box-shadow:0 0 0 2px rgba(210,140,255,.14);
            }
            #thcTable .thc-bri-daily-input.is-saving{opacity:.55}
            #thcTable .thc-bri-daily-input.is-saved{border-color:rgba(76,226,180,.9)}
            #thcTable .thc-bri-daily-input.is-error{border-color:#ff5c66;color:#ff8f96}
            #thcTable .thc-bri-daily-input:disabled{opacity:.72;cursor:not-allowed}
        `;
        document.head.appendChild(s);
    }

    async function loadIdentity(){
        try{
            const { data: sessionData } = await db.auth.getSession();
            userId = sessionData?.session?.user?.id || null;
            if(!userId) return;
            const { data, error } = await db
                .from("profiles")
                .select("role,aktif")
                .eq("id", userId)
                .maybeSingle();
            if(error) throw error;
            if(data?.aktif !== false){
                role = String(data?.role || "").trim().toLowerCase();
            }
        }catch(err){
            role = "";
            console.warn("BRI Merchant identity tidak terbaca:", err);
        }
    }

    function canEdit(){
        return role === "owner" || role === "svp" || role === "spv";
    }

    function currentRows(){
        if(typeof TabelHarianCabang === "undefined") return [];
        return Array.isArray(TabelHarianCabang.rows) ? TabelHarianCabang.rows : [];
    }

    function getBounds(rows){
        const dates = rows
            .map((r) => String(r?.tanggal || "").slice(0,10))
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort();
        return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
    }

    function findHeaderIndex(table, label){
        const ths = [...table.querySelectorAll("thead th")];
        const wanted = String(label || "").trim().toUpperCase();
        return ths.findIndex((th) => String(th.textContent || "").trim().toUpperCase() === wanted);
    }

    function ensureHeader(table){
        const row = table.querySelector("thead tr");
        if(!row) return -1;

        const existing = row.querySelector("th.thc-bri-daily-head");
        if(existing){
            return [...row.children].indexOf(existing);
        }

        const nonIdx = findHeaderIndex(table, "NON TUNAI");
        if(nonIdx < 0) return -1;

        const th = document.createElement("th");
        th.className = "thc-bri-daily-head";
        th.scope = "col";
        th.textContent = "BRI MERCHANT";
        row.children[nonIdx].insertAdjacentElement("afterend", th);
        return [...row.children].indexOf(th);
    }

    function makeInput(meta, saved){
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.autocomplete = "off";
        input.className = "thc-bri-daily-input";
        input.placeholder = "0";
        input.dataset.tanggal = String(meta.tanggal || "").slice(0,10);
        input.dataset.cabangId = String(Number(meta.cabang_id));
        input.value = saved ? String(Number(saved.bri_non_cash_actual || 0)) : "";
        input.disabled = !canEdit();
        input.title = canEdit()
            ? "Input manual BRI Merchant. Enter/keluar kolom untuk simpan; kosongkan untuk hapus."
            : "Hanya Owner / SVP yang dapat mengubah BRI Merchant";
        return input;
    }

    function ensureCells(){
        const table = document.getElementById("thcTable");
        const tbody = document.getElementById("thcTbody");
        const rows = currentRows();
        if(!table || !tbody || !rows.length) return false;

        const briHeaderIdx = ensureHeader(table);
        if(briHeaderIdx < 0) return false;

        const trs = [...tbody.querySelectorAll("tr")];
        if(!trs.length) return false;

        trs.forEach((tr, i) => {
            const meta = rows[i];
            if(!meta) return;

            tr.dataset.tanggal = tr.dataset.tanggal || String(meta.tanggal || "").slice(0,10);
            tr.dataset.cabangId = String(Number(meta.cabang_id));

            let td = tr.querySelector("td.thc-bri-daily-cell");
            if(!td){
                const nonIdx = findHeaderIndex(table, "NON TUNAI");
                const nonCell = tr.children[nonIdx];
                if(!nonCell) return;
                td = document.createElement("td");
                td.className = "thc-bri-daily-cell";
                nonCell.insertAdjacentElement("afterend", td);
            }

            const saved = BriMerchantDaily.get(meta.tanggal, meta.cabang_id);
            let input = td.querySelector(".thc-bri-daily-input");
            if(!input){
                input = makeInput(meta, saved);
                td.replaceChildren(input);
            }else{
                input.dataset.tanggal = String(meta.tanggal || "").slice(0,10);
                input.dataset.cabangId = String(Number(meta.cabang_id));
                input.disabled = !canEdit();
                if(document.activeElement !== input){
                    input.value = saved ? String(Number(saved.bri_non_cash_actual || 0)) : "";
                }
            }
        });
        return true;
    }

    async function refresh(){
        const rows = currentRows();
        if(!rows.length){
            ensureCells();
            return;
        }
        const bounds = getBounds(rows);
        if(!bounds) return;

        const ids = [...new Set(rows.map((r) => Number(r.cabang_id)).filter(Number.isFinite))];
        const seq = ++loadSeq;
        try{
            await BriMerchantDaily.loadRange({
                start: bounds.start,
                end: bounds.end,
                cabangIds: ids
            });
            if(seq !== loadSeq) return;
            ensureCells();
        }catch(err){
            console.error("BRI Merchant Daily load gagal:", err);
            ensureCells();
        }
    }

    function scheduleRefresh(delay = 20){
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => refresh(), delay);
    }

    function parseAmount(raw){
        const cleaned = String(raw ?? "").replace(/[^0-9]/g, "");
        if(cleaned === "") return null;
        const value = Number(cleaned);
        return Number.isFinite(value) ? value : NaN;
    }

    async function saveInput(input){
        if(!canEdit() || !input) return;

        const tanggal = String(input.dataset.tanggal || "").slice(0,10);
        const cabangId = Number(input.dataset.cabangId);
        const raw = String(input.value ?? "").trim();

        input.classList.remove("is-saved", "is-error");
        input.classList.add("is-saving");
        input.disabled = true;

        try{
            const value = parseAmount(raw);
            if(value === null){
                await BriMerchantDaily.remove({ tanggal, cabangId });
                input.value = "";
            }else{
                if(!Number.isFinite(value) || value < 0){
                    throw new Error("Nominal BRI Merchant harus 0 atau lebih.");
                }
                await BriMerchantDaily.save({ tanggal, cabangId, value, userId });
                input.value = String(value);
            }
            input.classList.add("is-saved");
            setTimeout(() => input.classList.remove("is-saved"), 900);
            document.dispatchEvent(new CustomEvent("erp:bri-merchant-daily-saved", {
                detail: { tanggal, cabangId }
            }));
        }catch(err){
            input.classList.add("is-error");
            console.error("BRI Merchant Daily save gagal:", err);
            alert(`BRI Merchant gagal disimpan: ${err?.message || err}`);
        }finally{
            input.classList.remove("is-saving");
            input.disabled = !canEdit();
        }
    }

    function bindEvents(){
        if(bound) return;
        bound = true;

        document.addEventListener("input", (e) => {
            const input = e.target.closest?.("#thcTable .thc-bri-daily-input");
            if(!input) return;
            input.value = String(input.value || "").replace(/[^0-9]/g, "");
        });

        document.addEventListener("change", (e) => {
            const input = e.target.closest?.("#thcTable .thc-bri-daily-input");
            if(input) saveInput(input);
        });

        document.addEventListener("keydown", (e) => {
            const input = e.target.closest?.("#thcTable .thc-bri-daily-input");
            if(input && e.key === "Enter"){
                e.preventDefault();
                input.blur();
            }
        });

        document.addEventListener("erp:components-ready", () => scheduleRefresh(0));
    }

    function observeTable(){
        const tbody = document.getElementById("thcTbody");
        if(!tbody || observer) return;
        observer = new MutationObserver(() => scheduleRefresh(10));
        observer.observe(tbody, { childList: true });
    }

    async function boot(){
        ensureStyle();
        bindEvents();
        await loadIdentity();

        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            observeTable();
            ensureCells();
            if(typeof TabelHarianCabang !== "undefined" && currentRows().length){
                clearInterval(timer);
                scheduleRefresh(0);
            }else if(tries >= 100){
                clearInterval(timer);
            }
        }, 50);
    }

    window.TabelHarianBriMerchant = {
        refresh: () => refresh(),
        ensureCells: () => ensureCells()
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    }else{
        boot();
    }
})();
