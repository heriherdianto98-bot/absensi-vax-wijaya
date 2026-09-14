"use strict";

/*
VAX ERP — Cash Out Search UI
UI ONLY.
- Pencarian berdasarkan kata atau nominal pada data Cash Out yang SUDAH dimuat.
- Tidak mengubah source daily_recap_source, query Supabase, total, filter periode/cabang,
  print, parser Cash Out, atau engine/modul existing yang LOCK.
- Saat pencarian aktif, tanggal yang masih collapse dibuka sementara agar detail bisa dicari.
*/
(() => {
    if(typeof window === "undefined" || window.__VAX_CASHOUT_SEARCH_UI__) return;
    window.__VAX_CASHOUT_SEARCH_UI__ = true;

    const state = {
        installed: false,
        applying: false,
        autoExpanded: new Set(),
        observer: null,
        timer: null
    };

    function norm(value){
        return String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function digits(value){
        return String(value || "").replace(/\D/g, "");
    }

    function currentQuery(){
        return String(document.getElementById("cashOutSearchInput")?.value || "").trim();
    }

    function addStyle(){
        if(document.getElementById("cashOutSearchUiStyle")) return;
        const style = document.createElement("style");
        style.id = "cashOutSearchUiStyle";
        style.textContent = `
            .cashout-search-ui{display:flex;align-items:center;gap:10px;margin:12px 0 10px;padding:10px 12px;border:1px solid rgba(212,175,55,.28);border-radius:12px;background:linear-gradient(180deg,rgba(20,20,18,.96),rgba(11,12,12,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
            .cashout-search-box{position:relative;display:flex;align-items:center;flex:1;min-width:220px}
            .cashout-search-icon{position:absolute;left:13px;width:16px;height:16px;pointer-events:none;opacity:.72}
            .cashout-search-icon:before{content:"";position:absolute;left:1px;top:1px;width:8px;height:8px;border:2px solid #d7b63f;border-radius:50%}
            .cashout-search-icon:after{content:"";position:absolute;left:10px;top:11px;width:6px;height:2px;background:#d7b63f;transform:rotate(45deg);transform-origin:left center;border-radius:2px}
            #cashOutSearchInput{width:100%;height:40px;padding:0 42px 0 40px;border:1px solid rgba(212,175,55,.35);border-radius:10px;background:#0b0e10;color:#f4f4f4;font:700 13px/1 'Source Sans 3',sans-serif;outline:none;transition:.16s ease}
            #cashOutSearchInput::placeholder{color:#7f878d;font-weight:600}
            #cashOutSearchInput:focus{border-color:#d4af37;box-shadow:0 0 0 3px rgba(212,175,55,.09)}
            .cashout-search-clear{position:absolute;right:7px;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:#aeb6bb;font:800 17px/1 Arial;cursor:pointer;display:none}
            .cashout-search-clear:hover{background:rgba(255,255,255,.06);color:#fff}
            .cashout-search-clear.is-visible{display:inline-grid;place-items:center}
            .cashout-search-status{min-width:105px;text-align:right;color:#aab2b8;font:700 12px/1.2 'Source Sans 3',sans-serif;white-space:nowrap}
            .cashout-search-status strong{color:#e6c44a;font-weight:900}
            #cashOutTbody tr.cashout-search-hidden{display:none!important}
            #cashOutTbody tr.cashout-search-match>td{background:rgba(212,175,55,.055)!important}
            @media(max-width:760px){.cashout-search-ui{align-items:stretch;flex-direction:column}.cashout-search-status{text-align:left;min-width:0}}
        `;
        document.head.appendChild(style);
    }

    function expandForSearch(){
        const api = window.CashOutDetail;
        const tbody = document.getElementById("cashOutTbody");
        if(!api || !tbody || typeof api.toggleDateExpand !== "function") return;

        const keys = [...tbody.querySelectorAll("[data-cashout-sum]")]
            .map(row => String(row.getAttribute("data-cashout-sum") || ""))
            .filter(Boolean);

        for(const key of keys){
            const alreadyExpanded = api.expandedDates instanceof Set && api.expandedDates.has(key);
            if(alreadyExpanded) continue;
            state.autoExpanded.add(key);
            api.toggleDateExpand(key);
        }
    }

    function restoreAutoExpanded(){
        const api = window.CashOutDetail;
        if(!api || typeof api.toggleDateExpand !== "function"){
            state.autoExpanded.clear();
            return;
        }
        for(const key of [...state.autoExpanded]){
            const stillExpanded = api.expandedDates instanceof Set && api.expandedDates.has(key);
            if(stillExpanded) api.toggleDateExpand(key);
        }
        state.autoExpanded.clear();
    }

    function applyFilter(){
        if(state.applying) return;
        state.applying = true;
        try{
            const tbody = document.getElementById("cashOutTbody");
            const input = document.getElementById("cashOutSearchInput");
            const status = document.getElementById("cashOutSearchStatus");
            const clear = document.getElementById("cashOutSearchClear");
            if(!tbody || !input) return;

            const queryRaw = input.value.trim();
            const queryText = norm(queryRaw);
            const queryDigits = digits(queryRaw);
            const rows = [...tbody.querySelectorAll("tr")];

            if(clear) clear.classList.toggle("is-visible", Boolean(queryRaw));

            if(!queryRaw){
                rows.forEach(row => {
                    row.classList.remove("cashout-search-hidden", "cashout-search-match");
                });
                if(status) status.innerHTML = "Cari kata / nominal";
                return;
            }

            let matchCount = 0;
            for(const row of rows){
                const raw = row.textContent || "";
                const text = norm(raw);
                const rowDigits = digits(raw);
                const textMatch = queryText && text.includes(queryText);
                const numberMatch = queryDigits.length >= 2 && rowDigits.includes(queryDigits);
                const matched = Boolean(textMatch || numberMatch);
                row.classList.toggle("cashout-search-hidden", !matched);
                row.classList.toggle("cashout-search-match", matched);
                if(matched) matchCount += 1;
            }

            if(status){
                status.innerHTML = `<strong>${matchCount}</strong> hasil ditemukan`;
            }
        } finally {
            state.applying = false;
        }
    }

    function scheduleApply(delay = 40){
        clearTimeout(state.timer);
        state.timer = setTimeout(applyFilter, delay);
    }

    function runSearch(){
        const q = currentQuery();
        if(q){
            expandForSearch();
            scheduleApply(120);
        }else{
            restoreAutoExpanded();
            scheduleApply(80);
        }
    }

    function install(){
        if(state.installed) return true;
        const summary = document.getElementById("cashOutSummary");
        const tableWrap = document.querySelector(".cashout-table-wrap");
        if(!summary || !tableWrap) return false;

        addStyle();

        const ui = document.createElement("div");
        ui.className = "cashout-search-ui";
        ui.id = "cashOutSearchUi";
        ui.innerHTML = `
            <div class="cashout-search-box">
                <span class="cashout-search-icon" aria-hidden="true"></span>
                <input id="cashOutSearchInput" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Cari kata / nominal... contoh: protek, 150000">
                <button type="button" id="cashOutSearchClear" class="cashout-search-clear" aria-label="Hapus pencarian">×</button>
            </div>
            <div class="cashout-search-status" id="cashOutSearchStatus">Cari kata / nominal</div>`;

        summary.insertAdjacentElement("afterend", ui);

        const input = document.getElementById("cashOutSearchInput");
        const clear = document.getElementById("cashOutSearchClear");
        input?.addEventListener("input", runSearch);
        input?.addEventListener("keydown", e => {
            if(e.key === "Escape"){
                input.value = "";
                runSearch();
                input.blur();
            }
        });
        clear?.addEventListener("click", () => {
            if(!input) return;
            input.value = "";
            runSearch();
            input.focus();
        });

        const tbody = document.getElementById("cashOutTbody");
        if(tbody && typeof MutationObserver !== "undefined"){
            state.observer = new MutationObserver(() => {
                if(currentQuery()) scheduleApply(50);
            });
            state.observer.observe(tbody, {childList:true, subtree:true, characterData:true});
        }

        state.installed = true;
        return true;
    }

    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        if(install() || tries >= 80) clearInterval(timer);
    }, 100);
})();
