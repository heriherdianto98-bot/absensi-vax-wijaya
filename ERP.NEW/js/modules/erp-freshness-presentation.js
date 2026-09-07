/*
=========================================================
VAX ERP — Freshness Presentation Guard (UI ONLY)
=========================================================
Tujuan:
- Jangan menganggap belum ada data provider sebelum jam buka 10:00 WIB sebagai error.
- Error sync/VPS nyata tetap diberi perhatian jelas.
- Tidak menulis DB, tidak memicu sync, tidak menyentuh scheduler/sync.js/VPS.
- Hanya memoles object hasil ErpFreshness.evaluate() + warna header.
=========================================================
*/
(function(){
    "use strict";

    if(typeof ErpFreshness === "undefined" || typeof ErpFreshness.evaluate !== "function"){
        console.warn("[Freshness Presentation] ErpFreshness belum tersedia.");
        return;
    }
    if(ErpFreshness.__presentationGuardInstalled) return;
    ErpFreshness.__presentationGuardInstalled = true;

    function boolOnline(row){
        const v = row?.vps_online;
        if(v === undefined || v === null) return true;
        return v === true || v === "true" || v === "t" || v === 1 || v === "1";
    }

    function hardFailure(row){
        const status = String(row?.status || "").trim().toLowerCase();
        const statusFailed = ["gagal", "failed", "error"].includes(status);
        const failedAll = Number(row?.gagal || 0) > 0 && Number(row?.berhasil || 0) === 0;
        const vpsDown = !boolOnline(row);
        return { hard: statusFailed || failedAll || vpsDown, statusFailed, failedAll, vpsDown };
    }

    function cloneView(view){
        return view ? { ...view } : view;
    }

    function postProcess(state){
        if(!state || typeof state !== "object") return state;

        const out = {
            ...state,
            operational: cloneView(state.operational),
            provider: cloneView(state.provider),
            global: state.global ? { ...state.global } : {},
            header: state.header ? { ...state.header } : {}
        };

        const hour = Number(out.hour);
        const preOpen = Number.isFinite(hour) && hour >= 7 && hour < 10;
        const failure = hardFailure(out.syncRow || {});

        if(preOpen && !failure.hard){
            out.global.key = "resume";
            out.global.tone = "gold";
            out.global.label = "MENUNGGU JAM OPERASIONAL";
            out.global.sub = "Barber belum buka. Monitoring freshness aktif mulai pukul 10:00 WIB.";

            out.header.key = "night";
            out.header.css = "is-waiting";
            out.header.label = out.global.label;
            out.header.sub = out.global.sub;

            if(out.provider){
                out.provider.key = "waiting";
                out.provider.tone = "gold";
                out.provider.label = "Menunggu jam buka";
                out.provider.valid = true;
                out.provider.running = false;
            }

            out.allowRed = false;
            out.presentationReason = "preopen";
            return out;
        }

        if(failure.hard){
            out.global.key = "error";
            out.global.tone = "amber";
            out.global.label = "PERLU PERHATIAN";
            out.global.sub = failure.vpsDown
                ? "Koneksi VPS terdeteksi bermasalah. Periksa status sinkronisasi."
                : (out.syncRow?.pesan || "Gangguan sinkronisasi terdeteksi. Periksa status sync.");

            out.header.key = "error";
            out.header.css = "is-error";
            out.header.label = out.global.label;
            out.header.sub = out.global.sub;
            out.allowRed = false;
            out.presentationReason = "hard-sync-error";
            return out;
        }

        if(out.global.key === "error" || out.global.key === "delayed"){
            out.global.key = "delayed";
            out.global.tone = "amber";
            out.global.label = "DATA BELUM TERBARU";
            out.global.sub = "Freshness data belum memenuhi ambang terbaru. Sistem tetap online; pantau siklus berikutnya.";

            out.header.key = "recovery";
            out.header.css = "is-warn";
            out.header.label = out.global.label;
            out.header.sub = out.global.sub;
            out.allowRed = false;
            out.presentationReason = "freshness-warning";
        }

        return out;
    }

    const originalEvaluate = ErpFreshness.evaluate.bind(ErpFreshness);
    ErpFreshness.evaluate = function(snapshot, nowMs){
        return postProcess(originalEvaluate(snapshot, nowMs));
    };

    const style = document.createElement("style");
    style.id = "erpFreshnessPresentationStyle";
    style.textContent = `
        @keyframes erp-attention-pulse {
            0%,100% { opacity: .78; box-shadow: 0 0 0 1px rgba(245,158,11,.20), 0 2px 8px rgba(0,0,0,.22); }
            50% { opacity: 1; box-shadow: 0 0 0 1px rgba(245,158,11,.52), 0 0 18px rgba(245,158,11,.30), 0 2px 8px rgba(0,0,0,.22); }
        }
        .header-minutes-status.is-error {
            border-color: rgba(245,158,11,.62) !important;
            background: rgba(120,53,15,.22) !important;
            animation: erp-attention-pulse 1.35s ease-in-out infinite !important;
        }
        .header-minutes-status.is-error strong,
        .header-minutes-status.is-error .header-minutes-icon-wrap {
            color: #FBBF24 !important;
        }
        .header-minutes-status.is-error .header-minutes-dot {
            background: #F59E0B !important;
            box-shadow: 0 0 0 2px rgba(245,158,11,.30) !important;
        }
        .header-minutes-status.is-error .header-minutes-sub {
            color: #FDE68A !important;
        }
        .erp-freshness-item.tone-red .erp-freshness-dot {
            background: #F59E0B !important;
            box-shadow: 0 0 0 2px rgba(245,158,11,.28) !important;
        }
        .erp-freshness-item.tone-red strong { color: #FBBF24 !important; }
        @media (prefers-reduced-motion: reduce) {
            .header-minutes-status.is-error { animation: none !important; }
        }
    `;
    document.head.appendChild(style);

    console.log("[Freshness Presentation] UI guard aktif; sync engine tidak disentuh.");
})();

/*
=========================================================
TABEL HARIAN — LOMPAT TANGGAL UI FIX
=========================================================
UI/navigation only:
- karakter kalender dibuat dari Unicode escape agar kebal mojibake/encoding lokal
- kalender boleh pindah bulan dan semua tanggal bisa dipilih
- tanggal di luar periode aktif menjadi custom single-date lalu reload engine
- tidak mengubah formula uang / sync / source data
=========================================================
*/
(function(){
    "use strict";

    const path = String(window.location.pathname || "").toLowerCase();
    if(!path.includes("tabel-harian-cabang")) return;

    function normalizeJumpChrome(){
        const ico = document.querySelector("#thcJumpDateBtn .thc-jump-ico");
        const close = document.querySelector("#thcJumpCalModal .thc-jump-cal-x");
        const prev = document.getElementById("thcJumpCalPrev");
        const next = document.getElementById("thcJumpCalNext");
        const hint = document.querySelector("#thcJumpCalModal .thc-jump-cal-hint");
        if(ico) ico.textContent = "\u{1F4C5}";
        if(close) close.textContent = "\u00D7";
        if(prev) prev.textContent = "\u2039";
        if(next) next.textContent = "\u203A";
        if(hint) hint.textContent = "Pilih tanggal untuk menampilkan data tanggal tersebut \u2014 cabang tetap mengikuti filter aktif";
    }

    function install(){
        if(typeof TabelHarianCabang === "undefined") return false;
        if(TabelHarianCabang.__jumpDateFixInstalled){
            normalizeJumpChrome();
            return true;
        }
        TabelHarianCabang.__jumpDateFixInstalled = true;

        TabelHarianCabang.renderJumpDates = function(){
            const btn = document.getElementById("thcJumpDateBtn");
            const wrap = document.getElementById("thcJumpWrap");
            const feedback = document.getElementById("thcJumpFeedback");
            if(feedback){
                feedback.hidden = true;
                feedback.textContent = "";
            }

            const dates = [...new Set(
                (this.rows || [])
                    .map((r) => String(r.tanggal || "").slice(0, 10))
                    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
            )].sort();
            this._jumpDates = dates;
            if(wrap) wrap.hidden = false;
            if(btn) btn.disabled = false;

            const rangeEnd = String(DashboardEngine?.lastRange?.end || "").slice(0, 10);
            const today = (typeof DashboardEngine !== "undefined" && DashboardEngine.getJakartaToday)
                ? DashboardEngine.getJakartaToday()
                : new Date().toISOString().slice(0, 10);
            const seed = dates.includes(this._jumpSelected)
                ? this._jumpSelected
                : (dates[dates.length - 1] || rangeEnd || today);

            this._jumpSelected = /^\d{4}-\d{2}-\d{2}$/.test(seed) ? seed : today;
            this._jumpViewYear = Number(this._jumpSelected.slice(0, 4));
            this._jumpViewMonth = Number(this._jumpSelected.slice(5, 7)) - 1;
            this.syncJumpTriggerLabel();
            normalizeJumpChrome();
            if(this.isJumpCalendarOpen()) this.renderJumpCalendar();
        };

        TabelHarianCabang.openJumpCalendar = function(){
            const btn = document.getElementById("thcJumpDateBtn");
            const modal = document.getElementById("thcJumpCalModal");
            if(!modal || !btn || btn.disabled) return;

            const today = (typeof DashboardEngine !== "undefined" && DashboardEngine.getJakartaToday)
                ? DashboardEngine.getJakartaToday()
                : new Date().toISOString().slice(0, 10);
            const seed = this._jumpSelected
                || String(DashboardEngine?.lastRange?.end || "").slice(0, 10)
                || today;
            this._jumpViewYear = Number(seed.slice(0, 4));
            this._jumpViewMonth = Number(seed.slice(5, 7)) - 1;

            modal.hidden = false;
            modal.setAttribute("aria-hidden", "false");
            btn.setAttribute("aria-expanded", "true");
            document.body.classList.add("thc-jump-cal-open");
            normalizeJumpChrome();
            this.renderJumpCalendar();
        };

        TabelHarianCabang.renderJumpCalendar = function(){
            const grid = document.getElementById("thcJumpCalDays");
            const label = document.getElementById("thcJumpCalMonthLabel");
            if(!grid || this._jumpViewYear == null || this._jumpViewMonth == null) return;

            const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
            if(label) label.textContent = `${monthNames[this._jumpViewMonth]} ${this._jumpViewYear}`;

            const today = (typeof DashboardEngine !== "undefined" && DashboardEngine.getJakartaToday)
                ? DashboardEngine.getJakartaToday()
                : "";
            const inCurrentDataset = new Set(this._jumpDates || []);
            const first = new Date(Date.UTC(this._jumpViewYear, this._jumpViewMonth, 1));
            const mondayIndex = (first.getUTCDay() + 6) % 7;
            const daysInMonth = new Date(Date.UTC(this._jumpViewYear, this._jumpViewMonth + 1, 0)).getUTCDate();

            let html = "";
            for(let i = 0; i < mondayIndex; i++){
                html += `<span class="thc-jump-day is-empty" aria-hidden="true"></span>`;
            }
            for(let day = 1; day <= daysInMonth; day++){
                const iso = `${this._jumpViewYear}-${String(this._jumpViewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const classes = ["thc-jump-day"];
                if(iso === today) classes.push("is-today");
                if(this._jumpSelected && iso === this._jumpSelected) classes.push("is-selected");
                if(inCurrentDataset.has(iso)) classes.push("is-in-dataset");
                html += `<button type="button" class="${classes.join(" ")}" data-thc-jump-day="${iso}">${day}</button>`;
            }
            grid.innerHTML = html;
            normalizeJumpChrome();
        };

        const originalJump = TabelHarianCabang.jumpToDate.bind(TabelHarianCabang);
        TabelHarianCabang.jumpToDate = function(iso){
            const tanggal = String(iso || "").trim().slice(0, 10);
            if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return;

            if((this._jumpDates || []).includes(tanggal)){
                originalJump(tanggal);
                return;
            }

            this.showJumpFeedback("");
            this._jumpSelected = tanggal;
            this.syncJumpTriggerLabel();

            if(typeof DashboardEngine === "undefined" || typeof loadDashboardFromToolbar !== "function"){
                this.showJumpFeedback("Tidak dapat memuat tanggal tersebut. Muat ulang halaman.");
                return;
            }

            DashboardEngine.lastCustomMode = "range";
            DashboardEngine.lastCustomStart = tanggal;
            DashboardEngine.lastCustomEnd = tanggal;

            const startEl = document.getElementById("customStartDate");
            const endEl = document.getElementById("customEndDate");
            const modeEl = document.getElementById("customPeriodMode");
            if(startEl) startEl.value = tanggal;
            if(endEl) endEl.value = tanggal;
            if(modeEl) modeEl.value = "range";

            const displayLabel = (typeof formatDisplayDateId === "function")
                ? formatDisplayDateId(tanggal)
                : tanggal;

            if(typeof setPeriodControlToCustomActive === "function"){
                setPeriodControlToCustomActive(displayLabel);
            }else{
                const periodFilter = document.getElementById("periodFilter");
                if(periodFilter) periodFilter.value = "customtanggal";
            }

            if(typeof persistDashboardFilters === "function"){
                persistDashboardFilters({
                    periode: "customtanggal",
                    customStart: tanggal,
                    customEnd: tanggal,
                    customMode: "range",
                    customMonth: null,
                    customYear: null,
                    displayLabel
                });
            }

            this.closeJumpCalendar();
            loadDashboardFromToolbar({ start: tanggal, end: tanggal, mode: "range" });
            if(typeof syncHeaderContextFromPage === "function"){
                setTimeout(syncHeaderContextFromPage, 0);
            }
        };

        normalizeJumpChrome();
        if(typeof TabelHarianCabang.renderJumpDates === "function"){
            TabelHarianCabang.renderJumpDates();
        }
        console.log("[Tabel Harian] Lompat Tanggal fix aktif.");
        return true;
    }

    document.addEventListener("erp:components-ready", () => {
        setTimeout(install, 0);
    });
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(install, 500);
    });
    setTimeout(install, 1200);
})();

/*
=========================================================
TABEL HARIAN — HEADER FRESHNESS VISUAL FIX (UI ONLY)
=========================================================
- Memperbesar strip GLOBAL / OPERASIONAL / PROVIDER / LAST SYNC.
- LAST SYNC membaca state display hasil ErpFreshness, bukan field syncRow mentah.
- Tidak menulis data dan tidak mengubah engine freshness/sync.
=========================================================
*/
(function(){
    "use strict";
    if(!String(location.pathname || "").toLowerCase().includes("tabel-harian-cabang")) return;

    const style = document.createElement("style");
    style.id = "thcHeaderFreshnessVisualFix";
    style.textContent = `
      .erp-header-vax .vax-sync.vax-thc-freshness{
        min-width:500px!important;
        min-height:48px!important;
        grid-template-columns:30px minmax(80px,auto) minmax(128px,auto) minmax(128px,auto) minmax(145px,auto)!important;
        gap:10px!important;
        padding:7px 12px!important;
        border-radius:13px!important;
      }
      .erp-header-vax .vax-thc-live-icon{
        width:24px!important;
        height:24px!important;
        font-size:21px!important;
      }
      .erp-header-vax .vax-thc-fresh-item{
        min-width:0!important;
        padding-left:10px!important;
        line-height:1.08!important;
      }
      .erp-header-vax .vax-thc-fresh-item small{
        margin-bottom:4px!important;
        font-size:9px!important;
        font-weight:900!important;
        letter-spacing:1px!important;
      }
      .erp-header-vax .vax-thc-fresh-item strong{
        font-size:11px!important;
        font-weight:900!important;
        line-height:1.12!important;
      }
      .erp-header-vax .vax-thc-fresh-item.is-last strong{
        font-size:10.5px!important;
      }
    `;
    document.head.appendChild(style);

    function fmtIso(iso){
        if(!iso) return "—";
        try{
            return new Date(iso).toLocaleString("id-ID",{
                timeZone:"Asia/Jakarta",
                day:"2-digit",
                month:"short",
                year:"numeric",
                hour:"2-digit",
                minute:"2-digit"
            }).replace(" pukul ", ", ");
        }catch(_){ return "—"; }
    }

    async function paintLastSync(){
        const target = document.getElementById("vaxThcLast");
        if(!target) return false;
        try{
            if(typeof ErpFreshness !== "undefined" && typeof ErpFreshness.load === "function"){
                const state = await ErpFreshness.load();
                const value = state?.lastDisplay || fmtIso(state?.lastSyncIso);
                if(value && value !== "—"){
                    target.textContent = value;
                    return true;
                }
            }
        }catch(err){
            console.warn("[THC Header Last Sync UI]", err);
        }
        const toolbar = String(document.getElementById("toolbarLastSync")?.textContent || "").trim();
        if(toolbar && toolbar !== "—") target.textContent = toolbar;
        return true;
    }

    function boot(){
        paintLastSync();
        setTimeout(paintLastSync, 500);
        setTimeout(paintLastSync, 1500);
        if(window.__thcHeaderLastSyncUiTimer) clearInterval(window.__thcHeaderLastSyncUiTimer);
        window.__thcHeaderLastSyncUiTimer = setInterval(paintLastSync, 5000);
        document.getElementById("btnRefresh")?.addEventListener("click", () => setTimeout(paintLastSync, 800));
        document.getElementById("btnSync")?.addEventListener("click", () => setTimeout(paintLastSync, 1400));
    }

    document.addEventListener("erp:components-ready", () => setTimeout(boot, 50));
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 700));
    setTimeout(boot, 1600);
})();