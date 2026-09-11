/*
=========================================================
VAX ERP — TABEL HARIAN TOTAL CARD UI / DRILLDOWN RESTORE
=========================================================
UI / PRESENTATION ONLY.
- Mengembalikan nominal card agar tidak terpotong ellipsis.
- Mengaktifkan popup rincian per cabang untuk card TOTAL PERIODE core.
- Mengaktifkan kembali presenter drilldown Share Cukur & Proteksi.
- Menjaga Cash Out tetap memakai jalur native ke modul Cash Out.
- Tidak mengubah DashboardEngine, DailyDataEngine, SetoranMoneyEngine,
  formula, source Supabase, penyimpanan, atau workflow.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcTotalCardRestoreStyle";
    const MODAL_ID = "thcTotalCardDetailModal";
    const LOADER_ID = "thcTotalCardRestoreLoader";
    let bound = false;
    let observer = null;

    const CORE = {
        thcTotOmzet:        { label:"Omzet / Gross", key:"omzet", format:"money" },
        thcTotGrossService: { label:"Gross Service", key:"gross_service", format:"money" },
        thcTotProduk:       { label:"Product Terjual", key:"produk", format:"money" },
        thcTotNett:         { label:"Nett Revenue", key:"nett", format:"money" },
        thcTotNonTunai:     { label:"Non Tunai Minutes", key:"non_cash", format:"money" },
        thcTotCash:         { label:"Cash Kotor", key:"cash", format:"money" },
        thcTotSetoran:      { label:"Cash Bersih", key:"setoran_cash_aktual", format:"money" },
        thcTotCustomer:     { label:"Customer", key:"customer", format:"int" },
        thcTotTransaksi:    { label:"Transaksi", key:"transaction", format:"int" },
        thcTotServices:     { label:"Services", key:"services", format:"int" },
        thcTotAvgTicket:    { label:"Avg Ticket", key:"avg_ticket", format:"money" },
        thcTotShareProduk:  { label:"Share Produk", rawKey:"share_produk", format:"money" },
        thcTotNettProduk:   { label:"Nett Produk", rawFormula:"nettProduk", format:"money" }
    };

    function ensureStyles(){
        if(document.getElementById(STYLE_ID)) return;
        const style=document.createElement("style");
        style.id=STYLE_ID;
        style.textContent=`
            /* Nominal jangan pernah dipotong dengan ellipsis. */
            body.setoran-dark .erp-wrapper .thc-page .thc-tot-item > strong,
            body.setoran-dark .erp-wrapper .thc-page .thc-tot-item.is-explained > strong,
            body.setoran-dark .erp-wrapper .thc-page .thc-tot-item.is-explained.is-actual > strong{
                width:100%!important;
                max-width:100%!important;
                min-width:0!important;
                white-space:nowrap!important;
                overflow:visible!important;
                text-overflow:clip!important;
                font-size:clamp(12.5px,1vw,15px)!important;
                letter-spacing:-.01em!important;
                font-variant-numeric:tabular-nums!important;
            }
            body.setoran-dark .erp-wrapper .thc-page .thc-totals-grid > .thc-tot-item{
                min-width:0!important;
                overflow:visible!important;
            }
            body.setoran-dark .erp-wrapper .thc-page .thc-tot-item.thc-detail-card{
                position:relative!important;
                cursor:pointer!important;
                padding-right:34px!important;
            }
            body.setoran-dark .erp-wrapper .thc-page .thc-tot-item.thc-detail-card .thc-detail-hint{
                position:absolute;right:8px;bottom:7px;width:20px;height:20px;
                display:grid;place-items:center;border:1px solid rgba(255,255,255,.22);
                border-radius:7px;background:rgba(255,255,255,.055);color:currentColor;
                font-size:11px;font-weight:900;line-height:1;pointer-events:none;opacity:.9;
            }
            body.setoran-dark .erp-wrapper .thc-page .thc-tot-item.thc-detail-card:focus-visible{
                outline:2px solid rgba(242,194,48,.78)!important;outline-offset:2px!important;
            }

            #${MODAL_ID}[hidden]{display:none!important}
            #${MODAL_ID}{position:fixed;inset:0;z-index:100050;display:grid;place-items:center;padding:18px;box-sizing:border-box}
            #${MODAL_ID} .thcd-backdrop{position:absolute;inset:0;background:rgba(2,6,12,.84);backdrop-filter:blur(5px)}
            #${MODAL_ID} .thcd-panel{position:relative;z-index:1;width:min(900px,96vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1.5px solid rgba(216,165,59,.48);border-radius:17px;background:linear-gradient(180deg,#111a25,#08111b);box-shadow:0 28px 80px rgba(0,0,0,.68);color:#eef4fa}
            #${MODAL_ID} .thcd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(216,165,59,.23);background:linear-gradient(180deg,#182431,#101923)}
            #${MODAL_ID} .thcd-kicker{display:block;color:#f2c94c;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
            #${MODAL_ID} h3{margin:0;font-size:21px;line-height:1.12;font-weight:900}
            #${MODAL_ID} .thcd-period{margin:5px 0 0;color:#aebdca;font-size:12px;font-weight:700}
            #${MODAL_ID} .thcd-close{width:40px;height:40px;flex:0 0 auto;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:#172230;color:#fff;font-size:23px;cursor:pointer}
            #${MODAL_ID} .thcd-total{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 20px;border-bottom:1px solid rgba(216,165,59,.16);background:rgba(216,165,59,.05)}
            #${MODAL_ID} .thcd-total span{color:#b8c6d3;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
            #${MODAL_ID} .thcd-total strong{color:#f4c74d;font-size:24px;font-weight:900;font-variant-numeric:tabular-nums}
            #${MODAL_ID} .thcd-body{min-height:0;overflow:auto;scrollbar-color:#ad832d #0a131d;scrollbar-width:thin}
            #${MODAL_ID} table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}
            #${MODAL_ID} th{position:sticky;top:0;z-index:2;padding:12px 15px;background:#15212d;color:#f2c94c;border-bottom:1px solid rgba(216,165,59,.38);text-align:left;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
            #${MODAL_ID} th:last-child,#${MODAL_ID} td:last-child{text-align:right}
            #${MODAL_ID} td{padding:13px 15px;border-bottom:1px solid rgba(216,165,59,.13);background:#0a131d;color:#eaf0f6;font-weight:750}
            #${MODAL_ID} tbody tr:nth-child(even) td{background:#0d1823}
            #${MODAL_ID} td:first-child{font-weight:900;color:#fff}
            #${MODAL_ID} td:last-child{font-weight:900;font-variant-numeric:tabular-nums;color:#f5cf69}
            #${MODAL_ID} .thcd-empty{padding:34px;text-align:center;color:#aab8c6;font-weight:700}
            @media(max-width:700px){#${MODAL_ID}{padding:6px}#${MODAL_ID} .thcd-panel{width:100%;max-height:96vh;border-radius:13px}#${MODAL_ID} .thcd-head{padding:14px}#${MODAL_ID} .thcd-total{padding:11px 14px}#${MODAL_ID} .thcd-total strong{font-size:20px}}
        `;
        document.head.appendChild(style);
    }

    function formatMoney(v){
        if(typeof TabelHarianCabang?.formatRupiah === "function") return TabelHarianCabang.formatRupiah(Number(v||0));
        return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0));
    }
    function formatInt(v){
        if(typeof TabelHarianCabang?.formatInt === "function") return TabelHarianCabang.formatInt(Number(v||0));
        return Number(v||0).toLocaleString("id-ID");
    }
    function shortName(name){
        if(typeof TabelHarianCabang?.shortCabangName === "function") return TabelHarianCabang.shortCabangName(name);
        return String(name||"—").replace(/^vax\s+wijaya\s+/i,"").trim()||"—";
    }
    function currentPeriod(){
        const start=DashboardEngine?.lastRange?.start||"";
        const end=DashboardEngine?.lastRange?.end||start;
        return start&&end ? (start===end?start:`${start} — ${end}`) : "Periode aktif";
    }

    function branchGroups(){
        const map=new Map();
        const rows=Array.isArray(TabelHarianCabang?.rows)?TabelHarianCabang.rows:[];
        rows.forEach(r=>{
            const id=Number(r.cabang_id);
            const key=Number.isFinite(id)?String(id):String(r.cabang_name||"—");
            if(!map.has(key)) map.set(key,{id,key,name:shortName(r.cabang_name||r.nama_cabang||`Cabang #${key}`),rows:[]});
            map.get(key).rows.push(r);
        });
        return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
    }

    function rawValueForBranch(group, meta){
        if(meta.rawKey){
            return group.rows.reduce((sum,r)=>sum+Number(r?.raw?.[meta.rawKey] ?? r?.[meta.rawKey] ?? 0),0);
        }
        if(meta.rawFormula==="nettProduk"){
            return group.rows.reduce((sum,r)=>{
                const raw=r?.raw||r||{};
                const produk=Number(raw.produk ?? r.produk ?? 0);
                const share=Number(raw.share_produk ?? r.share_produk ?? 0);
                return sum+(produk-share);
            },0);
        }
        return 0;
    }

    function rowsForMetric(meta){
        return branchGroups().map(group=>{
            let value=0;
            if(meta.key && typeof TabelHarianCabang?.computeTotals === "function"){
                const t=TabelHarianCabang.computeTotals(group.rows);
                value=Number(t?.[meta.key]||0);
            }else{
                value=rawValueForBranch(group,meta);
            }
            return {...group,value};
        }).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||a.name.localeCompare(b.name));
    }

    function ensureModal(){
        let modal=document.getElementById(MODAL_ID);
        if(modal) return modal;
        modal=document.createElement("div");
        modal.id=MODAL_ID;
        modal.hidden=true;
        modal.innerHTML=`<div class="thcd-backdrop" data-thcd-close></div><section class="thcd-panel" role="dialog" aria-modal="true" aria-labelledby="thcdTitle"><div class="thcd-head"><div><span class="thcd-kicker">RINCIAN TOTAL PERIODE</span><h3 id="thcdTitle">—</h3><p class="thcd-period" id="thcdPeriod">—</p></div><button type="button" class="thcd-close" data-thcd-close aria-label="Tutup">×</button></div><div class="thcd-total"><span>Total periode</span><strong id="thcdGrand">—</strong></div><div class="thcd-body" id="thcdBody"></div></section>`;
        document.body.appendChild(modal);
        modal.addEventListener("click",e=>{ if(e.target.closest("[data-thcd-close]")) closeModal(); });
        return modal;
    }

    function openMetric(meta,valueEl){
        const modal=ensureModal();
        const rows=rowsForMetric(meta);
        const formatter=meta.format==="int"?formatInt:formatMoney;
        document.getElementById("thcdTitle").textContent=`${meta.label} · Per Cabang`;
        document.getElementById("thcdPeriod").textContent=currentPeriod();
        document.getElementById("thcdGrand").textContent=String(valueEl?.textContent||"—").trim()||"—";
        const body=document.getElementById("thcdBody");
        body.innerHTML=rows.length
            ? `<table><thead><tr><th>Cabang</th><th>${meta.label}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${formatter(r.value)}</td></tr>`).join("")}</tbody></table>`
            : `<div class="thcd-empty">Belum ada data pada periode aktif.</div>`;
        modal.hidden=false;
        document.body.style.overflow="hidden";
    }

    function closeModal(){
        const modal=document.getElementById(MODAL_ID);
        if(modal) modal.hidden=true;
        document.body.style.overflow="";
    }
    function escapeHtml(v){
        return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    }

    function decorateCoreCards(){
        Object.entries(CORE).forEach(([id,meta])=>{
            const value=document.getElementById(id);
            const card=value?.closest(".thc-tot-item");
            if(!card || card.id==="thcCardCashOut") return;
            card.classList.add("thc-detail-card");
            card.dataset.thcDetail=id;
            card.setAttribute("role","button");
            card.setAttribute("tabindex","0");
            card.setAttribute("aria-label",`Buka rincian ${meta.label} per cabang`);
            card.title=`Klik untuk melihat rincian ${meta.label} per cabang`;
            if(!card.querySelector(".thc-detail-hint")){
                const hint=document.createElement("span");
                hint.className="thc-detail-hint";
                hint.setAttribute("aria-hidden","true");
                hint.textContent="↗";
                card.appendChild(hint);
            }
        });
    }

    function loadScript(id,src,test){
        if(test?.()) return Promise.resolve();
        const existing=document.getElementById(id);
        if(existing) return Promise.resolve();
        return new Promise(resolve=>{
            const s=document.createElement("script");
            s.id=id;s.src=src;s.async=false;
            s.onload=()=>resolve();
            s.onerror=()=>{console.error("[TabelHarianTotalCardUI] gagal memuat",src);resolve();};
            document.head.appendChild(s);
        });
    }

    async function restoreSpecializedDrilldowns(){
        await loadScript("thcNettProductRestoreScript","../js/modules/tabel-harian-nett-product-card.js?v=20260911-cardrestore1",()=>typeof TabelHarianNettProductCard!=="undefined");
        if(typeof TabelHarianNettProductCard?.boot==="function") TabelHarianNettProductCard.boot();

        await loadScript("thcShareCukurRestoreScript","../js/modules/share-cukur-card.js?v=20260911-cardrestore1",()=>document.getElementById("thcShareCukurDrilldownModal"));
        await loadScript("thcShareCukurPopupUiRestoreScript","../js/modules/share-cukur-popup-ui.js?v=20260911-cardrestore1",()=>document.getElementById("thcShareCukurPopupUiStyles"));

        await loadScript("thcProteksiEngineRestoreScript","../js/modules/proteksi-engine.js?v=20260911-cardrestore1",()=>typeof ProteksiEngine!=="undefined");
        await loadScript("thcProteksiRestoreScript","../js/modules/proteksi-card.js?v=20260911-cardrestore1",()=>document.getElementById("thcProteksiDrilldownModal"));
        await loadScript("thcProteksiHintRestoreScript","../js/modules/proteksi-card-click-hint.js?v=20260911-cardrestore1",()=>document.getElementById("thcProteksiCardHintStyle"));

        setTimeout(decorateCoreCards,100);
    }

    function bind(){
        if(bound) return;
        bound=true;
        document.addEventListener("click",e=>{
            const card=e.target.closest?.("#thcTotals .thc-detail-card[data-thc-detail]");
            if(!card) return;
            if(e.target.closest("button,a,input,select,textarea")) return;
            const id=card.dataset.thcDetail;
            const meta=CORE[id];
            const value=document.getElementById(id);
            if(meta){e.preventDefault();openMetric(meta,value);}
        });
        document.addEventListener("keydown",e=>{
            if(e.key==="Escape" && !document.getElementById(MODAL_ID)?.hidden) closeModal();
            if(e.key!=="Enter" && e.key!==" ") return;
            const card=e.target.closest?.("#thcTotals .thc-detail-card[data-thc-detail]");
            if(!card) return;
            const id=card.dataset.thcDetail,meta=CORE[id];
            if(meta){e.preventDefault();openMetric(meta,document.getElementById(id));}
        });
    }

    function observeCards(){
        const totals=document.getElementById("thcTotals");
        if(!totals || observer) return;
        observer=new MutationObserver(()=>decorateCoreCards());
        observer.observe(totals,{childList:true,subtree:true});
    }

    async function boot(){
        ensureStyles();
        bind();
        decorateCoreCards();
        observeCards();
        await restoreSpecializedDrilldowns();
        decorateCoreCards();
    }

    window.TabelHarianTotalCardUI={boot,refresh:decorateCoreCards};
    if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
    else boot();
})();
