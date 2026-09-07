/*
=========================================================
VAX ERP — TABEL HARIAN AI SUMMARY PERIOD PRESENTER
=========================================================
UI / PRESENTATION ONLY.
- Membaca range aktif + previousSummary yang SUDAH tersedia di DashboardEngine.
- Menambahkan label periode sebelumnya pada summary AI Insight.
- Tidak query data, tidak menghitung ulang engine, tidak menulis state.
=========================================================
*/
"use strict";

(function(){
    let timer = null;
    let observer = null;

    function parseIso(value){
        const m = String(value || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!m) return null;
        const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function isoDate(d){
        if(!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
    }

    function shiftIso(iso, days){
        const d = parseIso(iso);
        if(!d) return "";
        d.setUTCDate(d.getUTCDate() + Number(days || 0));
        return isoDate(d);
    }

    function rangeDays(start, end){
        const a = parseIso(start);
        const b = parseIso(end);
        if(!a || !b || b < a) return 0;
        return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
    }

    function previousRange(){
        if(typeof DashboardEngine === "undefined") return null;
        const start = String(DashboardEngine.lastRange?.start || "").slice(0, 10);
        const end = String(DashboardEngine.lastRange?.end || start).slice(0, 10);
        const days = rangeDays(start, end);
        if(!start || !end || days < 1) return null;

        const prevEnd = shiftIso(start, -1);
        const prevStart = shiftIso(prevEnd, -(days - 1));
        if(!prevStart || !prevEnd) return null;
        return { start: prevStart, end: prevEnd, days };
    }

    function formatDate(iso){
        const d = parseIso(iso);
        if(!d) return "—";
        const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
        return `${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }

    function formatRupiah(value){
        if(typeof VaxAiInsight !== "undefined" && typeof VaxAiInsight.formatRupiah === "function"){
            return VaxAiInsight.formatRupiah(value);
        }
        if(typeof window.formatRupiah === "function") return window.formatRupiah(value);
        return "Rp" + Number(value || 0).toLocaleString("id-ID");
    }

    function paint(){
        const omzetEl = document.getElementById("vaxAiSumOmzet");
        const growthEl = document.getElementById("vaxAiSumGrowth");
        const findingEl = document.getElementById("vaxAiSumFinding");
        const row = omzetEl?.closest?.(".ai-summary-row")
            || growthEl?.closest?.(".ai-summary-row")
            || findingEl?.closest?.(".ai-summary-row");
        if(!row || typeof DashboardEngine === "undefined") return false;

        const prev = previousRange();
        if(!prev) return false;

        const previousOmzet = Number(DashboardEngine.previousSummary?.omzet || 0);
        let el = document.getElementById("vaxAiSumPrevPeriod");
        if(!el){
            el = document.createElement("span");
            el.id = "vaxAiSumPrevPeriod";
            el.className = "ai-sum-prev-period";
            row.appendChild(el);
        }

        const amount = previousOmzet > 0 ? formatRupiah(previousOmzet) : "Omzet belum tersedia";
        const rangeLabel = `${formatDate(prev.start)} — ${formatDate(prev.end)}`;
        const html = `Periode sebelumnya: <strong>${amount}</strong> · ${rangeLabel}`;
        if(el.innerHTML !== html) el.innerHTML = html;
        el.title = `Pembanding periode aktif menggunakan ${prev.days} hari sebelumnya: ${rangeLabel}`;
        return true;
    }

    function schedule(delay = 60){
        clearTimeout(timer);
        timer = setTimeout(() => paint(), delay);
    }

    function observe(){
        const host = document.getElementById("widget-section");
        if(!host || observer) return false;
        observer = new MutationObserver(() => schedule(40));
        observer.observe(host, { childList:true, subtree:true, characterData:true });
        return true;
    }

    function boot(){
        let tries = 0;
        const iv = setInterval(() => {
            tries += 1;
            observe();
            paint();
            if(tries >= 160) clearInterval(iv);
        }, 100);

        document.addEventListener("erp:components-ready", () => schedule(0));
    }

    window.TabelHarianAiSummaryPeriod = { refresh: paint };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", boot, { once:true });
    }else{
        boot();
    }
})();
