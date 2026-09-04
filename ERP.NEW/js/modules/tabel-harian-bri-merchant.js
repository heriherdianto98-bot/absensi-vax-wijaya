/*
=========================================================
VAX ERP — TABEL HARIAN BRI MERCHANT DAILY INPUT
=========================================================
UI + write bridge ke public.bri_merchant_daily.
Owner/SVP dapat input manual per tanggal+cabang.
Tidak mengubah DailyDataEngine / money formula / Minutes source.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcBriDailyStyle";
    let role = "";
    let userId = null;
    let seq = 0;
    let patched = false;

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const s = document.createElement("style");
        s.id = STYLE_ID;
        s.textContent = `
            #thcTable th.thc-bri-daily-head,
            #thcTable td.thc-bri-daily-cell{
                min-width:140px;
                width:140px;
                text-align:right;
            }
            #thcTable th.thc-bri-daily-head{
                color:#e6b8ff !important;
            }
            #thcTable .thc-bri-daily-input{
                width:118px;
                min-width:118px;
                box-sizing:border-box;
                border:1px solid rgba(190,120,255,.38);
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
            #thcTable .thc-bri-daily-input.is-saved{border-color:rgba(76,226,180,.78)}
            #thcTable .thc-bri-daily-input.is-error{border-color:#ff5c66;color:#ff8f96}
            #thcTable .thc-bri-daily-input:disabled{opacity:.7;cursor:not-allowed}
        `;
        document.head.appendChild(s);
    }

    async function loadIdentity(){
        try{
            const {data:s} = await db.auth.getSession();
            userId = s?.session?.user?.id || null;
            if(!userId) return;
            const {data} = await db.from("profiles").select("role,aktif").eq("id",userId).maybeSingle();
            if(data?.aktif !== false) role = String(data?.role || "").trim().toLowerCase();
        }catch(_e){ role = ""; }
    }

    function canEdit(){
        return role === "owner" || role === "svp" || role === "spv";
    }

    function currentRows(){
        return (typeof TabelHarianCabang !== "undefined" && Array.isArray(TabelHarianCabang.rows))
            ? TabelHarianCabang.rows
            : [];
    }

    function bounds(rows){
        const dates = rows.map(r=>String(r?.tanggal||"").slice(0,10)).filter(Boolean).sort();
        return dates.length ? {start:dates[0], end:dates[dates.length-1]} : null;
    }

    function findNonCashIndex(table){
        const ths = [...table.querySelectorAll("thead th")];
        return ths.findIndex(th => String(th.textContent||"").trim().toUpperCase() === "NON TUNAI");
    }

    function ensureColumn(table){
        const nonIdx = findNonCashIndex(table);
        if(nonIdx < 0) return -1;
        const headRow = table.querySelector("thead tr");
        if(!headRow) return -1;
        if(!headRow.querySelector(".thc-bri-daily-head")){
            const th = document.createElement("th");
            th.className = "thc-bri-daily-head";
            th.textContent = "BRI MERCHANT";
            const nonTh = headRow.children[nonIdx];
            nonTh.insertAdjacentElement("afterend", th);
        }
        return nonIdx;
    }

    function rowInput(rowMeta, saved){
        const input = document.createElement("input");
        input.type = "number";
        input.step = "1000";
        input.min = "0";
        input.inputMode = "numeric";
        input.className = "thc-bri-daily-input";
        input.placeholder = "0";
        input.dataset.tanggal = rowMeta.tanggal;
        input.dataset.cabangId = String(rowMeta.cabang_id);
        input.value = saved ? String(Number(saved.bri_non_cash_actual || 0)) : "";
        input.disabled = !canEdit();
        input.title = canEdit()
            ? "Input manual BRI Merchant untuk tanggal + cabang ini"
            : "Hanya Owner / SVP yang dapat mengubah BRI Merchant";
        return input;
    }

    function paintRows(){
        const table = document.getElementById("thcTable");
        const rows = currentRows();
        if(!table || !rows.length) return;

        const nonIdx = ensureColumn(table);
        if(nonIdx < 0) return;

        const trs = [...table.querySelectorAll("tbody tr")];
        trs.forEach((tr, i) => {
            const meta = rows[i];
            if(!meta) return;
            tr.dataset.tanggal = tr.dataset.tanggal || meta.tanggal;
            tr.dataset.cabangId = tr.dataset.cabangId || String(meta.cabang_id);
            const existing = tr.querySelector("td.thc-bri-daily-cell");
            const saved = BriMerchantDaily.get(meta.tanggal, meta.cabang_id);
            if(existing){
                const inp = existing.querySelector("input");
                if(inp && document.activeElement !== inp){
                    inp.value = saved ? String(Number(saved.bri_non_cash_actual || 0)) : "";
                }
                return;
            }
            const td = document.createElement("td");
            td.className = "thc-bri-daily-cell";
            td.appendChild(rowInput(meta, saved));
            const nonCell = tr.children[nonIdx];
            nonCell?.insertAdjacentElement("afterend", td);
        });
    }

    async function refresh(){
        const rows = currentRows();
        if(!rows.length){ paintRows(); return; }
        const b = bounds(rows);
        if(!b) return;
        const ids = [...new Set(rows.map(r=>Number(r.cabang_id)).filter(Number.isFinite))];
        const mySeq = ++seq;
        try{
            await BriMerchantDaily.loadRange({start:b.start,end:b.end,cabangIds:ids});
            if(mySeq !== seq) return;
            paintRows();
        }catch(err){
            console.error("BRI Merchant Daily load gagal:", err);
        }
    }

    async function saveInput(input){
        if(!canEdit() || !input) return;
        const tanggal = input.dataset.tanggal;
        const cabangId = Number(input.dataset.cabangId);
        const raw = String(input.value ?? "").trim();
        input.classList.remove("is-saved","is-error");
        input.classList.add("is-saving");
        input.disabled = true;
        try{
            if(raw === ""){
                await BriMerchantDaily.remove({tanggal,cabangId});
            }else{
                const value = Number(raw);
                if(!Number.isFinite(value) || value < 0) throw new Error("Nominal BRI Merchant tidak valid.");
                await BriMerchantDaily.save({tanggal,cabangId,value,userId});
            }
            input.classList.add("is-saved");
            setTimeout(()=>input.classList.remove("is-saved"),900);
            document.dispatchEvent(new CustomEvent("erp:bri-merchant-daily-saved",{detail:{tanggal,cabangId}}));
        }catch(err){
            input.classList.add("is-error");
            console.error("BRI Merchant Daily save gagal:",err);
            alert(`BRI Merchant gagal disimpan: ${err?.message || err}`);
        }finally{
            input.classList.remove("is-saving");
            input.disabled = !canEdit();
        }
    }

    function bind(){
        document.addEventListener("change", (e)=>{
            const input = e.target.closest?.("#thcTable .thc-bri-daily-input");
            if(input) saveInput(input);
        });
        document.addEventListener("keydown", (e)=>{
            const input = e.target.closest?.("#thcTable .thc-bri-daily-input");
            if(input && e.key === "Enter"){
                e.preventDefault();
                input.blur();
            }
        });
    }

    function patchRender(){
        if(patched || typeof TabelHarianCabang === "undefined" || typeof TabelHarianCabang.renderTable !== "function") return false;
        patched = true;
        const original = TabelHarianCabang.renderTable.bind(TabelHarianCabang);
        TabelHarianCabang.renderTable = function(...args){
            const out = original(...args);
            queueMicrotask(()=>refresh());
            return out;
        };
        return true;
    }

    async function boot(){
        ensureStyle();
        bind();
        await loadIdentity();
        let tries = 0;
        const timer = setInterval(()=>{
            tries += 1;
            if(patchRender() || tries > 80){
                clearInterval(timer);
                refresh();
            }
        },50);
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
    else boot();
})();
