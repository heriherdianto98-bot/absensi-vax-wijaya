/*
=========================================================
VAX ERP — CASH OUT FOCUS DATE PRESENTER
=========================================================
UI / NAVIGATION ONLY.
- Membaca focusDate dari URL jika datang dari Tabel Harian.
- Tidak mengubah filter engine / data / formula Cash Out.
- Setelah tabel selesai render, scroll ke tanggal target dan beri highlight berkedip terus.
- Saat datang dari Tabel Harian, link kembali diarahkan ke Tabel Harian Semua Cabang.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "cashOutFocusDateStyle";
    const FOCUS_CLASS = "cashout-focus-date-flash";
    let observer = null;
    let done = false;
    let retryTimer = null;

    function params(){
        const q = new URLSearchParams(window.location.search || "");
        const from = String(q.get("from") || "").trim().toLowerCase();
        const focusDate = String(q.get("focusDate") || "").trim().slice(0, 10);
        if(from !== "tabel-harian-row") return null;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(focusDate)) return null;
        return { focusDate };
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
        `;
        document.head.appendChild(style);
    }

    function configureBackLink(){
        if(!params()) return false;
        const link = document.querySelector(".cashout-back-link");
        if(!link) return false;

        let href = "./tabel-harian-cabang.html";
        try{
            const ref = String(document.referrer || "");
            if(ref && /\/tabel-harian-cabang\.html(?:[?#]|$)/i.test(ref)){
                href = ref;
            }
        }catch(_e){ /* ignore */ }

        link.href = href;
        link.textContent = "← Tabel Harian Semua Cabang";
        link.setAttribute("aria-label", "Kembali ke Tabel Harian Semua Cabang");
        link.title = "Kembali ke Tabel Harian Semua Cabang";
        return true;
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
        if(done) return true;
        const p = params();
        if(!p) return false;
        const row = findRow(p.focusDate);
        if(!row) return false;

        done = true;
        document.querySelectorAll(`#cashOutTbody tr.${FOCUS_CLASS}`).forEach((tr) => tr.classList.remove(FOCUS_CLASS));
        row.classList.add(FOCUS_CLASS);

        requestAnimationFrame(() => {
            row.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });
        });

        return true;
    }

    function schedule(delay = 40){
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
            configureBackLink();
            focusRow();
        }, delay);
    }

    function observe(){
        const body = document.getElementById("cashOutTbody");
        if(!body || observer) return false;
        observer = new MutationObserver(() => {
            // Jika tabel di-render ulang karena Refresh/Terapkan, pasang fokus lagi.
            done = false;
            schedule(30);
        });
        observer.observe(body, { childList:true });
        return true;
    }

    function boot(){
        const p = params();
        if(!p) return;
        ensureStyle();

        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            configureBackLink();
            observe();
            if(focusRow() || tries >= 160){
                clearInterval(timer);
            }
        }, 50);
    }

    window.CashOutFocusDate = {
        focus: () => focusRow(),
        syncBackLink: () => configureBackLink()
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", boot, { once:true });
    }else{
        boot();
    }
})();
