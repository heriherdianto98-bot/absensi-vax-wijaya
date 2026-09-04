/*
=========================================================
VAX ERP — SETORAN 3 HARIAN BRI DAILY BRIDGE
=========================================================
Jika ada input BRI Merchant Daily pada periode aktif:
- SUM per cabang untuk 1-3 hari
- tampil sebagai BRI Merchant di Setoran 3 Harian
- field periode menjadi read-only (hindari sumber ganda/bentrok)
- saat Setoran disimpan/diambil, nilai periode hanya menjadi snapshot
Fallback legacy: bila belum ada daily row, field lama setoran_3_harian tetap berlaku.
=========================================================
*/
"use strict";

(function(){
    let patched = false;
    let refreshedOnce = false;

    function scheduleRefresh(flow){
        if(refreshedOnce) return;
        let tries = 0;
        const timer = setInterval(async ()=>{
            tries += 1;
            if(refreshedOnce || tries > 40){
                clearInterval(timer);
                return;
            }
            if(flow?.dataset && Array.isArray(flow?.branches) && flow.branches.length){
                refreshedOnce = true;
                clearInterval(timer);
                try{ await flow.reload(); }
                catch(err){ console.error("Setoran BRI Daily bridge refresh gagal:",err); }
            }
        },100);
    }

    function patch(){
        if(patched || typeof SetoranDirectFlow === "undefined" || typeof BriMerchantDaily === "undefined") return false;
        patched = true;
        const flow = SetoranDirectFlow;

        const originalLoadSavedRows = flow.loadSavedRows.bind(flow);
        flow.loadSavedRows = async function(p){
            await originalLoadSavedRows(p);
            const ids = (this.branches || []).map(b=>Number(b.id)).filter(Number.isFinite);
            try{
                await BriMerchantDaily.loadRange({start:p.start,end:p.end,cabangIds:ids});
            }catch(err){
                console.error("Setoran BRI Daily bridge load gagal:",err);
                throw err;
            }
        };

        const originalModel = flow.model.bind(flow);
        flow.model = function(id){
            const m = originalModel(id);
            try{
                const p = this.period();
                const daily = BriMerchantDaily.sumBranch(id,p.start,p.end);
                if(daily.count > 0){
                    m.bri = daily.total;
                    m.diff = daily.total - this.money(m.s.nonCash);
                    m.briDailyCanonical = true;
                    m.briDailyCount = daily.count;
                }
            }catch(_e){ /* fallback legacy */ }
            return m;
        };

        const originalRowHtml = flow.rowHtml.bind(flow);
        flow.rowHtml = function(b){
            let html = originalRowHtml(b);
            const m = this.model(b.id);
            if(m.briDailyCanonical){
                html = html.replace(
                    'data-field="bri" type="number"',
                    'data-field="bri" data-bri-daily-canonical="1" type="number" readonly title="Sumber: BRI Merchant Daily dari Tabel Harian"'
                );
            }
            return html;
        };

        const style = document.createElement("style");
        style.id = "s3BriDailyBridgeStyle";
        style.textContent = `
          .s3sheet-input[data-bri-daily-canonical="1"]{
            border-color:rgba(190,120,255,.62) !important;
            color:#f1cfff !important;
            background:rgba(82,39,108,.18) !important;
            cursor:default !important;
          }
        `;
        if(!document.getElementById(style.id)) document.head.appendChild(style);
        scheduleRefresh(flow);
        return true;
    }

    function boot(){
        let tries=0;
        const timer=setInterval(()=>{
            tries+=1;
            if(patch() || tries>80) clearInterval(timer);
        },50);
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
    else boot();
})();
