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
                min-width:152px;
                width:152px;
                text-align:right;
            }
            #thcTable th.thc-bri-daily-head{
                color:#e6b8ff !important;
                background:#0f151d !important;
                white-space:nowrap;
            }
            #thcTable td.thc-bri-daily-cell{
                background:#151d27;
                padding:5px 6px;
            }
            #thcTable .thc-bri-wrap{
                display:flex;
                flex-direction:column;
                align-items:stretch;
                gap:4px;
            }
            #thcTable .thc-bri-daily-input{
                width:100%;
                box-sizing:border-box;
                border:1px solid rgba(190,120,255,.42);
                border-radius:7px;
                background:#101821;
                color:#f2d7ff;
                font:700 12.5px/1.1 "Source Sans 3",sans-serif;
                text-align:right;
                padding:6px 8px;
                outline:none;
            }
            #thcTable .thc-bri-daily-input[readonly]{
                cursor:default;
                background:#111923;
                color:#e9d8f4;
            }
            #thcTable .thc-bri-daily-input:focus{
                border-color:#d28cff;
                box-shadow:0 0 0 2px rgba(210,140,255,.14);
            }
            #thcTable .thc-bri-actions{
                display:grid;
                grid-template-columns:repeat(3,minmax(0,1fr));
                gap:3px;
            }
            #thcTable .thc-bri-btn{
                border:1px solid rgba(255,255,255,.12);
                border-radius:6px;
                background:#18222d;
                color:#cbd5df;
                font:700 9.5px/1 "Source Sans 3",sans-serif;
                padding:5px 2px;
                cursor:pointer;
            }
            #thcTable .thc-bri-btn[data-action="save"]{color:#70e6b5;border-color:rgba(112,230,181,.35)}
            #thcTable .thc-bri-btn[data-action="edit"]{color:#f0cf68;border-color:rgba(240,207,104,.35)}
            #thcTable .thc-bri-btn[data-action="delete"]{color:#ff8a91;border-color:rgba(255,138,145,.35)}
            #thcTable .thc-bri-btn:disabled{opacity:.32;cursor:not-allowed}
            #thcTable .thc-bri-daily-input.is-saving{opacity:.55}
            #thcTable .thc-bri-daily-input.is-saved{border-color:rgba(76,226,180,.9)}
            #thcTable .thc-bri-daily-input.is-error{border-color:#ff5c66;color:#ff8f96}
        `;
        document.head.appendChild(s);
    }

    async function loadIdentity(){
        try{
            const { data: sessionData } = await db.auth.getSession();
            userId = sessionData?.session?.user?.id || null;
            if(!userId) return;
            const { data, error } = await db.from("profiles").select("role,aktif").eq("id", userId).maybeSingle();
            if(error) throw error;
            if(data?.aktif !== false) role = String(data?.role || "").trim().toLowerCase();
        }catch(err){
            role = "";
            console.warn("BRI Merchant identity tidak terbaca:", err);
        }
    }

    function canEdit(){ return role === "owner" || role === "svp" || role === "spv"; }
    function currentRows(){ return (typeof TabelHarianCabang !== "undefined" && Array.isArray(TabelHarianCabang.rows)) ? TabelHarianCabang.rows : []; }
    function parseAmount(raw){
        const cleaned = String(raw ?? "").replace(/[^0-9]/g, "");
        if(cleaned === "") return null;
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : NaN;
    }
    function formatAmount(value){
        const n = Number(value);
        if(!Number.isFinite(n)) return "";
        return `Rp ${new Intl.NumberFormat("id-ID", {maximumFractionDigits:0}).format(n)}`;
    }
    function getBounds(rows){
        const dates = rows.map(r=>String(r?.tanggal||"").slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
        return dates.length ? {start:dates[0],end:dates[dates.length-1]} : null;
    }
    function findHeaderIndex(table,label){
        const wanted=String(label||"").trim().toUpperCase();
        return [...table.querySelectorAll("thead th")].findIndex(th=>String(th.textContent||"").trim().toUpperCase()===wanted);
    }
    function ensureHeader(table){
        const row=table.querySelector("thead tr"); if(!row) return -1;
        const existing=row.querySelector("th.thc-bri-daily-head");
        if(existing) return [...row.children].indexOf(existing);
        const nonIdx=findHeaderIndex(table,"NON TUNAI"); if(nonIdx<0) return -1;
        const th=document.createElement("th"); th.className="thc-bri-daily-head"; th.scope="col"; th.textContent="BRI MERCHANT";
        row.children[nonIdx].insertAdjacentElement("afterend",th);
        return [...row.children].indexOf(th);
    }

    function makeCell(meta,saved){
        const wrap=document.createElement("div"); wrap.className="thc-bri-wrap";
        const input=document.createElement("input");
        input.type="text"; input.inputMode="numeric"; input.autocomplete="off"; input.className="thc-bri-daily-input";
        input.placeholder="Rp 0"; input.dataset.tanggal=String(meta.tanggal||"").slice(0,10); input.dataset.cabangId=String(Number(meta.cabang_id));
        const hasSaved=!!saved; input.dataset.saved=hasSaved?"1":"0"; input.value=hasSaved?formatAmount(saved.bri_non_cash_actual):"";
        input.readOnly=hasSaved || !canEdit();
        const actions=document.createElement("div"); actions.className="thc-bri-actions";
        actions.innerHTML='<button type="button" class="thc-bri-btn" data-action="edit">Edit</button><button type="button" class="thc-bri-btn" data-action="save">Simpan</button><button type="button" class="thc-bri-btn" data-action="delete">Hapus</button>';
        wrap.append(input,actions); syncButtons(wrap);
        return wrap;
    }

    function syncButtons(wrap){
        const input=wrap?.querySelector(".thc-bri-daily-input"); if(!input) return;
        const saved=input.dataset.saved==="1"; const editable=canEdit(); const editing=!input.readOnly;
        const edit=wrap.querySelector('[data-action="edit"]'); const save=wrap.querySelector('[data-action="save"]'); const del=wrap.querySelector('[data-action="delete"]');
        if(edit) edit.disabled=!editable || !saved || editing;
        if(save) save.disabled=!editable || !editing;
        if(del) del.disabled=!editable || !saved;
    }

    function ensureCells(){
        const table=document.getElementById("thcTable"),tbody=document.getElementById("thcTbody"),rows=currentRows();
        if(!table||!tbody||!rows.length) return false;
        if(ensureHeader(table)<0) return false;
        const trs=[...tbody.querySelectorAll("tr")]; if(!trs.length) return false;
        trs.forEach((tr,i)=>{
            const meta=rows[i]; if(!meta) return;
            tr.dataset.tanggal=tr.dataset.tanggal||String(meta.tanggal||"").slice(0,10); tr.dataset.cabangId=String(Number(meta.cabang_id));
            let td=tr.querySelector("td.thc-bri-daily-cell");
            if(!td){ const nonIdx=findHeaderIndex(table,"NON TUNAI"),nonCell=tr.children[nonIdx]; if(!nonCell) return; td=document.createElement("td"); td.className="thc-bri-daily-cell"; nonCell.insertAdjacentElement("afterend",td); }
            const saved=BriMerchantDaily.get(meta.tanggal,meta.cabang_id);
            let input=td.querySelector(".thc-bri-daily-input");
            if(!input){ td.replaceChildren(makeCell(meta,saved)); return; }
            input.dataset.tanggal=String(meta.tanggal||"").slice(0,10); input.dataset.cabangId=String(Number(meta.cabang_id));
            if(document.activeElement!==input){ input.dataset.saved=saved?"1":"0"; input.value=saved?formatAmount(saved.bri_non_cash_actual):""; input.readOnly=!!saved || !canEdit(); syncButtons(td.querySelector(".thc-bri-wrap")); }
        });
        return true;
    }

    async function refresh(){
        const rows=currentRows(); if(!rows.length){ensureCells();return;}
        const bounds=getBounds(rows); if(!bounds) return;
        const ids=[...new Set(rows.map(r=>Number(r.cabang_id)).filter(Number.isFinite))],seq=++loadSeq;
        try{ await BriMerchantDaily.loadRange({start:bounds.start,end:bounds.end,cabangIds:ids}); if(seq!==loadSeq)return; ensureCells(); }
        catch(err){ console.error("BRI Merchant Daily load gagal:",err); ensureCells(); }
    }
    function scheduleRefresh(delay=20){ clearTimeout(refreshTimer); refreshTimer=setTimeout(()=>refresh(),delay); }

    async function saveCell(wrap){
        if(!canEdit()) return;
        const input=wrap.querySelector(".thc-bri-daily-input"); if(!input) return;
        const tanggal=String(input.dataset.tanggal||"").slice(0,10),cabangId=Number(input.dataset.cabangId),value=parseAmount(input.value);
        if(value===null || !Number.isFinite(value) || value<0){ input.classList.add("is-error"); return; }
        input.classList.remove("is-error","is-saved"); input.classList.add("is-saving");
        try{
            await BriMerchantDaily.save({tanggal,cabangId,value,userId});
            input.dataset.saved="1"; input.value=formatAmount(value); input.readOnly=true; input.classList.add("is-saved");
            setTimeout(()=>input.classList.remove("is-saved"),900); syncButtons(wrap);
            document.dispatchEvent(new CustomEvent("erp:bri-merchant-daily-saved",{detail:{tanggal,cabangId}}));
        }catch(err){ input.classList.add("is-error"); alert(`BRI Merchant gagal disimpan: ${err?.message||err}`); }
        finally{ input.classList.remove("is-saving"); }
    }

    async function deleteCell(wrap){
        if(!canEdit()) return;
        const input=wrap.querySelector(".thc-bri-daily-input"); if(!input) return;
        const tanggal=String(input.dataset.tanggal||"").slice(0,10),cabangId=Number(input.dataset.cabangId);
        try{
            await BriMerchantDaily.remove({tanggal,cabangId});
            input.dataset.saved="0"; input.value=""; input.readOnly=false; syncButtons(wrap);
            document.dispatchEvent(new CustomEvent("erp:bri-merchant-daily-saved",{detail:{tanggal,cabangId,deleted:true}}));
        }catch(err){ alert(`BRI Merchant gagal dihapus: ${err?.message||err}`); }
    }

    function bindEvents(){
        if(bound) return; bound=true;
        document.addEventListener("input",e=>{
            const input=e.target.closest?.("#thcTable .thc-bri-daily-input"); if(!input||input.readOnly) return;
            const n=parseAmount(input.value); input.value=n===null?"":formatAmount(n);
        });
        document.addEventListener("click",e=>{
            const btn=e.target.closest?.("#thcTable .thc-bri-btn"); if(!btn) return;
            const wrap=btn.closest(".thc-bri-wrap"),input=wrap?.querySelector(".thc-bri-daily-input"); if(!wrap||!input) return;
            const action=btn.dataset.action;
            if(action==="edit"){ input.readOnly=false; input.focus(); input.select(); syncButtons(wrap); }
            else if(action==="save") saveCell(wrap);
            else if(action==="delete") deleteCell(wrap);
        });
        document.addEventListener("keydown",e=>{
            const input=e.target.closest?.("#thcTable .thc-bri-daily-input"); if(input&&!input.readOnly&&e.key==="Enter"){ e.preventDefault(); saveCell(input.closest(".thc-bri-wrap")); }
        });
        document.addEventListener("erp:components-ready",()=>scheduleRefresh(0));
    }

    function observeTable(){
        const tbody=document.getElementById("thcTbody"); if(!tbody||observer) return;
        observer=new MutationObserver(()=>scheduleRefresh(10)); observer.observe(tbody,{childList:true});
    }
    async function boot(){
        ensureStyle(); bindEvents(); await loadIdentity();
        let tries=0; const timer=setInterval(()=>{ tries+=1; observeTable(); ensureCells(); if(typeof TabelHarianCabang!=="undefined"&&currentRows().length){clearInterval(timer);scheduleRefresh(0);}else if(tries>=100)clearInterval(timer); },50);
    }

    window.TabelHarianBriMerchant={refresh:()=>refresh(),ensureCells:()=>ensureCells()};
    if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();
})();
