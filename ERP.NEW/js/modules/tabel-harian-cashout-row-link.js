/*
=========================================================
VAX ERP — TABEL HARIAN CASH OUT ROW LINK
=========================================================
UI / NAVIGATION ONLY.
- Nominal Cash Out per baris dapat diklik.
- Navigasi ke modul Cash Out dengan cabang yang sama.
- Cash Out dibuka untuk 1 bulan penuh dari tanggal yang diklik.
- Tanggal asal dikirim sebagai focusDate untuk highlight presenter.
- Tidak mengubah DailyDataEngine, SetoranMoneyEngine, Cash Out engine,
  formula Tabel Harian, atau sumber data.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcCashOutRowLinkStyle";
    let observer = null;
    let bound = false;
    let refreshTimer = null;

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
        `;
        document.head.appendChild(style);
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

    function scheduleDecorate(delay = 20){
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(decorate, delay);
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
        document.addEventListener("erp:components-ready", () => scheduleDecorate(0));
    }

    function observe(){
        const body = document.getElementById("thcTbody");
        if(!body || observer) return;
        observer = new MutationObserver(() => scheduleDecorate(10));
        observer.observe(body, { childList:true, subtree:false });
    }

    function boot(){
        ensureStyle();
        bindEvents();
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            observe();
            if(decorate() || tries >= 100) clearInterval(timer);
        }, 50);
    }

    window.TabelHarianCashOutRowLink = {
        refresh: () => decorate()
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", boot, { once:true });
    }else{
        boot();
    }
})();
