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
