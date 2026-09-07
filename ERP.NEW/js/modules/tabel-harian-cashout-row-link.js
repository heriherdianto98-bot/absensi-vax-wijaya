/*
=========================================================
VAX ERP — TABEL HARIAN CASH OUT ROW LINK
=========================================================
UI / NAVIGATION ONLY.
- Menambahkan affordance klik pada nominal Cash Out per baris.
- Navigasi ke modul Cash Out dengan cabang + tanggal baris yang sama.
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
                display:inline-flex;
                align-items:center;
                justify-content:flex-end;
                gap:5px;
                max-width:100%;
                margin-left:auto;
                padding:4px 6px;
                border:0;
                border-radius:7px;
                background:transparent;
                color:inherit;
                font:inherit;
                font-weight:inherit;
                line-height:1.1;
                cursor:pointer;
                white-space:nowrap;
                transition:background .15s ease, color .15s ease, box-shadow .15s ease;
            }
            #thcTable td.thc-cashout .thc-cashout-row-link:hover,
            #thcTable td.thc-cashout .thc-cashout-row-link:focus-visible{
                background:rgba(220,38,38,.10);
                color:#ff7b82;
                box-shadow:0 0 0 1px rgba(239,68,68,.20);
                outline:none;
            }
            #thcTable td.thc-cashout .thc-cashout-row-icon{
                display:inline-flex;
                align-items:center;
                justify-content:center;
                width:17px;
                height:17px;
                border:1px solid rgba(239,68,68,.34);
                border-radius:5px;
                color:#ff6b72;
                font-size:10px;
                line-height:1;
                flex:0 0 auto;
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
            const label = String(cell.textContent || "").trim() || "Rp 0";

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
            btn.title = `Lihat rincian Cash Out · ${cabangName || "Cabang"} · ${tanggal}`;
            btn.innerHTML = `<span class="thc-cashout-row-value"></span><span class="thc-cashout-row-icon" aria-hidden="true">↗</span>`;
            btn.querySelector(".thc-cashout-row-value").textContent = label;
        });
        return true;
    }

    function scheduleDecorate(delay = 20){
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(decorate, delay);
    }

    function openCashOut(btn){
        const tanggal = String(btn?.dataset?.tanggal || "").slice(0, 10);
        const cabangId = String(btn?.dataset?.cabangId || "").trim();
        const cabangName = String(btn?.dataset?.cabangName || "").trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !cabangId) return;

        const url = new URL("./cash-out.html", window.location.href);
        url.searchParams.set("cabangId", cabangId);
        if(cabangName) url.searchParams.set("cabangName", cabangName);
        url.searchParams.set("periode", "customtanggal");
        url.searchParams.set("start", tanggal);
        url.searchParams.set("end", tanggal);
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
