/*
=========================================================
VAX ERP — Cash Out Warning Monitor (READ ONLY)
=========================================================
Purpose:
- Scan ALL operational branches for the active dashboard date range.
- Parse individual Cash Out items from daily_recap_source.keterangan_cash_out.
- Show warning only when an individual nominal is > Rp205.000.
- Never writes data and never changes Cash Out / Dashboard engine formulas.
=========================================================
*/

const CashOutWarning = {
    TABLE_SOURCE: "daily_recap_source",
    LIMIT: 205000,
    _loadSeq: 0,
    _bound: false,
    _expanded: false,

    boot(){
        if(this._bound) return;
        this._bound = true;

        if(typeof DashboardEngine !== "undefined" && typeof DashboardEngine.subscribe === "function"){
            DashboardEngine.subscribe((event) => {
                if(event === "calculated") this.load();
            });
        }

        document.addEventListener("erp:components-ready", () => this.load(), { once:true });
        document.addEventListener("click", (event) => {
            const btn = event.target.closest?.("#cashoutWarningToggle");
            if(!btn) return;
            const rows = document.querySelectorAll("#cashout-warning-section .cashout-warning-row.is-extra");
            this._expanded = !this._expanded;
            rows.forEach((row) => row.hidden = !this._expanded);
            btn.textContent = this._expanded
                ? "Ringkas kembali"
                : `Lihat semua ${btn.dataset.total || ""} warning`.trim();
            btn.setAttribute("aria-expanded", this._expanded ? "true" : "false");
        });
    },

    parseRupiahToken(raw){
        const s = String(raw || "").replace(/[\s\u00a0\u202f\u2009]/g, "").trim();
        if(!s) return null;
        const hasDot = s.includes(".");
        const hasComma = s.includes(",");
        let normalized = s;
        if(hasDot && hasComma){
            const lastDot = s.lastIndexOf(".");
            const lastComma = s.lastIndexOf(",");
            normalized = lastComma > lastDot
                ? s.replace(/\./g, "").replace(",", ".")
                : s.replace(/,/g, "");
        }else{
            normalized = s.replace(/[.,]/g, "");
        }
        const n = Number(normalized);
        if(!Number.isFinite(n) || n < 0) return null;
        return Math.round(n);
    },

    extractKasirSuffix(text){
        const src = String(text || "");
        const m = src.match(/\s*[-–]\s*Kasir:\s*(.+)$/i);
        if(!m) return { body: src.trim(), kasir: null };
        return {
            body: src.slice(0, m.index).trim(),
            kasir: String(m[1] || "").trim() || null
        };
    },

    parseSegment(chunk){
        const raw = String(chunk || "").trim();
        if(!raw) return null;
        const { body, kasir } = this.extractKasirSuffix(raw);
        const m = body.match(/^(.*?)\s+Rp\s*([\d.,\s\u00a0\u202f\u2009]+)$/i);
        if(!m) return null;
        const keterangan = String(m[1] || "").trim();
        const nominal = this.parseRupiahToken(m[2]);
        if(!keterangan || nominal == null) return null;
        return { nominal, keterangan, kasir: kasir || null };
    },

    shortCabangName(nama){
        return String(nama || "")
            .replace(/\bVax\s+Wijiaya\b/gi, "")
            .replace(/\bVax\s+Wijaya\b/gi, "")
            .replace(/\s+/g, " ")
            .trim() || "—";
    },

    formatRupiah(value){
        return `Rp${Math.round(Number(value || 0)).toLocaleString("id-ID")}`;
    },

    formatDate(iso){
        const s = String(iso || "").slice(0, 10);
        const p = s.split("-");
        if(p.length !== 3) return s || "—";
        return `${p[2]}/${p[1]}/${p[0]}`;
    },

    escapeHtml(value){
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    getOperationalBranches(){
        const list = Array.isArray(DashboardEngine?.cabangList) ? DashboardEngine.cabangList : [];
        return list.filter((c) => {
            if(c?.aktif === false) return false;
            const n = String(c?.nama_cabang || "").toLowerCase();
            if(n.includes("floating")) return false;
            return c?.id != null;
        });
    },

    getActiveRange(){
        const range = DashboardEngine?.lastRange || {};
        const start = String(range.start || "").slice(0, 10);
        const end = String(range.end || "").slice(0, 10);
        if(start && end) return { start, end };
        const today = (typeof DashboardEngine?.getJakartaToday === "function")
            ? DashboardEngine.getJakartaToday()
            : new Date().toISOString().slice(0, 10);
        return { start: today, end: today };
    },

    async load(){
        const host = document.getElementById("cashout-warning-section");
        if(!host || typeof db === "undefined" || typeof DashboardEngine === "undefined") return;

        const seq = ++this._loadSeq;
        const branches = this.getOperationalBranches();
        if(!branches.length){
            this.render([]);
            return;
        }

        const ids = branches.map((c) => Number(c.id)).filter(Number.isFinite);
        const branchMap = new Map(branches.map((c) => [String(c.id), this.shortCabangName(c.nama_cabang)]));
        const { start, end } = this.getActiveRange();

        try{
            let q = db
                .from(this.TABLE_SOURCE)
                .select("tanggal,cabang_id,cash_out,keterangan_cash_out")
                .in("cabang_id", ids)
                .order("tanggal", { ascending:false });

            q = start === end
                ? q.eq("tanggal", start)
                : q.gte("tanggal", start).lte("tanggal", end);

            const { data, error } = await q;
            if(error) throw error;
            if(seq !== this._loadSeq) return;

            const warnings = [];
            (data || []).forEach((row) => {
                const raw = String(row.keterangan_cash_out || "").trim();
                if(!raw) return;

                raw.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean).forEach((chunk) => {
                    const item = this.parseSegment(chunk);
                    if(!item || Number(item.nominal) <= this.LIMIT) return;
                    warnings.push({
                        tanggal: String(row.tanggal || "").slice(0, 10),
                        cabang: branchMap.get(String(row.cabang_id)) || `Cabang ${row.cabang_id ?? "—"}`,
                        nominal: Number(item.nominal),
                        keterangan: item.keterangan || "—",
                        kasir: item.kasir || "Data kasir tidak tersedia"
                    });
                });
            });

            warnings.sort((a, b) => {
                if(a.tanggal !== b.tanggal) return String(b.tanggal).localeCompare(String(a.tanggal));
                return b.nominal - a.nominal;
            });
            this.render(warnings, { start, end });
        }catch(err){
            console.error("CashOutWarning.load:", err);
            if(seq === this._loadSeq) this.render([]);
        }
    },

    render(warnings, range = null){
        const host = document.getElementById("cashout-warning-section");
        if(!host) return;
        const rows = Array.isArray(warnings) ? warnings : [];
        this._expanded = false;
        if(!rows.length){
            host.hidden = true;
            host.innerHTML = "";
            return;
        }

        const rangeText = range?.start && range?.end
            ? (range.start === range.end ? this.formatDate(range.start) : `${this.formatDate(range.start)} – ${this.formatDate(range.end)}`)
            : "Periode aktif";

        host.hidden = false;
        host.innerHTML = `
            <article class="cashout-warning-card" role="status" aria-live="polite">
                <div class="cashout-warning-head">
                    <div class="cashout-warning-title-wrap">
                        <span class="cashout-warning-icon" aria-hidden="true">!</span>
                        <div>
                            <p class="cashout-warning-kicker">CONTROL CASH OUT · SEMUA CABANG</p>
                            <h3>Warning Cash Out di atas ${this.formatRupiah(this.LIMIT)}</h3>
                        </div>
                    </div>
                    <div class="cashout-warning-badge">${rows.length} WARNING</div>
                </div>
                <p class="cashout-warning-scope">Read only · ${this.escapeHtml(rangeText)} · berdasarkan nominal Cash Out individual, bukan total harian.</p>
                <div class="cashout-warning-table" role="table" aria-label="Daftar warning Cash Out">
                    <div class="cashout-warning-columns" role="row">
                        <span role="columnheader">Cabang</span>
                        <span role="columnheader">Nominal</span>
                        <span role="columnheader">Keterangan</span>
                        <span role="columnheader">Kasir / User</span>
                    </div>
                    <div class="cashout-warning-list">
                        ${rows.map((w, index) => `
                            <div class="cashout-warning-row${index >= 5 ? " is-extra" : ""}" role="row" ${index >= 5 ? "hidden" : ""}>
                                <div class="cashout-warning-cell cashout-warning-cabang" role="cell">
                                    <strong class="cashout-warning-branch">${this.escapeHtml(w.cabang)}</strong>
                                    <span class="cashout-warning-date">${this.escapeHtml(this.formatDate(w.tanggal))}</span>
                                </div>
                                <strong class="cashout-warning-cell cashout-warning-amount" role="cell">${this.formatRupiah(w.nominal)}</strong>
                                <span class="cashout-warning-cell cashout-warning-desc" role="cell">${this.escapeHtml(w.keterangan)}</span>
                                <span class="cashout-warning-cell cashout-warning-kasir" role="cell">${this.escapeHtml(w.kasir)}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
                ${rows.length > 5 ? `
                    <button type="button" id="cashoutWarningToggle" class="cashout-warning-toggle" data-total="${rows.length}" aria-expanded="false">
                        Lihat semua ${rows.length} warning
                    </button>
                ` : ""}
            </article>
        `;
    }
};

CashOutWarning.boot();
