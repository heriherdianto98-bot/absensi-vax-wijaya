/*
=========================================================
VAX ERP — TABEL HARIAN CASH OUT ROW LINK
=========================================================
UI / NAVIGATION ONLY.
- Nominal Cash Out per baris dapat diklik.
- Navigasi ke modul Cash Out dengan cabang yang sama.
- Cash Out dibuka untuk 1 bulan penuh dari tanggal yang diklik.
- Tanggal asal dikirim sebagai focusDate untuk highlight presenter.
- Saat kembali dari Cash Out, cabang asal dipulihkan SEKALI dari URL,
  lalu pengelolaan filter kembali ke dashboard.js canonical.
- Menampilkan panel petunjuk Cash Out di atas tabel untuk semua cabang.
- Tidak memiliki persistence cabang sendiri agar tidak bentrok dengan
  erp.dashboard.filters milik dashboard.js.
- Tidak mengubah DailyDataEngine, DashboardEngine, SetoranMoneyEngine,
  Cash Out engine, formula Tabel Harian, atau sumber data.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcCashOutRowLinkStyle";
    const HINT_ID = "thcCashOutHintPanel";
    const RETURN_FOCUS_CLASS = "thc-return-focus-flash";
    let observer = null;
    let bound = false;
    let refreshTimer = null;
    let returnDone = false;
    let returnBranchApplied = false;

    function returnParams(){
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
            #thcTable td.thc-cashout .thc-cashout-row-link{
                display:inline;
                margin:0;
                padding:0;
                border:0;
                background:transparent;
                color:inherit;
                font:inherit;
                font-weight:inherit;
                line-height:inherit;
                cursor:pointer;
                white-space:nowrap;
                text-align:inherit;
            }
            #thcTable td.thc-cashout .thc-cashout-row-link:hover,
            #thcTable td.thc-cashout .thc-cashout-row-link:focus-visible{
                color:#ff7b82;
                text-decoration:underline;
                text-underline-offset:2px;
                outline:none;
            }
            #thcTable td.thc-cashout .thc-cashout-row-link.is-zero{
                opacity:.58;
            }
            #${HINT_ID}{
                display:flex;
                align-items:center;
                gap:12px;
                width:100%;
                box-sizing:border-box;
                margin:0;
                padding:11px 16px;
                border-top:1px solid rgba(212,175,55,.30);
                border-bottom:1px solid rgba(212,175,55,.34);
                background:linear-gradient(90deg,rgba(242,194,48,.10) 0%,rgba(23,28,35,.96) 24%,rgba(17,21,27,.98) 100%);
                color:#E2E8F0;
                box-shadow:inset 4px 0 0 #F2C230,0 6px 18px rgba(0,0,0,.18);
                position:relative;
                z-index:2;
            }
            #${HINT_ID} .thc-cashout-hint-icon{
                flex:0 0 auto;
                width:30px;
                height:30px;
                border-radius:9px;
                display:grid;
                place-items:center;
                border:1px solid rgba(242,194,48,.42);
                background:rgba(242,194,48,.10);
                color:#F2C230;
                font-size:16px;
                font-weight:900;
                line-height:1;
                box-shadow:0 0 12px rgba(242,194,48,.10);
            }
            #${HINT_ID} .thc-cashout-hint-copy{
                min-width:0;
                display:flex;
                flex-wrap:wrap;
                align-items:baseline;
                gap:5px 8px;
                line-height:1.35;
            }
            #${HINT_ID} .thc-cashout-hint-title{
                color:#F2C230;
                font-size:12px;
                font-weight:900;
                letter-spacing:.07em;
                text-transform:uppercase;
                white-space:nowrap;
            }
            #${HINT_ID} .thc-cashout-hint-text{
                margin:0;
                color:#E2E8F0;
                font-size:13.5px;
                font-weight:650;
            }
            #${HINT_ID} .thc-cashout-hint-text strong{
                color:#FFFFFF;
                font-weight:900;
            }
            @media (max-width:700px){
                #${HINT_ID}{
                    align-items:flex-start;
                    padding:10px 12px;
                    gap:10px;
                }
                #${HINT_ID} .thc-cashout-hint-icon{
                    width:28px;
                    height:28px;
                    font-size:14px;
                }
                #${HINT_ID} .thc-cashout-hint-copy{
                    display:block;
                }
                #${HINT_ID} .thc-cashout-hint-title{
                    display:block;
                    margin-bottom:3px;
                }
                #${HINT_ID} .thc-cashout-hint-text{
                    font-size:13px;
                }
            }
            @keyframes thcReturnFocusPulse{
                0%,100%{ background:rgba(234,179,8,.04); box-shadow:inset 3px 0 0 rgba(234,179,8,.28); }
                50%{ background:rgba(234,179,8,.18); box-shadow:inset 4px 0 0 #facc15,0 0 16px rgba(234,179,8,.16); }
            }
            #thcTbody tr.${RETURN_FOCUS_CLASS} > td{
                animation:thcReturnFocusPulse .62s ease-in-out 7;
            }
            #thcTbody tr.${RETURN_FOCUS_CLASS} > td:first-child,
            #thcTbody tr.${RETURN_FOCUS_CLASS} > td:nth-child(2){
                color:#facc15;
                font-weight:800;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureHintPanel(){
        if(document.getElementById(HINT_ID)) return true;
        const tableScroll = document.getElementById("thcScroll");
        if(!tableScroll || !tableScroll.parentElement) return false;

        const panel = document.createElement("div");
        panel.id = HINT_ID;
        panel.setAttribute("role", "note");
        panel.setAttribute("aria-label", "Petunjuk rincian Cash Out");
        panel.innerHTML = `
            <span class="thc-cashout-hint-icon" aria-hidden="true">↗</span>
            <div class="thc-cashout-hint-copy">
                <span class="thc-cashout-hint-title">Petunjuk Cash Out</span>
                <p class="thc-cashout-hint-text"><strong>Klik nominal Cash Out</strong> pada tabel untuk melihat rincian pengeluaran sesuai cabang dan tanggal yang diperiksa.</p>
            </div>
        `;
        tableScroll.parentElement.insertBefore(panel, tableScroll);
        return true;
    }

    function findBranchOption(select, wanted){
        if(!select || !wanted) return null;
        const target = String(wanted || "").trim().toLowerCase();
        if(!target) return null;
        return [...select.options].find((o) => {
            const value = String(o.value || "").trim().toLowerCase();
            const text = String(o.textContent || "").trim().toLowerCase();
            return value === target || text === target || value.includes(target) || target.includes(value);
        }) || null;
    }

    function applyReturnBranchOnce(){
        if(returnBranchApplied) return false;
        const p = returnParams();
        if(!p?.cabang) return false;
        const select = document.getElementById("branchFilter");
        if(!select) return false;
        const hit = findBranchOption(select, p.cabang);
        if(!hit) return false;

        returnBranchApplied = true;
        if(select.value !== hit.value){
            select.value = hit.value;
            // Serahkan persistence + reload ke handler canonical dashboard.js.
            select.dispatchEvent(new Event("change", { bubbles:true }));
        }
        return true;
    }

    function rows(){
        return (typeof TabelHarianCabang !== "undefined" && Array.isArray(TabelHarianCabang.rows))
            ? TabelHarianCabang.rows
            : [];
    }

    function decorate(){
        const body = document.getElementById("thcTbody");
        const data = rows();
        if(!body || !data.length) return false;

        const trs = [...body.querySelectorAll("tr")];
        trs.forEach((tr, index) => {
            const meta = data[index];
            const cell = tr.querySelector("td.thc-cashout");
            if(!meta || !cell) return;

            const tanggal = String(meta.tanggal || "").slice(0, 10);
            const cabangId = Number(meta.cabang_id);
            const cabangName = String(meta.cabang_name || "").trim();
            const nominal = Number(meta.cash_out || 0);
            const existingValue = cell.querySelector(".thc-cashout-row-value")?.textContent;
            const label = String(existingValue || cell.textContent || "").trim() || "Rp 0";

            let btn = cell.querySelector(".thc-cashout-row-link");
            if(!btn){
                btn = document.createElement("button");
                btn.type = "button";
                btn.className = "thc-cashout-row-link";
                cell.replaceChildren(btn);
            }

            btn.classList.toggle("is-zero", !(nominal > 0));
            btn.dataset.tanggal = tanggal;
            btn.dataset.cabangId = Number.isFinite(cabangId) ? String(cabangId) : "";
            btn.dataset.cabangName = cabangName;
            btn.dataset.nominal = Number.isFinite(nominal) ? String(nominal) : "0";
            btn.setAttribute("aria-label", `Buka rincian Cash Out ${cabangName || "cabang"} tanggal ${tanggal}`);
            btn.title = `Klik nominal untuk lihat rincian Cash Out · ${cabangName || "Cabang"} · ${tanggal}`;
            btn.innerHTML = `<span class="thc-cashout-row-value"></span>`;
            btn.querySelector(".thc-cashout-row-value").textContent = label;
        });
        return true;
    }

    function focusReturnedRow(){
        if(returnDone) return true;
        const p = returnParams();
        if(!p) return false;
        const body = document.getElementById("thcTbody");
        if(!body) return false;
        const row = body.querySelector(`tr[data-tanggal="${p.focusDate}"]`)
            || [...body.querySelectorAll("tr[data-tanggal]")].find((tr) =>
                String(tr.getAttribute("data-tanggal") || "").slice(0, 10) === p.focusDate
            );
        if(!row) return false;

        returnDone = true;
        document.querySelectorAll(`#thcTbody tr.${RETURN_FOCUS_CLASS}`).forEach((tr) => tr.classList.remove(RETURN_FOCUS_CLASS));
        row.classList.add(RETURN_FOCUS_CLASS);
        requestAnimationFrame(() => {
            row.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });
        });
        setTimeout(() => row.classList.remove(RETURN_FOCUS_CLASS), 4800);
        return true;
    }

    function scheduleDecorate(delay = 20){
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            ensureHintPanel();
            decorate();
            focusReturnedRow();
        }, delay);
    }

    function monthRange(iso){
        const tanggal = String(iso || "").slice(0, 10);
        const m = tanggal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!m) return null;
        const year = Number(m[1]);
        const month = Number(m[2]);
        if(!year || month < 1 || month > 12) return null;
        const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
        return {
            start: `${m[1]}-${m[2]}-01`,
            end: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`
        };
    }

    function openCashOut(btn){
        const tanggal = String(btn?.dataset?.tanggal || "").slice(0, 10);
        const cabangId = String(btn?.dataset?.cabangId || "").trim();
        const cabangName = String(btn?.dataset?.cabangName || "").trim();
        const range = monthRange(tanggal);
        if(!range || !cabangId) return;

        const url = new URL("./cash-out.html", window.location.href);
        url.searchParams.set("cabangId", cabangId);
        if(cabangName) url.searchParams.set("cabangName", cabangName);
        url.searchParams.set("periode", "customtanggal");
        url.searchParams.set("start", range.start);
        url.searchParams.set("end", range.end);
        url.searchParams.set("focusDate", tanggal);
        url.searchParams.set("from", "tabel-harian-row");
        window.location.href = url.href;
    }

    function bindEvents(){
        if(bound) return;
        bound = true;

        document.addEventListener("click", (e) => {
            const btn = e.target.closest?.("#thcTable .thc-cashout-row-link");
            if(!btn) return;
            e.preventDefault();
            e.stopPropagation();
            openCashOut(btn);
        });

        document.addEventListener("erp:components-ready", () => {
            applyReturnBranchOnce();
            scheduleDecorate(0);
        });
    }

    function observe(){
        const body = document.getElementById("thcTbody");
        if(!body || observer) return;
        observer = new MutationObserver(() => scheduleDecorate(10));
        observer.observe(body, { childList:true, subtree:false });
    }

    function boot(){
        ensureStyle();
        ensureHintPanel();
        bindEvents();
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            ensureHintPanel();
            observe();
            const decorated = decorate();
            const focused = focusReturnedRow();
            if((decorated && (!returnParams() || focused)) || tries >= 120) clearInterval(timer);
        }, 50);
    }

    window.TabelHarianCashOutRowLink = {
        refresh: () => decorate(),
        focusReturnedRow: () => focusReturnedRow()
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", boot, { once:true });
    }else{
        boot();
    }
})();