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
    const MODAL_ID = "thcBriDailyModal";
    let role = "";
    let userId = null;
    let loadSeq = 0;
    let refreshTimer = null;
    let observer = null;
    let bound = false;
    let activeMeta = null;

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const s = document.createElement("style");
        s.id = STYLE_ID;
        s.textContent = `
            #thcTable th.thc-bri-daily-head,
            #thcTable td.thc-bri-daily-cell{
                min-width:108px;
                width:108px;
                max-width:108px;
                text-align:right;
            }
            #thcTable th.thc-bri-daily-head{
                color:#e6b8ff !important;
                background:#0f151d !important;
                white-space:nowrap;
            }
            #thcTable td.thc-bri-daily-cell{
                background:#151d27;
                padding:5px 7px;
            }
            #thcTable .thc-bri-cell-btn{
                width:100%;
                border:1px solid rgba(190,120,255,.28);
                border-radius:7px;
                background:#111923;
                color:#c084fc !important;
                font:700 12.5px/1.1 "Source Sans 3",sans-serif;
                text-align:right;
                padding:7px 8px;
                cursor:pointer;
                white-space:nowrap;
            }
            #thcTable .thc-bri-cell-btn:hover,
            #thcTable .thc-bri-cell-btn:focus{
                border-color:#d28cff;
                box-shadow:0 0 0 2px rgba(210,140,255,.10);
                outline:none;
            }
            #thcTable .thc-bri-cell-btn.is-empty{color:#c084fc !important;font-weight:700}

            .thc-bri-modal[hidden]{display:none!important}
            .thc-bri-modal{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px}
            .thc-bri-modal-backdrop{position:absolute;inset:0;background:rgba(2,7,12,.78);backdrop-filter:blur(5px)}
            .thc-bri-modal-panel{position:relative;width:min(430px,calc(100vw - 32px));border:1px solid rgba(210,140,255,.35);border-radius:16px;background:#0f1721;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
            .thc-bri-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08)}
            .thc-bri-modal-head h3{margin:0;color:#e6b8ff;font:800 20px/1.15 "Source Sans 3",sans-serif}
            .thc-bri-modal-head p{margin:5px 0 0;color:#91a0b1;font:600 12px/1.3 "Source Sans 3",sans-serif}
            .thc-bri-modal-x{width:36px;height:36px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:#172231;color:#fff;font-size:20px;cursor:pointer}
            .thc-bri-modal-body{padding:20px}
            .thc-bri-modal-label{display:block;margin-bottom:8px;color:#aeb9c7;font:700 12px/1 "Source Sans 3",sans-serif;text-transform:uppercase;letter-spacing:.08em}
            .thc-bri-modal-input{width:100%;box-sizing:border-box;border:1px solid rgba(190,120,255,.42);border-radius:10px;background:#101821;color:#f2d7ff;font:800 22px/1.1 "Source Sans 3",sans-serif;text-align:right;padding:13px 14px;outline:none}
            .thc-bri-modal-input:focus{border-color:#d28cff;box-shadow:0 0 0 3px rgba(210,140,255,.12)}
            .thc-bri-modal-input[readonly]{cursor:default;color:#e9d8f4;background:#111923}
            .thc-bri-modal-input.is-error{border-color:#ff5c66;color:#ff8f96}
            .thc-bri-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
            .thc-bri-modal-btn{min-width:96px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#1a2633;color:#f3f6f9;font:800 13px/1 "Source Sans 3",sans-serif;padding:11px 16px;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.22);transition:transform .15s ease,filter .15s ease,border-color .15s ease}
            .thc-bri-modal-btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.12)}
            .thc-bri-modal-btn[data-action="edit"]{color:#ffe078;border-color:rgba(255,208,67,.78);background:rgba(126,92,10,.30)}
            .thc-bri-modal-btn[data-action="save"]{color:#7ff3c4;border-color:rgba(78,223,164,.78);background:rgba(18,105,73,.32)}
            .thc-bri-modal-btn[data-action="delete"]{color:#ff9aa0;border-color:rgba(255,92,102,.76);background:rgba(118,31,38,.30)}
            .thc-bri-modal-btn:disabled{opacity:.62;cursor:not-allowed;box-shadow:none;filter:saturate(.72)}
        `;
        document.head.appendChild(s);
    }

    function ensureModal(){
        if(document.getElementById(MODAL_ID)) return;
        const modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.className = "thc-bri-modal";
        modal.hidden = true;
        modal.innerHTML = `
          <div class="thc-bri-modal-backdrop" data-bri-close></div>
          <div class="thc-bri-modal-panel" role="dialog" aria-modal="true" aria-labelledby="thcBriModalTitle">
            <div class="thc-bri-modal-head">
              <div><h3 id="thcBriModalTitle">BRI Merchant</h3><p id="thcBriModalMeta">—</p></div>
              <button type="button" class="thc-bri-modal-x" data-bri-close aria-label="Tutup">×</button>
            </div>
            <div class="thc-bri-modal-body">
              <label class="thc-bri-modal-label" for="thcBriModalInput">Nominal BRI Merchant</label>
              <input id="thcBriModalInput" class="thc-bri-modal-input" type="text" inputmode="numeric" autocomplete="off" placeholder="Rp 0">
              <div class="thc-bri-modal-actions">
                <button type="button" class="thc-bri-modal-btn" data-action="edit">Edit</button>
                <button type="button" class="thc-bri-modal-btn" data-action="save">Simpan</button>
                <button type="button" class="thc-bri-modal-btn" data-action="delete">Hapus</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
    }

    async function loadIdentity(){
        try{
            const { data: sessionData } = await db.auth.getSession();
            userId = sessionData?.session?.user?.id || null;
            if(!userId) return;
            const { data, error } = await db.from("profiles").select("role,aktif").eq("id", userId).maybeSingle();
            if(error) throw error;
            if(data?.aktif !== false) role = String(data?.role || "").trim().toLowerCase();
        }catch(err){ role = ""; console.warn("BRI Merchant identity tidak terbaca:", err); }
    }

    function canEdit(){ return role === "owner" || role === "svp" || role === "spv"; }
    function currentRows(){ return (typeof TabelHarianCabang !== "undefined" && Array.isArray(TabelHarianCabang.rows)) ? TabelHarianCabang.rows : []; }
    function parseAmount(raw){ const cleaned=String(raw??"").replace(/[^0-9]/g,""); if(cleaned==="") return null; const n=Number(cleaned); return Number.isFinite(n)?n:NaN; }
    function formatAmount(value){ const n=Number(value); if(!Number.isFinite(n)) return "Rp 0"; return `Rp ${new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(n)}`; }
    function getBounds(rows){ const dates=rows.map(r=>String(r?.tanggal||"").slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort(); return dates.length?{start:dates[0],end:dates[dates.length-1]}:null; }
    function findHeaderIndex(table,label){ const wanted=String(label||"").trim().toUpperCase(); return [...table.querySelectorAll("thead th")].findIndex(th=>String(th.textContent||"").trim().toUpperCase()===wanted); }
    function ensureHeader(table){ const row=table.querySelector("thead tr"); if(!row)return-1; const existing=row.querySelector("th.thc-bri-daily-head"); if(existing)return[...row.children].indexOf(existing); const nonIdx=findHeaderIndex(table,"NON TUNAI"); if(nonIdx<0)return-1; const th=document.createElement("th"); th.className="thc-bri-daily-head"; th.scope="col"; th.textContent="BRI MERCHANT"; row.children[nonIdx].insertAdjacentElement("afterend",th); return[...row.children].indexOf(th); }

    function makeCellButton(meta,saved){
        const btn=document.createElement("button");
        btn.type="button";
        btn.className=`thc-bri-cell-btn${saved?"":" is-empty"}`;
        btn.dataset.tanggal=String(meta.tanggal||"").slice(0,10);
        btn.dataset.cabangId=String(Number(meta.cabang_id));
        btn.dataset.cabangName=String(meta.cabang_name||"");
        btn.textContent=saved?formatAmount(saved.bri_non_cash_actual):"Rp 0";
        btn.title="Klik untuk input / edit BRI Merchant";
        return btn;
    }

    function ensureCells(){
        const table=document.getElementById("thcTable"),tbody=document.getElementById("thcTbody"),rows=currentRows();
        if(!table||!tbody||!rows.length)return false;
        if(ensureHeader(table)<0)return false;
        const trs=[...tbody.querySelectorAll("tr")]; if(!trs.length)return false;
        trs.forEach((tr,i)=>{
            const meta=rows[i]; if(!meta)return;
            tr.dataset.tanggal=tr.dataset.tanggal||String(meta.tanggal||"").slice(0,10);
            tr.dataset.cabangId=String(Number(meta.cabang_id));
            let td=tr.querySelector("td.thc-bri-daily-cell");
            if(!td){ const nonIdx=findHeaderIndex(table,"NON TUNAI"),nonCell=tr.children[nonIdx]; if(!nonCell)return; td=document.createElement("td"); td.className="thc-bri-daily-cell"; nonCell.insertAdjacentElement("afterend",td); }
            const saved=BriMerchantDaily.get(meta.tanggal,meta.cabang_id);
            td.replaceChildren(makeCellButton(meta,saved));
        });
        return true;
    }

    async function refresh(){
        const rows=currentRows(); if(!rows.length){ensureCells();return;}
        const bounds=getBounds(rows); if(!bounds)return;
        const ids=[...new Set(rows.map(r=>Number(r.cabang_id)).filter(Number.isFinite))],seq=++loadSeq;
        try{ await BriMerchantDaily.loadRange({start:bounds.start,end:bounds.end,cabangIds:ids}); if(seq!==loadSeq)return; ensureCells(); }
        catch(err){ console.error("BRI Merchant Daily load gagal:",err); ensureCells(); }
    }
    function scheduleRefresh(delay=20){ clearTimeout(refreshTimer); refreshTimer=setTimeout(()=>refresh(),delay); }

    function modalEls(){
        const modal=document.getElementById(MODAL_ID);
        return {modal,input:modal?.querySelector("#thcBriModalInput"),meta:modal?.querySelector("#thcBriModalMeta"),edit:modal?.querySelector('[data-action="edit"]'),save:modal?.querySelector('[data-action="save"]'),del:modal?.querySelector('[data-action="delete"]')};
    }

    function syncModal(){
        const {input,edit,save,del}=modalEls(); if(!input||!activeMeta)return;
        const saved=BriMerchantDaily.get(activeMeta.tanggal,activeMeta.cabangId);
        const hasSaved=!!saved;
        const editable=canEdit();
        if(edit)edit.disabled=!editable||!hasSaved||!input.readOnly;
        if(save)save.disabled=!editable||input.readOnly;
        if(del)del.disabled=!editable||!hasSaved;
    }

    function openModal(btn){
        ensureModal();
        const tanggal=String(btn.dataset.tanggal||"").slice(0,10),cabangId=Number(btn.dataset.cabangId),cabangName=String(btn.dataset.cabangName||"");
        activeMeta={tanggal,cabangId,cabangName};
        const saved=BriMerchantDaily.get(tanggal,cabangId);
        const {modal,input,meta}=modalEls(); if(!modal||!input)return;
        if(meta)meta.textContent=`${cabangName||"Cabang"} · ${tanggal}`;
        input.classList.remove("is-error");
        input.value=saved?formatAmount(saved.bri_non_cash_actual):"";
        input.readOnly=!!saved || !canEdit();
        modal.hidden=false;
        document.body.style.overflow="hidden";
        syncModal();
        if(!saved&&canEdit()){ requestAnimationFrame(()=>input.focus()); }
    }

    function closeModal(){ const {modal}=modalEls(); if(modal)modal.hidden=true; document.body.style.overflow=""; activeMeta=null; }

    async function saveModal(){
        if(!canEdit()||!activeMeta)return;
        const {input}=modalEls(); if(!input)return;
        const value=parseAmount(input.value);
        if(value===null||!Number.isFinite(value)||value<0){ input.classList.add("is-error"); return; }
        input.classList.remove("is-error");
        try{
            await BriMerchantDaily.save({tanggal:activeMeta.tanggal,cabangId:activeMeta.cabangId,value,userId});
            input.value=formatAmount(value); input.readOnly=true; syncModal(); ensureCells();
            document.dispatchEvent(new CustomEvent("erp:bri-merchant-daily-saved",{detail:{tanggal:activeMeta.tanggal,cabangId:activeMeta.cabangId}}));
        }catch(err){ input.classList.add("is-error"); alert(`BRI Merchant gagal disimpan: ${err?.message||err}`); }
    }

    async function deleteModal(){
        if(!canEdit()||!activeMeta)return;
        try{
            await BriMerchantDaily.remove({tanggal:activeMeta.tanggal,cabangId:activeMeta.cabangId});
            const {input}=modalEls(); if(input){input.value="";input.readOnly=false;} syncModal(); ensureCells();
            document.dispatchEvent(new CustomEvent("erp:bri-merchant-daily-saved",{detail:{tanggal:activeMeta.tanggal,cabangId:activeMeta.cabangId,deleted:true}}));
        }catch(err){ alert(`BRI Merchant gagal dihapus: ${err?.message||err}`); }
    }

    function bindEvents(){
        if(bound)return; bound=true;
        document.addEventListener("click",e=>{
            const cellBtn=e.target.closest?.("#thcTable .thc-bri-cell-btn"); if(cellBtn){openModal(cellBtn);return;}
            if(e.target.closest?.("[data-bri-close]")){closeModal();return;}
            const actionBtn=e.target.closest?.(`#${MODAL_ID} [data-action]`); if(!actionBtn)return;
            const {input}=modalEls();
            if(actionBtn.dataset.action==="edit"&&input){input.readOnly=false;input.focus();input.select();syncModal();}
            else if(actionBtn.dataset.action==="save")saveModal();
            else if(actionBtn.dataset.action==="delete")deleteModal();
        });
        document.addEventListener("input",e=>{ const input=e.target.closest?.(`#${MODAL_ID} .thc-bri-modal-input`); if(!input||input.readOnly)return; const n=parseAmount(input.value); input.value=n===null?"":formatAmount(n); });
        document.addEventListener("keydown",e=>{
            const input=e.target.closest?.(`#${MODAL_ID} .thc-bri-modal-input`);
            if(input&&!input.readOnly&&e.key==="Enter"){e.preventDefault();saveModal();}
            if(e.key==="Escape"&&!document.getElementById(MODAL_ID)?.hidden)closeModal();
        });
        document.addEventListener("erp:components-ready",()=>scheduleRefresh(0));
    }

    function observeTable(){ const tbody=document.getElementById("thcTbody"); if(!tbody||observer)return; observer=new MutationObserver(()=>scheduleRefresh(10)); observer.observe(tbody,{childList:true}); }
    async function boot(){
        ensureStyle(); ensureModal(); bindEvents(); await loadIdentity();
        let tries=0; const timer=setInterval(()=>{tries+=1;observeTable();ensureCells();if(typeof TabelHarianCabang!=="undefined"&&currentRows().length){clearInterval(timer);scheduleRefresh(0);}else if(tries>=100)clearInterval(timer);},50);
    }

    window.TabelHarianBriMerchant={refresh:()=>refresh(),ensureCells:()=>ensureCells()};
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();