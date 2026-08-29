/*
=========================================================
VAX ERP — Data freshness (PRESENTATION ONLY)
=========================================================
READ-ONLY. Tidak menulis DB. Tidak memicu sync.
Tidak mengubah dashboard-engine, KPI, chart, ranking,
scheduler, sync.js, atau VPS.

Source yang dibaca:
  - daily_recap_source.synced_at          → LAST VALID DATA OPERASIONAL
  - provider_sales_daily_source.synced_at → LAST VALID DATA PROVIDER
  - sync_status.last_sync_at (id=1)       → token SIKLUS SELESAI Daily Recap
                                           (ditulis sync.js hanya di akhir siklus)

RUNTIME vs VALID:
  LAST VALID  = max synced_at of last closed cycle (token / previous wave).
  RUNNING     = verified write-progress, NOT age of synced_at.
    Daily Recap     → ada cabang dengan synced_at > last_sync_at
                      (closeRequiresToken: tetap running sampai token DB bergerak)
    Provider Sales  → session snapshot hanya HINT. Jika coverage cabang hari ini
                      lengkap dan latest synced_at masih fresh (≤ STALE_MIN),
                      anggap complete. Processing timeout jika latest sudah stale.
  Tidak ada flag VPS "sedangBerjalan" di DB. Jangan spinner dari umur timestamp saja.
  Tidak ada ETA palsu / "+1 menit".
=========================================================
*/

const ErpFreshness = {

    TABLE_RECAP: "daily_recap_source",
    TABLE_PROVIDER: "provider_sales_daily_source",
    TABLE_CABANG: "cabang",

    /* Mirror scheduler.js: interval 10 menit, jam 07–23 WIB */
    CADENCE_MIN: 10,
    FRESH_MIN: 8,
    STALE_MIN: 15,
    RESUME_GRACE_MIN: 18,
    WAVE_GAP_MIN: 4,
    CYCLE_TOKEN_SLACK_MS: 5000,
    ANCHOR_KEY: { ops: "erpFresh.opsCompleteAt", provider: "erpFresh.providerCompleteAt" },

    _state: null,
    _loadedAt: 0,
    _completeAnchor: { ops: null, provider: null },

    getState(){
        return this._state;
    },

    isPipelineRunning(state = this._state){
        return Boolean(
            state?.recapAnalysis?.processing
            || state?.providerAnalysis?.processing
            || state?.global?.key === "syncing"
        );
    },

    jakartaParts(nowMs = Date.now()){
        const d = new Date(nowMs);
        const dateISO = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(d);
        const time = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(d);
        const [hourRaw, minuteRaw] = String(time).split(":");
        const hour = Number(hourRaw);
        const minute = Number(minuteRaw);
        return {
            dateISO,
            hour: Number.isFinite(hour) ? hour : 0,
            minute: Number.isFinite(minute) ? minute : 0
        };
    },

    addDaysISO(iso, delta){
        const [y, m, d] = String(iso || "").split("-").map(Number);
        if(!y || !m || !d) return iso;
        const dt = new Date(Date.UTC(y, m - 1, d + Number(delta || 0)));
        return dt.toISOString().slice(0, 10);
    },

    formatHm(iso){
        if(!iso) return "—";
        const d = new Date(iso);
        if(Number.isNaN(d.getTime())) return "—";
        return new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(d);
    },

    formatLastSyncLong(iso){
        if(!iso) return "—";
        const d = new Date(iso);
        if(Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    },

    isVpsOnline(row){
        const vps = row?.vps_online;
        if(vps === undefined || vps === null) return true;
        return vps === true || vps === "true" || vps === "t" || vps === 1 || vps === "1";
    },

    ageMinutes(iso, nowMs){
        if(!iso) return null;
        const t = new Date(iso).getTime();
        if(!Number.isFinite(t)) return null;
        return (nowMs - t) / 60000;
    },

    operationalCabangIds(list){
        const rows = Array.isArray(list) ? list : [];
        const hasMinutesCol = rows.some((c) => Object.prototype.hasOwnProperty.call(c || {}, "nama_minutes"));
        return rows
            .filter((c) => {
                if(!c || c.aktif === false) return false;
                const nama = String(c.nama_cabang || "");
                if(/floating/i.test(nama)) return false;
                if(hasMinutesCol && !String(c.nama_minutes ?? "").trim()) return false;
                return true;
            })
            .map((c) => Number(c.id))
            .filter((id) => Number.isFinite(id));
    },

    perCabangMax(rows, dateISO, dateField){
        const map = new Map();
        (rows || []).forEach((row) => {
            const dateVal = String(row?.[dateField] || "").slice(0, 10);
            if(dateISO && dateVal && dateVal !== dateISO) return;
            const id = Number(row?.cabang_id);
            const ts = row?.synced_at ? new Date(row.synced_at).getTime() : NaN;
            if(!Number.isFinite(id) || !Number.isFinite(ts)) return;
            const prev = map.get(id);
            if(!prev || ts > prev) map.set(id, ts);
        });
        return map;
    },

    analyzePipeline(rows, expectedIds, dateISO, dateField, nowMs){
        const expected = (expectedIds || []).filter((id) => Number.isFinite(Number(id)));
        const perCabang = this.perCabangMax(rows, dateISO, dateField);
        const presentIds = [...perCabang.keys()];
        const times = presentIds.map((id) => perCabang.get(id)).sort((a, b) => a - b);
        const latestMs = times.length ? times[times.length - 1] : null;
        const latestIso = latestMs != null ? new Date(latestMs).toISOString() : null;
        const ageMin = latestIso ? this.ageMinutes(latestIso, nowMs) : null;
        const expectedCount = expected.length || presentIds.length;

        let newestWave = presentIds.slice();
        if(times.length >= 2){
            let splitAt = -1;
            let largestGap = 0;
            for(let i = 1; i < times.length; i++){
                const gap = (times[i] - times[i - 1]) / 60000;
                if(gap > largestGap){
                    largestGap = gap;
                    splitAt = i;
                }
            }
            if(splitAt > 0 && largestGap >= this.WAVE_GAP_MIN){
                const cut = times[splitAt];
                newestWave = presentIds.filter((id) => perCabang.get(id) >= cut);
            }
        }

        const waveTimes = newestWave.map((id) => perCabang.get(id)).sort((a, b) => a - b);
        const done = newestWave.length;
        const coverageComplete = expectedCount > 0 && presentIds.length >= expectedCount;
        const waveComplete = coverageComplete && done >= expectedCount;
        const missing = Math.max(0, expectedCount - done);
        const waveStartMs = waveTimes.length ? waveTimes[0] : null;
        let prevWaveLatestMs = null;
        if(newestWave.length && newestWave.length < presentIds.length){
            const newestSet = new Set(newestWave);
            const prevTimes = presentIds
                .filter((id) => !newestSet.has(id))
                .map((id) => perCabang.get(id))
                .filter((ms) => Number.isFinite(ms))
                .sort((a, b) => a - b);
            if(prevTimes.length){
                prevWaveLatestMs = prevTimes[prevTimes.length - 1];
            }
        }
        const prevWaveLatestIso = prevWaveLatestMs != null
            ? new Date(prevWaveLatestMs).toISOString()
            : null;
        const waveOpen = Boolean(latestIso && !waveComplete && newestWave.length > 0);

        return {
            perCabang,
            expectedIds: expected,
            latestIso,
            lastValidIso: waveComplete ? latestIso : (prevWaveLatestIso || latestIso),
            ageMin,
            done,
            expectedCount,
            complete: waveComplete,
            processing: false,
            waveOpen,
            missing,
            waveStartMs,
            prevWaveLatestIso
        };
    },

    readCompleteAnchor(kind){
        if(this._completeAnchor[kind]) return this._completeAnchor[kind];
        const key = this.ANCHOR_KEY[kind];
        if(!key || typeof sessionStorage === "undefined") return null;
        try{
            const stored = sessionStorage.getItem(key);
            if(stored) this._completeAnchor[kind] = stored;
            return stored || null;
        }catch(_err){
            return null;
        }
    },

    rememberComplete(kind, iso){
        if(!iso || !kind) return;
        this._completeAnchor[kind] = iso;
        const key = this.ANCHOR_KEY[kind];
        if(!key || typeof sessionStorage === "undefined") return;
        try{
            sessionStorage.setItem(key, iso);
        }catch(_err){ /* ignore quota / private mode */ }
    },

    resetRuntimeAnchors(){
        this._completeAnchor = { ops: null, provider: null };
        if(typeof sessionStorage === "undefined") return;
        try{
            sessionStorage.removeItem(this.ANCHOR_KEY.ops);
            sessionStorage.removeItem(this.ANCHOR_KEY.provider);
        }catch(_err){ /* ignore */ }
    },

    countAheadOfToken(perCabang, expectedIds, tokenMs, slackMs){
        const ids = (expectedIds || []).length
            ? expectedIds
            : [...(perCabang?.keys?.() || [])];
        let ahead = 0;
        ids.forEach((id) => {
            const ts = perCabang.get(Number(id));
            if(Number.isFinite(ts) && ts > tokenMs + slackMs) ahead += 1;
        });
        return ahead;
    },

    /**
     * RUNNING = write-progress vs a closed-cycle token.
     * Recap: token = sync_status.last_sync_at (written only at cycle end).
     * Provider: session snapshot is HINT only. Fresh full coverage closes
     * the cycle even if some cabang timestamps lag the session token.
     * closeRequiresToken: if true, even 100% cabang ahead still RUNNING until token moves.
     */
    coverageFresh(analysis, expectedCount){
        const covered = expectedCount > 0 && (analysis?.perCabang?.size || 0) >= expectedCount;
        const fresh = analysis?.ageMin != null
            && Number.isFinite(analysis.ageMin)
            && analysis.ageMin <= this.STALE_MIN;
        return Boolean(analysis?.latestIso && covered && fresh);
    },

    closeFreshCoverage(kind, analysis, opts = {}){
        if(opts.closeRequiresToken === true) return false;
        const expectedCount = analysis.expectedCount || (opts.expectedIds || []).length;
        if(!this.coverageFresh(analysis, expectedCount)) return false;
        analysis.processing = false;
        analysis.complete = true;
        analysis.lastValidIso = analysis.latestIso;
        analysis.done = analysis.perCabang.size;
        analysis.missing = 0;
        if(opts.persistComplete === true && analysis.latestIso){
            this.rememberComplete(kind, analysis.latestIso);
        }
        return true;
    },

    applyRuntime(kind, analysis, opts = {}){
        if(!analysis) return analysis;
        const expectedIds = analysis.expectedIds || opts.expectedIds || [];
        const expectedCount = analysis.expectedCount || expectedIds.length;
        const tokenIso = opts.tokenIso || null;
        const tokenMs = tokenIso ? new Date(tokenIso).getTime() : NaN;
        const hasToken = Number.isFinite(tokenMs);
        const slack = this.CYCLE_TOKEN_SLACK_MS;
        const persist = opts.persistComplete === true;
        const closeRequiresToken = opts.closeRequiresToken === true;

        if(this.closeFreshCoverage(kind, analysis, {
            closeRequiresToken,
            persistComplete: persist,
            expectedIds
        })){
            return analysis;
        }

        if(hasToken){
            const ahead = this.countAheadOfToken(
                analysis.perCabang, expectedIds, tokenMs, slack
            );
            analysis.aheadCount = ahead;
            if(ahead > 0 && (closeRequiresToken || ahead < expectedCount)){
                const stale = !closeRequiresToken && (
                    analysis.ageMin == null || analysis.ageMin > this.STALE_MIN
                );
                if(stale){
                    analysis.processing = false;
                    analysis.lastValidIso = analysis.latestIso || tokenIso || analysis.lastValidIso;
                    return analysis;
                }
                analysis.processing = true;
                analysis.complete = false;
                analysis.lastValidIso = closeRequiresToken
                    ? tokenIso
                    : (analysis.latestIso || tokenIso);
                analysis.done = ahead;
                analysis.missing = Math.max(0, expectedCount - ahead);
                return analysis;
            }
            if(!closeRequiresToken && ahead >= expectedCount && expectedCount > 0){
                analysis.processing = false;
                analysis.complete = true;
                analysis.lastValidIso = analysis.latestIso;
                analysis.done = ahead;
                analysis.missing = 0;
                if(persist && analysis.latestIso) this.rememberComplete(kind, analysis.latestIso);
                return analysis;
            }
            analysis.processing = false;
            if(analysis.complete){
                analysis.lastValidIso = analysis.latestIso;
                if(persist && analysis.latestIso) this.rememberComplete(kind, analysis.latestIso);
            }else{
                analysis.lastValidIso = tokenIso || analysis.lastValidIso;
            }
            return analysis;
        }

        if(analysis.waveOpen){
            const stillActive = analysis.ageMin == null || analysis.ageMin <= this.STALE_MIN;
            analysis.processing = stillActive;
            if(analysis.processing){
                analysis.complete = false;
                analysis.lastValidIso = closeRequiresToken
                    ? (analysis.prevWaveLatestIso || analysis.lastValidIso)
                    : (analysis.latestIso || analysis.prevWaveLatestIso || analysis.lastValidIso);
            }
            return analysis;
        }

        analysis.processing = false;
        if(analysis.complete && persist && analysis.latestIso){
            analysis.lastValidIso = analysis.latestIso;
            this.rememberComplete(kind, analysis.latestIso);
        }
        return analysis;
    },

    pipelineView(analysis, opts){
        const {
            night,
            resumeGrace,
            syncFailed,
            vpsDown,
            operationalHours
        } = opts;
        const validIso = (analysis.processing && opts.provider)
            ? (analysis.latestIso || analysis.lastValidIso)
            : analysis.processing
                ? (analysis.lastValidIso || analysis.latestIso)
                : (analysis.latestIso || analysis.lastValidIso);
        const lastHm = this.formatHm(validIso);
        const lastLine = `Terakhir valid ${lastHm}`;

        if(!analysis.latestIso){
            if(night){
                return {
                    key: "night",
                    tone: "gold",
                    label: "Menunggu jadwal",
                    lastHm,
                    lines: [lastLine],
                    valid: false
                };
            }
            if(resumeGrace){
                return {
                    key: "resume",
                    tone: "cyan",
                    label: "Menunggu update",
                    lastHm,
                    lines: [lastLine],
                    valid: false
                };
            }
            if(operationalHours){
                return {
                    key: "error",
                    tone: "red",
                    label: "Belum ada data",
                    lastHm,
                    lines: [lastLine],
                    valid: false
                };
            }
            return {
                key: "waiting",
                tone: "gold",
                label: "Menunggu update",
                lastHm,
                lines: [lastLine],
                valid: false
            };
        }

        if(analysis.processing){
            const procLabel = (opts.provider && lastHm && lastHm !== "—")
                ? `Sedang diperbarui ${lastHm}`
                : "Sedang diperbarui";
            return {
                key: "processing",
                tone: "cyan",
                icon: "⏳",
                label: procLabel,
                lastHm,
                lastLine,
                lines: [`⏳ ${procLabel}`, lastLine],
                valid: false,
                running: true
            };
        }

        if(night){
            return {
                key: analysis.complete ? "synced" : "night",
                tone: "gold",
                icon: analysis.complete ? "✅" : "",
                label: analysis.complete ? `✅ Tersinkron ${lastHm}` : "Data terakhir",
                lastHm,
                lastLine,
                lines: analysis.complete ? [`✅ Tersinkron ${lastHm}`] : [lastLine],
                valid: analysis.complete
            };
        }

        if(resumeGrace && analysis.ageMin != null && analysis.ageMin > this.STALE_MIN){
            return {
                key: "resume",
                tone: "cyan",
                label: "Menunggu update",
                lastHm,
                lines: [lastLine],
                valid: analysis.complete
            };
        }

        if(
            operationalHours
            && (vpsDown || syncFailed)
            && !opts.provider
            && analysis.ageMin != null
            && analysis.ageMin > this.STALE_MIN
        ){
            return {
                key: "error",
                tone: "red",
                label: vpsDown ? "VPS bermasalah" : "Sync gagal",
                lastHm,
                lines: [lastLine],
                valid: false
            };
        }

        if(analysis.complete){
            return {
                key: "synced",
                tone: "green",
                icon: "✅",
                label: `✅ Tersinkron ${lastHm}`,
                lastHm,
                lastLine,
                lines: [`✅ Tersinkron ${lastHm}`],
                valid: true,
                running: false
            };
        }

        if(operationalHours && analysis.ageMin != null && analysis.ageMin > this.STALE_MIN){
            return {
                key: "delayed",
                tone: analysis.complete ? "amber" : "red",
                label: analysis.complete ? "Sync terlambat" : "Perlu perbaikan",
                lastHm,
                lines: [lastLine],
                valid: false
            };
        }

        return {
            key: analysis.complete ? "synced" : "waiting",
            tone: analysis.complete ? "green" : "cyan",
            label: analysis.complete ? "Tersinkron" : "Menunggu update",
            lastHm,
            lines: [lastLine],
            valid: analysis.complete
        };
    },

    evaluate(snapshot, nowMs = Date.now()){
        const parts = snapshot?.jakarta || this.jakartaParts(nowMs);
        const hour = parts.hour;
        const minute = parts.minute;
        const todayISO = parts.dateISO;
        const yesterdayISO = this.addDaysISO(todayISO, -1);
        const night = hour >= 0 && hour < 7;
        const operationalHours = hour >= 7 && hour <= 23;
        const resumeAtMs = Date.parse(`${todayISO}T07:00:00+07:00`);
        const minutesSinceResume = operationalHours ? ((hour - 7) * 60 + minute) : 0;
        const syncRow = snapshot?.syncRow || null;
        const expectedIds = snapshot?.expectedCabangIds || [];

        const recapToken = syncRow?.last_sync_at || null;
        const recapRowsToday = snapshot?.recapRows || [];
        const recapRowsYday = snapshot?.recapRowsYesterday || recapRowsToday;
        const providerRowsToday = snapshot?.providerRows || [];
        const providerRowsYday = snapshot?.providerRowsYesterday || providerRowsToday;

        const recapDate = night ? yesterdayISO : todayISO;
        const recapRows = night ? recapRowsYday : recapRowsToday;
        const providerDate = night ? yesterdayISO : todayISO;
        const providerRows = night ? providerRowsYday : providerRowsToday;

        const recapAnalysis = this.analyzePipeline(
            recapRows, expectedIds, recapDate, "tanggal", nowMs
        );
        if(!recapAnalysis.latestIso && recapToken){
            recapAnalysis.latestIso = recapToken;
            recapAnalysis.ageMin = this.ageMinutes(recapToken, nowMs);
        }

        const providerAnalysis = this.analyzePipeline(
            providerRows, expectedIds, providerDate, "activity_date", nowMs
        );
        this.applyRuntime("ops", recapAnalysis, {
            tokenIso: recapToken,
            expectedIds,
            closeRequiresToken: Boolean(recapToken),
            persistComplete: false
        });
        this.applyRuntime("provider", providerAnalysis, {
            tokenIso: this.readCompleteAnchor("provider"),
            expectedIds,
            closeRequiresToken: false,
            persistComplete: true
        });

        const lastSyncIso = recapAnalysis.latestIso || recapToken || snapshot?.lastIsoFallback || null;
        const lastSyncMs = lastSyncIso ? new Date(lastSyncIso).getTime() : NaN;
        const syncedSinceResume = Number.isFinite(resumeAtMs)
            && Number.isFinite(lastSyncMs)
            && lastSyncMs >= resumeAtMs;
        const resumeGrace = operationalHours
            && minutesSinceResume < this.RESUME_GRACE_MIN
            && !syncedSinceResume;

        const statusRaw = String(syncRow?.status || "").trim().toLowerCase();
        const syncFailed = ["gagal", "failed", "error"].includes(statusRaw)
            || (Number(syncRow?.gagal || 0) > 0 && Number(syncRow?.berhasil || 0) === 0);
        const vpsDown = !this.isVpsOnline(syncRow);

        const operational = this.pipelineView(recapAnalysis, {
            night,
            resumeGrace,
            syncFailed,
            vpsDown,
            operationalHours,
            provider: false
        });
        const provider = this.pipelineView(providerAnalysis, {
            night,
            resumeGrace,
            syncFailed: false,
            vpsDown: false,
            operationalHours,
            provider: true
        });

        const anyRunning = recapAnalysis.processing || providerAnalysis.processing;
        const bothComplete = recapAnalysis.complete && providerAnalysis.complete && !anyRunning;
        const isFinalDaily = night && bothComplete;

        let globalKey = "live";
        let globalTone = "green";
        let globalLabel = "✅ LIVE";
        let globalSub = "";
        let headerCss = "is-success";
        let headerKey = "normal";
        let allowRed = false;

        if(night){
            globalKey = "night";
            globalTone = "gold";
            globalLabel = "JAM OPERASIONAL SYNC SELESAI";
            globalSub = "Sinkronisasi operasional akan aktif kembali pukul 07:00 WIB.";
            headerCss = "is-waiting";
            headerKey = "night";
            if(isFinalDaily){
                globalSub = `${globalSub} Final update: ${this.formatHm(lastSyncIso)}.`;
            }else if(lastSyncIso){
                globalSub = `${globalSub} Data terakhir valid: ${this.formatHm(lastSyncIso)}.`;
            }
        }else if(resumeGrace && !anyRunning){
            globalKey = "resume";
            globalTone = "cyan";
            globalLabel = "MENUNGGU SYNC";
            globalSub = "Menunggu siklus sync pertama setelah pukul 07:00 WIB.";
            headerCss = "is-syncing";
            headerKey = "live";
        }else if(operationalHours && (vpsDown || syncFailed) && recapAnalysis.ageMin != null && recapAnalysis.ageMin > this.STALE_MIN){
            globalKey = "error";
            globalTone = "red";
            globalLabel = vpsDown ? "VPS BERMASALAH" : "PERLU PERBAIKAN";
            globalSub = syncRow?.pesan || "Sync gagal pada jam operasional.";
            headerCss = "is-error";
            headerKey = "error";
            allowRed = true;
        }else if(operationalHours && (vpsDown || syncFailed) && !anyRunning){
            globalKey = "delayed";
            globalTone = "amber";
            globalLabel = "AUTO RECOVERY";
            globalSub = "Sistem sedang mencoba memulihkan koneksi.";
            headerCss = "is-recovery";
            headerKey = "recovery";
            allowRed = false;
        }else if(anyRunning){
            globalKey = "syncing";
            globalTone = "cyan";
            globalLabel = "🔄 SINKRONISASI";
            globalSub = recapAnalysis.processing && providerAnalysis.processing
                ? "Operasional dan Provider sedang diperbarui"
                : recapAnalysis.processing
                    ? "Data operasional sedang diperbarui"
                    : "Data provider sedang diperbarui";
            headerCss = "is-syncing";
            headerKey = "syncing";
        }else if(operationalHours && (
            (operational.key === "delayed" || operational.key === "error")
            || (provider.key === "delayed" || provider.key === "error")
        )){
            const hard = operational.tone === "red" || provider.tone === "red";
            globalKey = hard ? "error" : "delayed";
            globalTone = hard ? "red" : "amber";
            globalLabel = hard ? "PERLU PERBAIKAN" : "SYNC TERLAMBAT";
            globalSub = "Freshness melewati ambang pada jam operasional.";
            headerCss = hard ? "is-error" : "is-warn";
            headerKey = hard ? "error" : "recovery";
            allowRed = hard;
        }else if(hour === 23 && bothComplete && recapAnalysis.ageMin != null && recapAnalysis.ageMin <= this.STALE_MIN){
            globalKey = "final";
            globalTone = "gold";
            globalLabel = "FINAL HARIAN";
            globalSub = `100% TERSINKRON · Final update: ${this.formatHm(lastSyncIso)}`;
            headerCss = "is-waiting";
            headerKey = "final";
        }else if(bothComplete && operational.key === "synced" && provider.key === "synced"){
            globalKey = "live";
            globalTone = "green";
            globalLabel = "✅ LIVE";
            globalSub = "Kedua pipeline valid. Tidak ada siklus yang sedang berjalan.";
            headerCss = "is-success";
            headerKey = "normal";
        }else{
            globalKey = "live";
            globalTone = "green";
            globalLabel = "✅ LIVE";
            globalSub = "Jam operasional aktif.";
            headerCss = "is-success";
            headerKey = "normal";
        }

        const investorFinal = isFinalDaily || globalKey === "final";
        const lastDisplay = this.formatLastSyncLong(lastSyncIso);

        return {
            nowMs,
            todayISO,
            yesterdayISO,
            recapDate,
            providerDate,
            night,
            operationalHours,
            resumeGrace,
            hour,
            minute,
            lastSyncIso,
            lastDisplay,
            recapAnalysis,
            providerAnalysis,
            operational,
            provider,
            global: {
                key: globalKey,
                tone: globalTone,
                label: globalLabel,
                sub: globalSub
            },
            header: {
                key: headerKey,
                css: headerCss,
                label: globalLabel,
                sub: globalSub
            },
            isFinalDaily: investorFinal,
            allowRed,
            investor: {
                mode: investorFinal ? "FINAL" : "LIVE",
                label: investorFinal ? "DATA FINAL TERVERIFIKASI" : "LIVE / BELUM FINAL"
            },
            ai: this.buildAiNotes({
                night,
                investorFinal,
                operational,
                provider
            }),
            syncRow
        };
    },

    buildAiNotes({ night, investorFinal, operational, provider }){
        const notes = [];
        const operationalValid = operational?.valid === true
            || operational?.key === "synced"
            || operational?.key === "waiting";
        const providerValid = provider?.valid === true
            || provider?.key === "synced"
            || provider?.key === "waiting";
        const providerUpdating = provider?.key === "processing";

        if(operationalValid){
            notes.push("Analisis Operasional Valid");
        }else if(operational?.key === "processing"){
            notes.push("Menunggu data operasional terbaru.");
        }else if(!night){
            notes.push("Menunggu data operasional terbaru.");
        }

        if(providerUpdating){
            notes.push("Data Provider masih diperbarui.");
        }else if(!providerValid){
            notes.push("Menunggu data provider terbaru.");
        }

        if(investorFinal){
            notes.push("Data final terverifikasi untuk laporan harian.");
        }else{
            notes.push("LIVE / BELUM FINAL");
        }

        return {
            operationalValid,
            providerValid,
            providerUpdating,
            holdOperational: !operationalValid,
            holdProvider: !providerValid || providerUpdating,
            holdPrediction: !operationalValid,
            isFinalDaily: investorFinal,
            notes
        };
    },

    async fetchTable(table, cols, dateCol, dateISO){
        if(typeof db === "undefined" || !db?.from || !dateISO) return [];
        const { data, error } = await db
            .from(table)
            .select(cols)
            .eq(dateCol, dateISO)
            .limit(2000);
        if(error){
            console.warn(`erp-freshness ${table}:`, error.message || error);
            return [];
        }
        return data || [];
    },

    async load(opts = {}){
        const nowMs = opts.nowMs || Date.now();
        const parts = this.jakartaParts(nowMs);
        const yesterdayISO = this.addDaysISO(parts.dateISO, -1);
        let expectedIds = this.operationalCabangIds(
            (typeof DashboardEngine !== "undefined" && DashboardEngine.cabangList) || []
        );

        const tasks = [
            this.fetchTable(this.TABLE_RECAP, "cabang_id,tanggal,synced_at", "tanggal", parts.dateISO),
            this.fetchTable(this.TABLE_RECAP, "cabang_id,tanggal,synced_at", "tanggal", yesterdayISO),
            this.fetchTable(this.TABLE_PROVIDER, "cabang_id,activity_date,synced_at", "activity_date", parts.dateISO),
            this.fetchTable(this.TABLE_PROVIDER, "cabang_id,activity_date,synced_at", "activity_date", yesterdayISO)
        ];

        if(!expectedIds.length && typeof db !== "undefined" && db?.from){
            tasks.push((async () => {
                const { data, error } = await db
                    .from(this.TABLE_CABANG)
                    .select("id,nama_cabang,nama_minutes,aktif")
                    .limit(200);
                if(error && /nama_minutes|column/i.test(error.message || "")){
                    const retry = await db.from(this.TABLE_CABANG).select("id,nama_cabang,aktif").limit(200);
                    return retry.data || [];
                }
                return error ? [] : (data || []);
            })());
        }else{
            tasks.push(Promise.resolve(null));
        }

        const [
            recapToday,
            recapYday,
            providerToday,
            providerYday,
            cabangRows
        ] = await Promise.all(tasks);

        if(cabangRows){
            expectedIds = this.operationalCabangIds(cabangRows);
        }

        this._state = this.evaluate({
            jakarta: parts,
            syncRow: opts.syncRow || null,
            lastIsoFallback: opts.lastIsoFallback || null,
            expectedCabangIds: expectedIds,
            recapRows: recapToday,
            recapRowsYesterday: recapYday,
            providerRows: providerToday,
            providerRowsYesterday: providerYday
        }, nowMs);
        this._loadedAt = nowMs;
        return this._state;
    },

    escapeHtml(value){
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    itemHtml(kind, view){
        const tone = view?.tone || "gold";
        const kicker = kind === "global" ? "GLOBAL" : kind === "ops" ? "OPERASIONAL" : "PROVIDER";
        const isProcessing = view?.key === "processing" || (kind === "global" && view?.key === "syncing");
        const isLive = kind === "global" && view?.key === "live";
        const isSynced = view?.key === "synced";
        const title = kind === "global"
            ? this.escapeHtml(view?.sub || view?.label || "")
            : this.escapeHtml((view?.lines || []).join(" · "));

        let iconHtml = "";
        let labelText = view?.label || "—";
        if(isLive){
            iconHtml = `<i class="erp-freshness-ico is-live" aria-hidden="true"></i>`;
            labelText = "LIVE";
        }else if(kind === "global" && view?.key === "syncing"){
            iconHtml = `<i class="erp-freshness-sync is-running" aria-hidden="true"></i>`;
            labelText = "Sinkronisasi";
        }else if(view?.key === "processing"){
            iconHtml = `<span class="erp-freshness-wait is-running" aria-hidden="true">⏳</span>`;
            labelText = view?.label || "Sedang diperbarui";
        }else if(isSynced){
            iconHtml = "";
        }else{
            iconHtml = `<i class="erp-freshness-dot" aria-hidden="true"></i>`;
        }

        const timeInLabel = Boolean(view?.lastHm && view.lastHm !== "—" && String(view?.label || "").includes(view.lastHm));
        let extra = "";
        if(kind !== "global" && !isSynced && !timeInLabel){
            extra = `<span class="erp-freshness-time">${this.escapeHtml(view?.lastLine || `Terakhir valid ${view?.lastHm || "—"}`)}</span>`;
        }

        const runningClass = isProcessing ? " is-running" : "";
        const iconClass = (isProcessing || isLive || isSynced) ? " has-icon" : "";

        return `
            <div class="erp-freshness-item tone-${tone}${iconClass}${runningClass}" data-fresh="${kind}" data-key="${this.escapeHtml(view?.key || "")}" title="${title}">
                <span class="erp-freshness-kicker">${kicker}</span>
                <span class="erp-freshness-row">
                    ${iconHtml}
                    <strong>${this.escapeHtml(labelText)}</strong>
                </span>
                ${extra}
            </div>
        `;
    },

    renderHeader(state){
        const headerStatus = document.getElementById("headerMinutesStatus");
        const headerLabel = document.getElementById("headerMinutesLabel");
        const headerSub = document.getElementById("headerMinutesSub");
        const headerTip = document.getElementById("headerMinutesTip");
        const iconWrap = document.getElementById("headerMinutesIconWrap");
        if(!headerStatus && !headerLabel) return;

        if(headerStatus){
            headerStatus.classList.remove(
                "is-online","is-success","is-syncing","is-waiting","is-warn",
                "is-error","is-offline","is-recovery","is-night","is-final","is-runtime"
            );
            headerStatus.classList.add(state.header.css);
            if(state.night) headerStatus.classList.add("is-night");
            if(state.isFinalDaily) headerStatus.classList.add("is-final");
            headerStatus.classList.toggle("is-runtime", state.global.key === "syncing");
        }
        if(headerLabel){
            headerLabel.textContent = state.night
                ? "Jam Sync Selesai"
                : state.global.key === "final"
                    ? "Final Harian"
                    : state.global.key === "syncing"
                        ? "Sinkronisasi"
                        : state.global.key === "resume"
                            ? "Menunggu Sync"
                            : state.global.key === "error"
                                ? "Perlu Perbaikan"
                                : state.global.key === "delayed"
                                    ? "Sync Terlambat"
                                    : "LIVE";
        }
        if(headerSub){
            headerSub.textContent = state.night
                ? "Aktif kembali 07:00 WIB"
                : (state.header.sub || "");
            headerSub.hidden = !headerSub.textContent;
        }
        if(typeof syncHealthIconSvg === "function" && iconWrap){
            const iconKey = state.header.key === "error"
                ? "error"
                : state.header.key === "normal"
                    ? "normal"
                    : "recovery";
            const dot = iconWrap.querySelector(".header-minutes-dot");
            iconWrap.innerHTML = syncHealthIconSvg(iconKey);
            if(dot) iconWrap.appendChild(dot);
            else iconWrap.insertAdjacentHTML("beforeend", `<i class="header-minutes-dot"></i>`);
        }
        const ok = Number(state.syncRow?.berhasil || 0);
        const total = Number(state.syncRow?.total_cabang || 0);
        const fail = Number(state.syncRow?.gagal || 0);
        const vpsLabel = this.isVpsOnline(state.syncRow) ? "Online" : "Offline";
        const tip = [
            state.global.label,
            state.global.sub,
            `Operasional: ${state.operational.label} ${state.operational.lastHm || ""}`.trim(),
            `Provider: ${state.provider.label} ${state.provider.lastHm || ""}`.trim(),
            `Last Sync: ${state.lastDisplay}`,
            `Cabang: ${ok} / ${total}`,
            `Gagal: ${fail}`,
            `VPS: ${vpsLabel}`,
            `Investor: ${state.investor.label}`,
            state.syncRow?.pesan ? `Pesan: ${state.syncRow.pesan}` : null
        ].filter(Boolean).join("\n");
        if(headerStatus){
            headerStatus.setAttribute("aria-label", tip.replaceAll("\n", ". "));
        }
        if(headerTip) headerTip.textContent = tip;
    },

    renderToolbar(state){
        const host = document.getElementById("erpFreshness");
        const lastEl = document.getElementById("toolbarLastSync");
        const oldSync = document.getElementById("toolbarLastSync")?.closest(".toolbar-last-sync");
        if(lastEl) lastEl.textContent = state.lastDisplay;
        if(oldSync) oldSync.hidden = true;
        if(!host) return;
        host.hidden = false;
        host.setAttribute("data-tone", state.global.tone);
        host.innerHTML = [
            this.itemHtml("global", {
                tone: state.global.tone,
                label: state.global.key === "night"
                    ? "Jam sync selesai"
                    : state.global.key === "final"
                        ? "Final harian"
                        : state.global.key === "syncing"
                            ? "Sinkronisasi"
                            : state.global.key === "resume"
                                ? "Menunggu sync"
                                : state.global.key === "error"
                                    ? "Perlu perbaikan"
                                    : state.global.key === "delayed"
                                        ? "Terlambat"
                                        : "LIVE",
                sub: state.global.sub,
                key: state.global.key
            }),
            this.itemHtml("ops", state.operational),
            this.itemHtml("provider", state.provider)
        ].join("");
        const inv = document.getElementById("erpFreshnessInvestor");
        if(inv){
            inv.hidden = false;
            inv.textContent = state.investor.label;
            inv.classList.toggle("is-final", state.investor.mode === "FINAL");
        }
    },

    render(opts = {}){
        let state = this._state;
        if(!state || opts.forceEvaluate){
            state = this.evaluate({
                syncRow: opts.syncRow || null,
                lastIsoFallback: opts.lastIsoFallback || null,
                expectedCabangIds: this.operationalCabangIds(
                    (typeof DashboardEngine !== "undefined" && DashboardEngine.cabangList) || []
                ),
                recapRows: [],
                providerRows: []
            }, opts.nowMs || Date.now());
            this._state = state;
        }else if(opts.syncRow){
            state.syncRow = opts.syncRow;
        }
        this.renderHeader(state);
        this.renderToolbar(state);
        document.body.setAttribute("data-erp-freshness", state.global.key);
        document.body.setAttribute("data-erp-investor", state.investor.mode);
        document.body.setAttribute("data-erp-running", state.global.key === "syncing" ? "1" : "0");
        return state;
    },

    classifyHeader(row, nowMs = Date.now()){
        const state = this.evaluate({
            syncRow: row,
            lastIsoFallback: row?.last_sync_at || null,
            expectedCabangIds: this.operationalCabangIds(
                (typeof DashboardEngine !== "undefined" && DashboardEngine.cabangList) || []
            ),
            recapRows: this._state?.recapAnalysis ? null : [],
            recapRowsYesterday: null,
            providerRows: [],
            providerRowsYesterday: []
        }, nowMs);
        if(this._state){
            return this._state.header;
        }
        return state.header;
    }
};

window.ErpFreshness = ErpFreshness;

window.ErpFreshnessTest = {
    evaluate: (snapshot, nowMs) => ErpFreshness.evaluate(snapshot, nowMs),

    fixtureCabang(n = 10){
        return Array.from({ length: n }, (_, i) => i + 1);
    },

    rowsFromTimes(times, dateISO, dateField){
        return (times || []).map((iso, i) => ({
            cabang_id: i + 1,
            [dateField]: dateISO,
            synced_at: iso
        }));
    },

    isoAt(dateISO, hm){
        return `${dateISO}T${hm}:00+07:00`;
    },

    runMatrix(){
        ErpFreshness.resetRuntimeAnchors();
        const ids = this.fixtureCabang(10);
        const day = "2026-08-18";
        const results = [];
        const okRow = (extra = {}) => ({
            status: "berhasil",
            berhasil: 10,
            gagal: 0,
            total_cabang: 10,
            vps_online: true,
            ...extra
        });

        /* A. Idle, both fresh */
        ErpFreshness.resetRuntimeAnchors();
        const aNow = Date.parse("2026-08-18T15:00:00+07:00");
        const recapIdle = this.rowsFromTimes(ids.map(() => this.isoAt(day, "14:58")), day, "tanggal");
        const providerIdle = this.rowsFromTimes(ids.map(() => this.isoAt(day, "14:59")), day, "activity_date");
        const a = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 15, minute: 0 },
            expectedCabangIds: ids,
            recapRows: recapIdle,
            recapRowsYesterday: [],
            providerRows: providerIdle,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "14:59") })
        }, aNow);
        results.push({
            id: "A",
            pass: a.global.key === "live"
                && a.global.tone === "green"
                && a.operational.key === "synced"
                && a.provider.key === "synced"
                && /^✅ Tersinkron \d{2}:\d{2}$/.test(a.operational.label)
                && /^✅ Tersinkron \d{2}:\d{2}$/.test(a.provider.label)
                && a.recapAnalysis.processing === false
                && a.providerAnalysis.processing === false,
            global: a.global.key,
            operational: a.operational.key,
            provider: a.provider.key
        });

        /* B. Daily Recap running */
        ErpFreshness.resetRuntimeAnchors();
        ErpFreshness.rememberComplete("provider", this.isoAt(day, "14:59"));
        const bNow = Date.parse("2026-08-18T15:03:00+07:00");
        const recapB = this.rowsFromTimes(
            ids.map((_, i) => this.isoAt(day, i < 3 ? "15:02" : "14:58")),
            day,
            "tanggal"
        );
        const b = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 15, minute: 3 },
            expectedCabangIds: ids,
            recapRows: recapB,
            recapRowsYesterday: [],
            providerRows: providerIdle,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "14:59") })
        }, bNow);
        results.push({
            id: "B",
            pass: b.global.key === "syncing"
                && b.operational.key === "processing"
                && b.operational.label === "Sedang diperbarui"
                && b.operational.lastLine === "Terakhir valid 14:59"
                && b.provider.key === "synced"
                && b.header.key === "syncing",
            global: b.global.key,
            operational: b.operational.key,
            operationalLast: b.operational.lastLine,
            provider: b.provider.key
        });

        /* C. Recap done + Provider coverage lengkap + fresh
           (session token / wave gap TIDAK boleh false-positive processing) */
        ErpFreshness.resetRuntimeAnchors();
        ErpFreshness.rememberComplete("provider", this.isoAt(day, "16:55"));
        const cNow = Date.parse("2026-08-18T17:01:00+07:00");
        const recapC = this.rowsFromTimes(ids.map(() => this.isoAt(day, "16:58")), day, "tanggal");
        const providerC = this.rowsFromTimes(
            ids.map((_, i) => this.isoAt(day, i < 3 ? "17:00" : "16:55")),
            day,
            "activity_date"
        );
        const c = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 17, minute: 1 },
            expectedCabangIds: ids,
            recapRows: recapC,
            recapRowsYesterday: [],
            providerRows: providerC,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "16:59") })
        }, cNow);
        results.push({
            id: "C",
            pass: c.global.key === "live"
                && c.operational.key === "synced"
                && /^✅ Tersinkron 16:58$/.test(c.operational.label)
                && c.provider.key === "synced"
                && /^✅ Tersinkron 17:00$/.test(c.provider.label)
                && c.providerAnalysis.processing === false,
            global: c.global.key,
            operational: c.operational.key,
            operationalLabel: c.operational.label,
            provider: c.provider.key,
            providerLabel: c.provider.label
        });

        /* C2. Provider coverage belum lengkap + latest masih fresh → processing + jam terbaru */
        ErpFreshness.resetRuntimeAnchors();
        ErpFreshness.rememberComplete("provider", this.isoAt(day, "16:55"));
        const c2Now = Date.parse("2026-08-18T17:01:00+07:00");
        const providerC2 = this.rowsFromTimes(
            [this.isoAt(day, "17:00"), this.isoAt(day, "17:00"), this.isoAt(day, "16:56")],
            day,
            "activity_date"
        );
        const c2 = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 17, minute: 1 },
            expectedCabangIds: ids,
            recapRows: recapC,
            recapRowsYesterday: [],
            providerRows: providerC2,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "16:59") })
        }, c2Now);
        results.push({
            id: "C2",
            pass: c2.provider.key === "processing"
                && c2.provider.label === "Sedang diperbarui 17:00"
                && c2.provider.lastHm === "17:00"
                && c2.operational.key === "synced"
                && c2.global.key === "syncing",
            global: c2.global.key,
            provider: c2.provider.key,
            providerLabel: c2.provider.label
        });

        /* C3. Coverage tidak lengkap + latest stale → jangan nyangkut processing */
        ErpFreshness.resetRuntimeAnchors();
        ErpFreshness.rememberComplete("provider", this.isoAt(day, "16:40"));
        const c3Now = Date.parse("2026-08-18T17:10:00+07:00");
        const providerC3 = this.rowsFromTimes(
            [this.isoAt(day, "16:50"), this.isoAt(day, "16:50"), this.isoAt(day, "16:40")],
            day,
            "activity_date"
        );
        const recapC3 = this.rowsFromTimes(ids.map(() => this.isoAt(day, "16:58")), day, "tanggal");
        const c3 = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 17, minute: 10 },
            expectedCabangIds: ids,
            recapRows: recapC3,
            recapRowsYesterday: [],
            providerRows: providerC3,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "16:59") })
        }, c3Now);
        results.push({
            id: "C3",
            pass: c3.provider.key !== "processing"
                && c3.providerAnalysis.processing === false
                && c3.operational.key === "synced",
            provider: c3.provider.key,
            processing: c3.providerAnalysis.processing
        });

        /* D. Both done */
        ErpFreshness.resetRuntimeAnchors();
        const dNow = Date.parse("2026-08-18T17:03:00+07:00");
        const recapD = this.rowsFromTimes(ids.map(() => this.isoAt(day, "17:01")), day, "tanggal");
        const providerD = this.rowsFromTimes(ids.map(() => this.isoAt(day, "17:01")), day, "activity_date");
        const d = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 17, minute: 3 },
            expectedCabangIds: ids,
            recapRows: recapD,
            recapRowsYesterday: [],
            providerRows: providerD,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "17:02") })
        }, dNow);
        results.push({
            id: "D",
            pass: d.global.key === "live"
                && d.global.tone === "green"
                && d.operational.key === "synced"
                && d.provider.key === "synced"
                && d.recapAnalysis.processing === false
                && d.providerAnalysis.processing === false,
            global: d.global.key,
            operational: d.operational.key,
            provider: d.provider.key
        });

        /* E. New cycle starts while previous timestamps are still fresh */
        ErpFreshness.resetRuntimeAnchors();
        const eIdleNow = Date.parse("2026-08-18T16:58:00+07:00");
        const recapPrev = this.rowsFromTimes(ids.map(() => this.isoAt(day, "16:55")), day, "tanggal");
        const providerPrev = this.rowsFromTimes(ids.map(() => this.isoAt(day, "16:55")), day, "activity_date");
        const eIdle = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 16, minute: 58 },
            expectedCabangIds: ids,
            recapRows: recapPrev,
            recapRowsYesterday: [],
            providerRows: providerPrev,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "16:56") })
        }, eIdleNow);
        const eRunNow = Date.parse("2026-08-18T17:00:00+07:00");
        const recapNew = this.rowsFromTimes(
            ids.map((_, i) => this.isoAt(day, i < 1 ? "17:00" : "16:55")),
            day,
            "tanggal"
        );
        const eRun = ErpFreshness.evaluate({
            jakarta: { dateISO: day, hour: 17, minute: 0 },
            expectedCabangIds: ids,
            recapRows: recapNew,
            recapRowsYesterday: [],
            providerRows: providerPrev,
            providerRowsYesterday: [],
            syncRow: okRow({ last_sync_at: this.isoAt(day, "16:56") })
        }, eRunNow);
        results.push({
            id: "E",
            pass: eIdle.global.key === "live"
                && eIdle.operational.key === "synced"
                && eIdle.provider.key === "synced"
                && eRun.global.key === "syncing"
                && eRun.operational.key === "processing"
                && eRun.operational.lastLine === "Terakhir valid 16:56"
                && eRun.provider.key === "synced"
                && eIdle.global.key !== eRun.global.key,
            idleGlobal: eIdle.global.key,
            runGlobal: eRun.global.key,
            runOps: eRun.operational.key,
            runOpsLast: eRun.operational.lastLine,
            runProvider: eRun.provider.key
        });

        return {
            allPass: results.every((r) => r.pass),
            results
        };
    }
};
