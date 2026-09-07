/*
=========================================================
VAX ERP — CASH OUT FOCUS DATE PRESENTER
=========================================================
UI / NAVIGATION ONLY.
- Membaca focusDate dari URL jika datang dari Tabel Harian.
- Tidak mengubah filter engine / data / formula Cash Out.
- Setelah tabel selesai render, scroll ke tanggal target dan beri highlight berkedip terus.
- Link kembali diarahkan ke Tabel Harian dan membawa tanggal target sebagai penanda balik.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "cashOutFocusDateStyle";
    const FOCUS_CLASS = "cashout-focus-date-flash";
    let observer = null;
    let retryTimer = null;

    function params(){
        const q = new URLSearchParams(window.location.search || "");
        const from = String(q.get("from") || "").trim().toLowerCase();
        const focusDate = String(q.get("focusDate") || "").trim().slice(0, 10);
        const cabangName = String(q.get("cabangName") || "").trim();
        if(from !== "tabel-harian-row") return null;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(focusDate)) return null;
        return { focusDate, cabangName };
    }

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            @keyframes cashOutFocusPulse{
                0%,100%{ background:rgba(239,68,68,.05); box-shadow:inset 3px 0 0 rgba(239,68,68,.35); }
                50%{ background:rgba(239,68,68,.22); box-shadow:inset 4px 0 0 #ef4444,0 0 18px rgba(239,68,68,.20); }
            }
            #cashOutTbody tr.${FOCUS_CLASS} > td{
                animation:cashOutFocusPulse .72s ease-in-out infinite;
            }
            #cashOutTbody tr.${FOCUS_CLASS} > td:first-child{
                color:#ff777d;
                font-weight:800;
            }
            .cashout-back-link.cashout-back-table{
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-height:38px;
                padding:8px 14px;
                border:1px solid rgba(234,179,8,.55);
                border-radius:9px;
                background:rgba(234,179,8,.08);
                color:#facc15;
                font-size:13px;
                font-weight:800;
                line-height:1.1;
                text-decoration:none;
                white-space:nowrap;
                box-shadow:0 0 0 1px rgba(234,179,8,.06) inset;
                transition:background .15s ease,border-color .15s ease,transform .15s ease;
            }
            .cashout-back-link.cashout-back-table:hover,
            .cashout-back-link.cashout-back-table:focus-visible{
                background:rgba(234,179,8,.16);
                border-color:rgba(250,204,21,.82);
                transform:translateY(-1px);
                outline:none;
            }
        `;
        document.head.appendChild(style);
    }

    function formatTarget(iso){
        if(typeof CashOutDetail !== "undefined" && typeof CashOutDetail.formatTanggal === "function"){
            return String(CashOutDetail.formatTanggal(iso) || "").trim();
        }
        const p = iso.split("-").map(Number);
        if(p.length !== 3 || !p[0]) return "";
        const d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0));
        return d.toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric", timeZone:"UTC" });
    }

    function findRow(iso){
        const body = document.getElementById("cashOutTbody");
        if(!body) return null;

        const bySummary = body.querySelector(`[data-cashout-sum="${iso}"]`);
        if(bySummary) return bySummary;

        const wanted = formatTarget(iso).replace(/\s+/g, " ").trim().toLowerCase();
        if(!wanted) return null;

        return [...body.querySelectorAll("tr")].find((tr) => {
            if(tr.matches("[data-cashout-detail]")) return false;
            const first = String(tr.cells?.[0]?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            return first === wanted || first.includes(wanted);
        }) || null;
    }

    function focusRow(){
        const p = params();
        if(!p) return false;
        const row = findRow(p.focusDate);
        if(!row) return false;

        document.querySelectorAll(`#cashOutTbody tr.${FOCUS_CLASS}`).forEach((tr) => {
            if(tr !== row) tr.classList.remove(FOCUS_CLASS);
        });
        row.classList.add(FOCUS_CLASS);

        if(row.dataset.cashoutFocusScrolled !== "1"){
            row.dataset.cashoutFocusScrolled = "1";
            requestAnimationFrame(() => {
                row.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });
            });
        }
        return true;
    }

    function mountBackButton(){
        const p = params();
        if(!p) return false;
        const link = document.querySelector(".cashout-back-link");
        if(!link) return false;

        const url = new URL("./tabel-harian-cabang.html", window.location.href);
        url.searchParams.set("from", "cash-out-row");
        url.searchParams.set("focusDate", p.focusDate);
        if(p.cabangName) url.searchParams.set("cabang", p.cabangName);

        link.href = url.href;
        link.textContent = "← Tabel Harian Semua Cabang";
        link.classList.add("cashout-back-table");
        link.title = `Kembali ke Tabel Harian pada ${p.focusDate}`;
        return true;
    }

    function schedule(delay = 40){
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
            mountBackButton();
            focusRow();
        }, delay);
    }

    function observe(){
        const body = document.getElementById("cashOutTbody");
        if(!body || observer) return false;
        observer = new MutationObserver(() => schedule(30));
        observer.observe(body, { childList:true });
        return true;
    }

    function boot(){
        if(!params()) return;
        ensureStyle();

        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            const backReady = mountBackButton();
            observe();
            const focusReady = focusRow();
            if((backReady && focusReady) || tries >= 160){
                clearInterval(timer);
            }
        }, 50);
    }

    window.CashOutFocusDate = {
        focus: () => focusRow(),
        mountBack: () => mountBackButton()
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", boot, { once:true });
    }else{
        boot();
    }
})();
