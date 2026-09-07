/*
=========================================================
VAX ERP — TABEL HARIAN RETURN FOCUS
=========================================================
UI / NAVIGATION ONLY.
- Aktif hanya saat kembali dari drilldown Cash Out row.
- Mengembalikan cabang asal via filter persistence existing.
- Scroll ke tanggal asal dan beri highlight berkedip sementara sebagai penanda.
- Tidak mengubah engine, formula, atau sumber data.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcReturnFocusStyle";
    const FOCUS_CLASS = "thc-return-focus-flash";
    let done = false;
    let observer = null;
    let retryTimer = null;

    function params(){
        const q = new URLSearchParams(window.location.search || "");
        const from = String(q.get("from") || "").trim().toLowerCase();
        const focusDate = String(q.get("focusDate") || "").trim().slice(0, 10);
        const cabang = String(q.get("cabang") || "").trim();
        if(from !== "cash-out-row") return null;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(focusDate)) return null;
        return { focusDate, cabang };
    }

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            @keyframes thcReturnFocusPulse{
                0%,100%{ background:rgba(234,179,8,.04); box-shadow:inset 3px 0 0 rgba(234,179,8,.28); }
                50%{ background:rgba(234,179,8,.18); box-shadow:inset 4px 0 0 #facc15,0 0 16px rgba(234,179,8,.16); }
            }
            #thcTbody tr.${FOCUS_CLASS} > td{
                animation:thcReturnFocusPulse .62s ease-in-out 7;
            }
            #thcTbody tr.${FOCUS_CLASS} > td:first-child,
            #thcTbody tr.${FOCUS_CLASS} > td:nth-child(2){
                color:#facc15;
                font-weight:800;
            }
        `;
        document.head.appendChild(style);
    }

    function restoreBranchContext(){
        const p = params();
        if(!p?.cabang) return;

        const select = document.getElementById("branchFilter");
        if(select){
            const want = p.cabang.toLowerCase();
            const hit = [...select.options].find((o) => {
                const v = String(o.value || "").trim().toLowerCase();
                const t = String(o.textContent || "").trim().toLowerCase();
                return v === want || t === want || v.includes(want) || want.includes(v);
            });
            if(hit) select.value = hit.value;
        }

        try{
            const current = JSON.parse(localStorage.getItem("erp.dashboard.filters") || "{}") || {};
            localStorage.setItem("erp.dashboard.filters", JSON.stringify({
                ...current,
                cabang: select?.value || p.cabang
            }));
        }catch(_e){ /* ignore */ }
    }

    function findRow(iso){
        const body = document.getElementById("thcTbody");
        if(!body) return null;
        return body.querySelector(`tr[data-tanggal="${iso}"]`)
            || [...body.querySelectorAll("tr[data-tanggal]")].find((tr) =>
                String(tr.getAttribute("data-tanggal") || "").slice(0, 10) === iso
            )
            || null;
    }

    function focus(){
        if(done) return true;
        const p = params();
        if(!p) return false;
        const row = findRow(p.focusDate);
        if(!row) return false;

        done = true;
        document.querySelectorAll(`#thcTbody tr.${FOCUS_CLASS}`).forEach((tr) => tr.classList.remove(FOCUS_CLASS));
        row.classList.add(FOCUS_CLASS);

        requestAnimationFrame(() => {
            row.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });
        });

        setTimeout(() => row.classList.remove(FOCUS_CLASS), 4800);
        return true;
    }

    function schedule(delay = 40){
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => focus(), delay);
    }

    function observe(){
        const body = document.getElementById("thcTbody");
        if(!body || observer) return false;
        observer = new MutationObserver(() => schedule(30));
        observer.observe(body, { childList:true, subtree:false });
        return true;
    }

    function boot(){
        if(!params()) return;
        ensureStyle();
        restoreBranchContext();
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            restoreBranchContext();
            observe();
            if(focus() || tries >= 160) clearInterval(timer);
        }, 50);
    }

    window.TabelHarianReturnFocus = { focus, restoreBranchContext };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", boot, { once:true });
    }else{
        boot();
    }
})();
