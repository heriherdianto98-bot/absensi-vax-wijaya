/*
=========================================================
VAX ERP — VAX AI Insight (one-way presenter)
=========================================================
Receives the SAME insight object already painted by
paintExecutiveAiInsight. Presentation only.

Does NOT:
- observe DOM
- call renderExecutiveAiInsight
- refresh dashboard
- mutate insight
- write ERP / Engine state
=========================================================
*/

const VaxAiInsight = {

    STATUS_CLASS: ["good", "warn", "warning", "bad", "danger", "info", "neutral"],
    TONE_CLASS: ["ai-tone-positive", "ai-tone-negative", "ai-tone-neutral", "ai-tone-warning"],

    TREND_WEIGHTS: { short: 0.5, mid: 0.3, long: 0.2 },
    TREND_CLAMP: 0.5,

    root(){
        return document.getElementById("vaxAiInsight")
            || document.querySelector("#widget-section .ai-card");
    },

    escapeHtml(value){
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },

    plainText(value){
        return String(value ?? "")
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    },

    asList(value){
        if(!value) return [];
        if(Array.isArray(value)) return value;
        return [value];
    },

    itemText(item){
        if(item == null) return "";
        if(typeof item === "string") return this.plainText(item);
        return this.plainText(item.text || "");
    },

    formatRupiah(value){
        if(typeof formatRupiah === "function"){
            return formatRupiah(value);
        }
        return "Rp" + Number(value || 0).toLocaleString("id-ID");
    },

    formatSignedPct(pct){
        if(pct == null || Number.isNaN(Number(pct))) return "—";
        const n = Number(pct);
        if(n > 0) return `+${n}%`;
        if(n < 0) return `${n}%`;
        return "0%";
    },

    parseRupiahToken(token){
        if(!token) return null;
        const cleaned = String(token).replace(/Rp\s*/i, "").replace(/\./g, "").trim();
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
    },

    parsePctToken(token){
        if(token == null || token === "" || token === "—") return null;
        const n = Number(String(token).replace(/%/g, "").trim());
        return Number.isFinite(n) ? n : null;
    },

    parseOmzetPctFromLine(text){
        const m = String(text || "").match(/\(([+\-]?\d+)%\)/);
        return m ? Number(m[1]) : null;
    },

    parseOmzetFromBuktiLine(text){
        const m = String(text || "").match(/omzet\s*([+\-]?\d+|—)\s*%?/i);
        if(!m || m[1] === "—") return null;
        return Number(m[1]);
    },

    extractOmzetMetrics(insight){
        const kondisi = this.asList(insight?.detail?.kondisi);
        let currentOmzet = null;
        let previousOmzet = null;
        let activeGrowthPct = null;

        for(const line of kondisi){
            const text = this.itemText(line);
            if(!/^Omzet:/i.test(text)) continue;
            const pair = text.match(/Omzet:\s*(Rp[\d.]+)\s*vs\s*(Rp[\d.]+)/i);
            if(pair){
                currentOmzet = this.parseRupiahToken(pair[1]);
                previousOmzet = this.parseRupiahToken(pair[2]);
            }
            activeGrowthPct = this.parseOmzetPctFromLine(text);
            break;
        }

        if((currentOmzet == null || currentOmzet <= 0) && typeof DashboardEngine !== "undefined"){
            const cur = Number(DashboardEngine.summary?.omzet || 0);
            const prev = Number(DashboardEngine.previousSummary?.omzet || 0);
            if(cur > 0){
                currentOmzet = cur;
                previousOmzet = prev;
                if(activeGrowthPct == null && prev > 0){
                    activeGrowthPct = Math.round(((cur - prev) / prev) * 100);
                }
            }
        }

        return { currentOmzet, previousOmzet, activeGrowthPct };
    },

    extractPeriodTrends(insight){
        const bukti = this.asList(insight?.detail?.buktiData || insight?.detail?.temuanData);
        let shortTrend = null;
        let midTrend = null;
        let longTrend = null;

        for(const line of bukti){
            const text = this.itemText(line);
            if(/^7\s*Hari:/i.test(text)){
                shortTrend = this.parseOmzetFromBuktiLine(text);
            }else if(/14\s*Hari/i.test(text)){
                midTrend = this.parseOmzetFromBuktiLine(text);
            }else if(/^30\s*Hari:/i.test(text)){
                longTrend = this.parseOmzetFromBuktiLine(text);
            }
        }

        return { shortTrend, midTrend, longTrend };
    },

    trendDirectionLabel(pct){
        if(pct == null || Number.isNaN(pct)) return "stabil";
        if(pct > 1) return "naik";
        if(pct < -1) return "turun";
        return "stabil";
    },

    trendDirectionSymbol(dir){
        if(dir === "naik") return "▲";
        if(dir === "turun") return "▼";
        return "●";
    },

    computeConfidence(trends){
        const available = trends.filter((t) => t.pct != null);
        if(!available.length) return "Rendah";
        const signs = available.map((t) => (t.pct > 0 ? 1 : t.pct < 0 ? -1 : 0));
        const pos = signs.filter((s) => s > 0).length;
        const neg = signs.filter((s) => s < 0).length;
        if(pos === available.length || neg === available.length) return "Tinggi";
        if(pos >= 2 || neg >= 2) return "Sedang";
        return "Rendah";
    },

    computePrediction(insight){
        const { currentOmzet } = this.extractOmzetMetrics(insight);
        const { shortTrend, midTrend, longTrend } = this.extractPeriodTrends(insight);

        const slots = [
            { key: "short", pct: shortTrend, weight: this.TREND_WEIGHTS.short },
            { key: "mid", pct: midTrend, weight: this.TREND_WEIGHTS.mid },
            { key: "long", pct: longTrend, weight: this.TREND_WEIGHTS.long }
        ].filter((s) => s.pct != null);

        if(!currentOmzet || currentOmzet <= 0 || !slots.length){
            return { ok: false, reason: "Prediksi belum cukup data" };
        }

        const totalWeight = slots.reduce((sum, s) => sum + s.weight, 0);
        let weightedDecimal = 0;
        slots.forEach((s) => {
            weightedDecimal += (s.pct / 100) * (s.weight / totalWeight);
        });

        weightedDecimal = Math.max(-this.TREND_CLAMP, Math.min(this.TREND_CLAMP, weightedDecimal));

        const projectedOmzet = Math.round(currentOmzet * (1 + weightedDecimal));
        const estimatedPct = weightedDecimal * 100;
        const direction = this.trendDirectionLabel(estimatedPct);
        const confidence = this.computeConfidence(slots);

        return {
            ok: true,
            projectedOmzet,
            estimatedPct,
            direction,
            confidence,
            basis: { shortTrend, midTrend, longTrend }
        };
    },

    primaryFinding(insight){
        const fromFindings = insight?.findingsAll?.[0];
        if(fromFindings){
            return this.itemText(typeof fromFindings === "string" ? fromFindings : fromFindings.text);
        }
        const bukti = this.asList(insight?.detail?.buktiData || insight?.detail?.temuanData);
        for(const line of bukti){
            const text = this.itemText(line);
            if(text && !/^7\s*Hari:/i.test(text) && !/14\s*Hari/i.test(text) && !/^30\s*Hari:/i.test(text) && !/^Bulan/i.test(text)){
                return text;
            }
        }
        return this.plainText(insight?.cardSummaryHtml || insight?.summaryHtml || "");
    },

    paintSummaryRow(insight){
        const omzetEl = document.getElementById("vaxAiSumOmzet");
        const growthEl = document.getElementById("vaxAiSumGrowth");
        const findingEl = document.getElementById("vaxAiSumFinding");
        if(!omzetEl && !growthEl && !findingEl) return;

        const { currentOmzet, activeGrowthPct } = this.extractOmzetMetrics(insight);
        const tone = insight?.tone || "neutral";

        if(omzetEl){
            omzetEl.textContent = currentOmzet > 0
                ? this.formatRupiah(currentOmzet)
                : "Omzet —";
        }

        if(growthEl){
            let growthLabel = "Growth —";
            if(activeGrowthPct != null){
                growthLabel = this.formatSignedPct(activeGrowthPct);
            }else if(tone === "positive"){
                growthLabel = "Naik";
            }else if(tone === "negative"){
                growthLabel = "Turun";
            }else if(tone === "warning"){
                growthLabel = "Perlu cek";
            }else{
                growthLabel = "Stabil";
            }
            growthEl.textContent = growthLabel;
            growthEl.classList.remove("is-up", "is-down", "is-neutral");
            if(activeGrowthPct != null){
                growthEl.classList.add(activeGrowthPct > 0 ? "is-up" : activeGrowthPct < 0 ? "is-down" : "is-neutral");
            }else{
                growthEl.classList.add(
                    tone === "positive" ? "is-up" : tone === "negative" ? "is-down" : "is-neutral"
                );
            }
        }

        if(findingEl){
            const finding = this.primaryFinding(insight);
            findingEl.textContent = finding
                ? (finding.length > 92 ? `${finding.slice(0, 89).trim()}…` : finding)
                : "Insight aktif belum tersedia.";
            findingEl.title = finding || "";
        }
    },

    paintPrediction(insight){
        const el = document.getElementById("vaxAiPredict");
        const section = document.getElementById("vaxAiPredictSection");
        if(!el) return;

        const freshness = this.readFreshness();
        const stateClasses = ["ai-predict-state-up", "ai-predict-state-down", "ai-predict-state-neutral", "ai-predict-state-empty"];
        if(section){
            stateClasses.forEach((cls) => section.classList.remove(cls));
        }

        if(freshness.holdPrediction){
            if(section) section.classList.add("ai-predict-state-empty");
            el.innerHTML = `<p class="ai-predict-empty">Menunggu data operasional terbaru.</p>`;
            return;
        }

        const result = this.computePrediction(insight);
        if(!result.ok){
            if(section) section.classList.add("ai-predict-state-empty");
            el.innerHTML = `<p class="ai-predict-empty">${this.escapeHtml(result.reason)}</p>`;
            return;
        }

        const dir = result.direction;
        const dirCls = dir === "naik" ? "is-up" : dir === "turun" ? "is-down" : "is-neutral";
        const stateCls = dir === "naik"
            ? "ai-predict-state-up"
            : dir === "turun"
                ? "ai-predict-state-down"
                : "ai-predict-state-neutral";
        if(section) section.classList.add(stateCls);

        const symbol = this.trendDirectionSymbol(dir);
        const pctLabel = this.formatSignedPct(Math.round(result.estimatedPct * 10) / 10);
        const basis = result.basis;
        const confKey = String(result.confidence || "").toLowerCase();
        const confCls = confKey === "tinggi"
            ? "conf-tinggi"
            : confKey === "rendah"
                ? "conf-rendah"
                : "conf-sedang";
        const dirLabel = dir.charAt(0).toUpperCase() + dir.slice(1);

        el.innerHTML = `
            <div class="ai-predict-hero__body">
                <div class="ai-predict-hero__main">
                    <span class="ai-predict-label">Prediksi Periode Berikutnya</span>
                    <strong class="ai-predict-value">${this.escapeHtml(this.formatRupiah(result.projectedOmzet))}</strong>
                </div>
                <div class="ai-predict-hero__side">
                    <span class="ai-predict-trend-badge ${dirCls}">${symbol} ${this.escapeHtml(pctLabel)}</span>
                    <span class="ai-predict-dir-label ${dirCls}">${this.escapeHtml(dirLabel)}</span>
                    <span class="ai-predict-conf ${confCls}">Confidence: ${this.escapeHtml(result.confidence)}</span>
                </div>
            </div>
            <div class="ai-predict-basis-grid">
                <span class="ai-predict-basis-item">7D <strong>${this.escapeHtml(this.formatSignedPct(basis.shortTrend))}</strong></span>
                <span class="ai-predict-basis-item">14D <strong>${this.escapeHtml(this.formatSignedPct(basis.midTrend))}</strong></span>
                <span class="ai-predict-basis-item">30D <strong>${this.escapeHtml(this.formatSignedPct(basis.longTrend))}</strong></span>
            </div>
            <small class="ai-predict-disclaimer">Estimasi berbasis tren historis, bukan angka pasti.</small>
        `;
    },

    applyTone(root, insight){
        if(!root) return;
        this.TONE_CLASS.forEach((cls) => root.classList.remove(cls));
        const tone = insight?.tone || "neutral";
        if(tone === "positive") root.classList.add("ai-tone-positive");
        else if(tone === "negative") root.classList.add("ai-tone-negative");
        else if(tone === "warning") root.classList.add("ai-tone-warning");
        else root.classList.add("ai-tone-neutral");
        root.dataset.tone = tone;
    },

    fillList(id, items, emptyText){
        const el = document.getElementById(id);
        if(!el) return;
        const rows = this.asList(items)
            .map((item) => this.itemText(item))
            .filter(Boolean);
        const use = rows.length ? rows : [emptyText || "—"];
        el.innerHTML = use
            .map((text) => `<li>${this.escapeHtml(text)}</li>`)
            .join("");
    },

    statusFromInsight(insight){
        const label = this.plainText(insight?.statusLabel || "Monitoring");
        const tone = insight?.tone || "neutral";
        if(tone === "negative") return { label, cls: "bad" };
        if(tone === "positive") return { label, cls: "good" };
        if(tone === "warning") return { label, cls: "warn" };
        return { label, cls: "info" };
    },

    setStatus(status){
        const el = document.getElementById("vaxAiStatus");
        if(!el) return;
        this.STATUS_CLASS.forEach((cls) => el.classList.remove(cls));
        el.classList.add(status.cls || "info");
        el.textContent = status.label || "Monitoring";
    },

    contextFromInsight(insight){
        const kondisi = this.asList(insight?.detail?.kondisi);
        const cabangLine = kondisi.find((line) => /^Cabang:/i.test(this.itemText(line)));
        const periodLine = kondisi.find((line) => /^Periode aktif:/i.test(this.itemText(line)));
        const cabang = cabangLine
            ? this.itemText(cabangLine).replace(/^Cabang:\s*/i, "")
            : "";
        const period = periodLine
            ? this.itemText(periodLine).replace(/^Periode aktif:\s*/i, "")
            : "";
        if(cabang && period) return `${cabang} · ${period}`;
        if(period) return period;
        if(cabang) return cabang;
        return "Filter aktif";
    },

    promoLines(insight){
        const promo = insight?.promo || insight?.detail?.promo || null;
        if(!promo || typeof promo !== "object") return [];
        const lines = [];
        if(promo.status) lines.push(`Status: ${promo.status}`);
        if(promo.reason) lines.push(promo.reason);
        if(promo.recommendation) lines.push(promo.recommendation);
        if(promo.risk) lines.push(promo.risk);
        return lines;
    },

    readFreshness(){
        const ai = (typeof ErpFreshness !== "undefined" && ErpFreshness.getState?.()?.ai) || null;
        return {
            operationalValid: ai?.operationalValid === true,
            providerValid: ai?.providerValid === true,
            providerUpdating: ai?.providerUpdating === true,
            holdPrediction: ai?.holdPrediction === true,
            holdProvider: ai?.holdProvider === true,
            isFinalDaily: ai?.isFinalDaily === true,
            notes: Array.isArray(ai?.notes) ? ai.notes : []
        };
    },

    paintFreshness(){
        const el = document.getElementById("vaxAiFreshness");
        if(!el) return;
        const freshness = this.readFreshness();
        if(!freshness.notes.length){
            el.hidden = true;
            el.textContent = "";
            return;
        }
        el.hidden = false;
        el.textContent = freshness.notes.join(" · ");
        el.setAttribute(
            "data-tone",
            freshness.isFinalDaily ? "gold" : freshness.holdProvider ? "amber" : "green"
        );
    },

    paintFrom(insight){
        try{
            if(!insight || typeof insight !== "object") return;
            const root = this.root();
            if(!root) return;

            const detail = insight.detail || {};
            const ctx = document.getElementById("vaxAiContext");

            if(insight.filterKey){
                root.dataset.aiKey = String(insight.filterKey);
            }

            if(ctx) ctx.textContent = this.contextFromInsight(insight);
            this.setStatus(this.statusFromInsight(insight));
            this.applyTone(root, insight);
            this.paintFreshness();
            this.paintSummaryRow(insight);
            this.paintPrediction(insight);

            this.fillList("vaxAiKondisi", detail.kondisi, "Kondisi belum tersedia.");
            const bukti = this.asList(detail.buktiData || detail.temuanData);
            const freshness = this.readFreshness();
            if(freshness.holdProvider){
                bukti.push("Data Provider masih diperbarui — jumlah service/cukur, share barber, dan pendapatan provider belum final.");
            }
            this.fillList("vaxAiBukti", bukti, "Bukti data belum tersedia.");
            const unknown = this.asList(detail.unknown);
            if(freshness.holdProvider){
                unknown.unshift("Menunggu data provider terbaru.");
            }
            if(freshness.holdPrediction){
                unknown.unshift("Menunggu data operasional terbaru.");
            }
            this.fillList("vaxAiUnknown", unknown, "Tidak ada item pada bagian ini.");
            this.fillList(
                "vaxAiPriorities",
                this.asList(detail.ownerPriority || insight.actions).slice(0, 3),
                "Belum ada cabang dengan bukti cukup kuat untuk prioritas tindakan."
            );
            this.fillList(
                "vaxAiTindakan",
                this.asList(detail.nonDiscount).concat(this.asList(detail.monitoring)),
                "Tidak ada tindakan pada analisis ini."
            );
            this.fillList("vaxAiPromo", this.promoLines(insight), "Tidak ada catatan promo pada analisis ini.");
        }catch(_err){
            /* Contained: lower card failure must not reach ERP paint. */
        }
    }
};
