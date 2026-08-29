/*
=========================================================
VAX ERP — Universal KPI Branch Breakdown Popup
=========================================================
- Popup menjawab: angka KPI dari cabang mana saja
- Data = DashboardEngine.rawData + summarizeRows (identik KPI)
- NETT / CUSTOMER / SERVICE → drilldown detail di dalam modal
- QRIS / CASH OUT → navigasi modul detail (preserved)
=========================================================
*/

const KpiBranchPopup = {

    FILTER_HANDOFF_KEY: "vax_kpi_drilldown",
    MODAL_URL: "../components/kpi-branch-modal.html",
    PROVIDER_DAILY_TABLE: "provider_sales_daily_source",

    _bound: false,
    _escBound: false,
    _activeMetric: null,
    _ready: false,
    _view: "branches",          // branches | detail
    _detailCabangId: null,
    _detailLoadSeq: 0,
    _lastBreakdown: null,

    /* metricKey → UI + routing meta */
    METRICS: {
        omzet: {
            title: "GROSS / EXECUTIVE",
            format: "rupiah",
            tone: "gold",
            detail: { module: "Laporan (belum tersedia)", href: null, available: false }
        },
        nett: {
            title: "NETT",
            format: "rupiah",
            tone: "gold",
            detail: { mode: "inline", available: true }
        },
        customer: {
            title: "CUSTOMER",
            format: "angka",
            tone: "blue",
            detail: { mode: "inline", available: true }
        },
        service: {
            title: "SERVICE",
            format: "angka",
            tone: "amber",
            detail: { mode: "inline", available: true }
        },
        cash: {
            title: "CASH",
            format: "rupiah",
            tone: "gold",
            detail: { module: "Cash Detail / Finance", href: null, available: false }
        },
        qris: {
            title: "QRIS",
            format: "rupiah",
            tone: "cyan",
            detail: {
                module: "QRIS Monitoring",
                href: "./setoran-3-harian.html",
                available: true,
                menu: "qris",
                focus: "qris"
            }
        },
        cashOut: {
            title: "CASH OUT",
            format: "rupiah",
            tone: "red",
            detail: {
                module: "Cash Out",
                href: "./cash-out.html",
                available: true,
                menu: "cash-out",
                focus: "cash-out"
            }
        },
        avgTicket: {
            title: "AVG TICKET",
            format: "rupiah",
            tone: "gold",
            detail: { module: "Laporan Avg Ticket", href: null, available: false }
        },
        growth: {
            title: "GROWTH",
            format: "growth",
            tone: "green",
            detail: { module: "Laporan Growth / Omzet", href: null, available: false }
        },
        grossService: {
            title: "GROSS SERVICE",
            format: "rupiah",
            tone: "orange",
            detail: { module: "Laporan Gross Service", href: null, available: false }
        },
        transaction: {
            title: "TRANSAKSI",
            format: "angka",
            tone: "cyan",
            detail: { module: "Laporan Transaksi", href: null, available: false }
        },
        product: {
            title: "PRODUK TERJUAL",
            format: "angka",
            tone: "purple",
            detail: { module: "Laporan Produk", href: null, available: false }
        }
    },

    async ensureMounted(){
        if(document.getElementById("kpiBranchModal")){
            this._ready = true;
            return true;
        }

        const host = document.getElementById("modal");
        if(!host) return false;

        try{
            const res = await fetch(this.MODAL_URL);
            if(!res.ok) throw new Error(this.MODAL_URL);
            host.insertAdjacentHTML("beforeend", await res.text());
            this._ready = true;
            return true;
        }catch(err){
            console.error("KpiBranchPopup mount failed:", err);
            return false;
        }
    },

    init(){
        if(this._bound) return;
        this._bound = true;

        document.addEventListener("click", (e) => {
            if(e.target.closest("[data-kpi-branch-close]")){
                this.close();
                return;
            }

            const backBtn = e.target.closest("#kpiBranchBack");
            if(backBtn && document.getElementById("kpiBranchModal")?.contains(backBtn)){
                e.preventDefault();
                this.backToBranches();
                return;
            }

            const branchRow = e.target.closest("[data-kpi-branch-id]");
            if(branchRow && document.getElementById("kpiBranchModal")?.contains(branchRow)){
                if(branchRow.classList.contains("is-static")) return;
                e.preventDefault();
                this.onBranchRowClick(branchRow);
                return;
            }

            // Tombol/link nyata — jangan hijack
            if(e.target.closest("button, a[href], select, input, textarea")){
                if(e.target.closest("#btnPaymentDetail")){
                    e.preventDefault();
                    this.open("cash");
                }
                return;
            }

            const target = e.target.closest("[data-kpi-metric]");
            if(!target) return;

            const metric = target.getAttribute("data-kpi-metric");
            if(!metric || !this.METRICS[metric]) return;
            e.preventDefault();
            this.open(metric);
        });

        if(!this._escBound){
            this._escBound = true;
            document.addEventListener("keydown", (e) => {
                if(e.key === "Escape" && this.isOpen()){
                    if(this._view === "detail"){
                        this.backToBranches();
                    }else{
                        this.close();
                    }
                    return;
                }
                if((e.key === "Enter" || e.key === " ") && this.isOpen()){
                    const row = e.target.closest?.("[data-kpi-branch-id]");
                    if(row && document.getElementById("kpiBranchModal")?.contains(row)
                        && !row.classList.contains("is-static")){
                        e.preventDefault();
                        this.onBranchRowClick(row);
                    }
                }
            });
        }

        document.addEventListener("erp:components-ready", () => {
            this.ensureMounted();
            this.decorateTargets();
        }, { once: true });

        // Components may already be ready
        if(document.getElementById("executive-summary")?.innerHTML){
            this.ensureMounted();
            this.decorateTargets();
        }
    },

    decorateTargets(){
        const map = [
            ["#todayRevenue", "omzet"],
            ["#execNett", "nett"],
            ["#execCustomer", "customer"],
            ["#execService", "service"],
            ["#execCash", "cash"],
            ["#execQris", "qris"],
            ["#execCashout", "cashOut"],
            ["#kpiAvgTicket", "avgTicket"],
            ["#kpiGrowth", "growth"],
            ["#kpiGross", "grossService"],
            ["#kpiTransaction", "transaction"],
            ["#kpiProduct", "product"],
            ["#cashValue", "cash"],
            ["#qrisValue", "qris"]
        ];

        map.forEach(([sel, metric]) => {
            const el = document.querySelector(sel);
            if(!el) return;

            const host = el.closest(".executive-item, .kpi-card, .payment-row") || el;
            host.setAttribute("data-kpi-metric", metric);
            host.setAttribute("role", "button");
            host.setAttribute("tabindex", "0");
            host.setAttribute("aria-label", `Lihat rincian per cabang: ${this.METRICS[metric]?.title || metric}`);
        });

        // Keyboard activate
        document.querySelectorAll("[data-kpi-metric]").forEach((el) => {
            if(el.dataset.kpiKeyBound === "1") return;
            el.dataset.kpiKeyBound = "1";
            el.addEventListener("keydown", (e) => {
                if(e.key === "Enter" || e.key === " "){
                    e.preventDefault();
                    const metric = el.getAttribute("data-kpi-metric");
                    if(metric) this.open(metric);
                }
            });
        });
    },

    isOpen(){
        const modal = document.getElementById("kpiBranchModal");
        return Boolean(modal && !modal.hidden);
    },

    isInlineDetailMetric(metricKey){
        const meta = this.METRICS[metricKey];
        return Boolean(meta?.detail?.mode === "inline" && meta?.detail?.available);
    },

    async open(metricKey){
        const meta = this.METRICS[metricKey];
        if(!meta) return;

        const ok = await this.ensureMounted();
        if(!ok) return;

        if(typeof DashboardEngine === "undefined"){
            console.error("DashboardEngine tidak tersedia");
            return;
        }

        this._activeMetric = metricKey;
        this._view = "branches";
        this._detailCabangId = null;
        await this.renderBranchList();
    },

    async renderBranchList(){
        const metricKey = this._activeMetric;
        const meta = this.METRICS[metricKey];
        if(!meta) return;

        let breakdown = DashboardEngine.buildBranchBreakdown(metricKey);

        // SERVICE drilldown: cabang total = SUM provider_sales_daily (bukan services_minutes).
        if(metricKey === "service"){
            try{
                breakdown = await this.applyServiceProviderBreakdown(breakdown);
            }catch(err){
                console.warn("SERVICE provider scope:", err);
            }
        }

        this._lastBreakdown = breakdown;

        const periodLabel = (typeof getPeriodeLabel === "function")
            ? getPeriodeLabel(DashboardEngine.lastPeriode)
            : String(DashboardEngine.lastPeriode || "");

        const modal = document.getElementById("kpiBranchModal");
        const titleEl = document.getElementById("kpiBranchTitle");
        const periodEl = document.getElementById("kpiBranchPeriod");
        const totalEl = document.getElementById("kpiBranchTotal");
        const totalLabelEl = document.getElementById("kpiBranchTotalLabel");
        const listEl = document.getElementById("kpiBranchList");
        const noteEl = document.getElementById("kpiBranchFootnote");
        const backEl = document.getElementById("kpiBranchBack");

        modal.dataset.kpiTone = meta.tone || "gold";
        modal.dataset.kpiMetric = metricKey;

        if(backEl) backEl.hidden = true;
        if(titleEl) titleEl.textContent = `${meta.title} — ${periodLabel}`;
        if(periodEl){
            const branchLabel = this.activeBranchFilterLabel();
            periodEl.textContent = `Rincian Per Cabang · ${branchLabel}`;
        }
        if(totalLabelEl) totalLabelEl.textContent = "TOTAL KPI";
        if(totalEl) totalEl.textContent = this.formatTotal(breakdown, meta);

        if(listEl){
            listEl.innerHTML = this.renderRows(breakdown, meta);
        }

        if(noteEl){
            if(breakdown.aggregateMode === "avg"){
                noteEl.hidden = false;
                noteEl.textContent = "TOTAL = Avg Ticket keseluruhan (bukan penjumlahan avg per cabang).";
            }else if(breakdown.aggregateMode === "trend"){
                noteEl.hidden = false;
                noteEl.textContent = "TOTAL = Growth omzet keseluruhan vs periode sebelumnya. Baris menampilkan omzet cabang (sumber growth).";
            }else{
                noteEl.hidden = true;
                noteEl.textContent = "";
            }
        }

        modal.hidden = false;
        document.body.classList.add("kpi-branch-modal-open");
    },

    backToBranches(){
        this._view = "branches";
        this._detailCabangId = null;
        this.renderBranchList();
    },

    close(){
        const modal = document.getElementById("kpiBranchModal");
        if(modal) modal.hidden = true;
        document.body.classList.remove("kpi-branch-modal-open");
        this._activeMetric = null;
        this._view = "branches";
        this._detailCabangId = null;
        this._lastBreakdown = null;
    },

    activeBranchFilterLabel(){
        const resolved = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
        if(!resolved) return "Semua Cabang";
        const found = (DashboardEngine.cabangList || []).find((c) => Number(c.id) === Number(resolved));
        return DashboardEngine.shortCabangName(found?.nama_cabang || DashboardEngine.lastCabangId || "Cabang");
    },

    periodLabel(){
        if(typeof getPeriodeLabel === "function"){
            return getPeriodeLabel(DashboardEngine.lastPeriode);
        }
        const start = DashboardEngine?.lastRange?.start;
        const end = DashboardEngine?.lastRange?.end;
        if(start && end) return start === end ? start : `${start} — ${end}`;
        return String(DashboardEngine?.lastPeriode || "—");
    },

    formatRupiah(n){
        return typeof formatRupiah === "function"
            ? formatRupiah(n)
            : "Rp" + Number(n || 0).toLocaleString("id-ID");
    },

    formatAngka(n){
        return typeof formatAngka === "function"
            ? formatAngka(n)
            : Number(n || 0).toLocaleString("id-ID");
    },

    formatTotal(breakdown, meta){
        if(meta.format === "growth"){
            const t = breakdown.total;
            if(!t || t.pct === null || t.pct === undefined) return "—";
            if(typeof formatGrowthValue === "function") return formatGrowthValue(t);
            if(t.pct > 0) return `+${t.pct}%`;
            if(t.pct < 0) return `${t.pct}%`;
            return "0%";
        }
        if(meta.format === "angka"){
            return this.formatAngka(breakdown.total);
        }
        return this.formatRupiah(breakdown.total);
    },

    formatBranchValue(branch, meta, breakdown){
        if(meta.format === "growth"){
            const omzet = this.formatRupiah(branch.displayValue);
            const g = branch.trend;
            let pct = "—";
            if(g && g.pct !== null && g.pct !== undefined){
                pct = g.pct > 0 ? `+${g.pct}%` : `${g.pct}%`;
            }
            return `${omzet} · ${pct}`;
        }
        if(meta.format === "angka"){
            return this.formatAngka(branch.value);
        }
        return this.formatRupiah(branch.value);
    },

    barWidth(branch, breakdown){
        const max = Number(breakdown.maxAbs || 0);
        if(max <= 0) return 0;
        const raw = breakdown.aggregateMode === "trend"
            ? Number(branch.displayValue || 0)
            : Number(branch.value || 0);
        return Math.max(4, Math.round((Math.abs(raw) / max) * 100));
    },

    escapeHtml(str){
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    renderRows(breakdown, meta){
        const branches = breakdown.branches || [];
        if(!branches.length){
            return `<div class="kpi-branch-empty">Tidak ada data cabang pada filter aktif.</div>`;
        }

        return branches.map((b) => {
            const pct = this.barWidth(b, breakdown);
            return `
                <div class="kpi-branch-row"
                     role="listitem"
                     tabindex="0"
                     data-kpi-branch-id="${this.escapeHtml(b.cabang_id)}"
                     data-kpi-branch-name="${this.escapeHtml(b.nama_pendek || b.nama_cabang)}">
                    <div class="kpi-branch-row-main">
                        <span class="kpi-branch-row-name">${this.escapeHtml(b.nama_pendek || b.nama_cabang)}</span>
                        <div class="kpi-branch-row-bar"><i style="width:${pct}%"></i></div>
                    </div>
                    <span class="kpi-branch-row-value">${this.escapeHtml(this.formatBranchValue(b, meta, breakdown))}</span>
                    <span class="kpi-branch-row-chevron" aria-hidden="true">›</span>
                </div>
            `;
        }).join("");
    },

    renderStaticRow(label, value, sub, extraClass){
        const subHtml = sub
            ? `<span class="kpi-branch-row-sub">${this.escapeHtml(sub)}</span>`
            : "";
        const cls = ["kpi-branch-row", "is-static"];
        if(extraClass) cls.push(String(extraClass));
        return `
            <div class="${cls.join(" ")}" role="listitem">
                <div class="kpi-branch-row-main">
                    <span class="kpi-branch-row-name">${this.escapeHtml(label)}</span>
                    ${subHtml}
                </div>
                <span class="kpi-branch-row-value">${this.escapeHtml(value)}</span>
            </div>
        `;
    },

    getBranchFromBreakdown(cabangId){
        const breakdown = this._lastBreakdown
            || DashboardEngine.buildBranchBreakdown(this._activeMetric);
        this._lastBreakdown = breakdown;
        return (breakdown.branches || []).find(
            (b) => Number(b.cabang_id) === Number(cabangId)
        ) || null;
    },

    getCabangRecapRows(cabangId){
        const rows = Array.isArray(DashboardEngine.rawData) ? DashboardEngine.rawData : [];
        return rows.filter((r) => Number(r.cabang_id) === Number(cabangId));
    },

    buildCustomerDailyRows(cabangId){
        const rows = this.getCabangRecapRows(cabangId);
        const byDate = new Map();
        rows.forEach((r) => {
            const d = DashboardEngine.normalizeTanggal(r.tanggal) || String(r.tanggal || "").slice(0, 10);
            if(!d) return;
            byDate.set(d, (byDate.get(d) || 0) + Number(r.customer_minutes || 0));
        });
        return [...byDate.entries()]
            .map(([tanggal, customer]) => ({ tanggal, customer: Number(customer || 0) }))
            .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    },

    async fetchProviderDailyRows(start, end, cabangId){
        if(typeof db === "undefined" || !start || !end) return [];

        const pageSize = 1000;
        const rows = [];
        let from = 0;

        for(;;){
            let q = db.from(this.PROVIDER_DAILY_TABLE).select(
                "activity_date,cabang_id,provider_name_raw,provider_name_normalized,employee_id,total_service"
            );

            q = (start === end)
                ? q.eq("activity_date", start)
                : q.gte("activity_date", start).lte("activity_date", end);

            if(cabangId != null && cabangId !== ""){
                q = q.eq("cabang_id", cabangId);
            }else{
                const opIds = (typeof DashboardEngine.getOperationalCabangIds === "function")
                    ? DashboardEngine.getOperationalCabangIds()
                    : [];
                if(Array.isArray(opIds) && opIds.length){
                    q = q.in("cabang_id", opIds);
                }
            }

            q = q
                .order("activity_date", { ascending: true })
                .order("cabang_id", { ascending: true })
                .range(from, from + pageSize - 1);

            const { data, error } = await q;
            if(error) throw error;

            const chunk = data || [];
            rows.push(...chunk);
            if(chunk.length < pageSize) break;
            from += pageSize;
        }

        return rows;
    },

    aggregateProviderServiceByBarber(rows){
        const map = new Map();
        (rows || []).forEach((r) => {
            const service = Number(r.total_service || 0);
            if(!(service > 0)) return;
            const key = (r.employee_id != null && r.employee_id !== "")
                ? `e:${Number(r.employee_id)}`
                : `p:${Number(r.cabang_id)}:${String(r.provider_name_normalized || "").trim()}`;
            const item = map.get(key) || {
                name: String(r.provider_name_raw || r.provider_name_normalized || "—").trim() || "—",
                total_service: 0
            };
            item.total_service += service;
            if(r.provider_name_raw) item.name = String(r.provider_name_raw).trim();
            map.set(key, item);
        });

        return [...map.values()]
            .filter((b) => Number(b.total_service) > 0)
            .sort((a, b) =>
                Number(b.total_service) - Number(a.total_service)
                || String(a.name).localeCompare(String(b.name), "id")
            );
    },

    async fetchProviderServiceByBarber(start, end, cabangId){
        if(cabangId == null || cabangId === "") return [];
        const rows = await this.fetchProviderDailyRows(start, end, cabangId);
        return this.aggregateProviderServiceByBarber(rows);
    },

    /**
     * SERVICE branch popup + detail total harus satu scope:
     * selected period + selected cabang → SUM(provider_sales_daily.total_service).
     * Jangan pakai services_minutes (daily_recap) di drilldown SERVICE.
     */
    async applyServiceProviderBreakdown(breakdown){
        const start = DashboardEngine.lastRange?.start;
        const end = DashboardEngine.lastRange?.end;
        const rows = await this.fetchProviderDailyRows(start, end, null);
        const byCabang = new Map();

        rows.forEach((r) => {
            const cid = Number(r.cabang_id);
            if(!Number.isFinite(cid)) return;
            byCabang.set(cid, (byCabang.get(cid) || 0) + Number(r.total_service || 0));
        });

        const branches = (breakdown.branches || []).map((b) => {
            const cid = Number(b.cabang_id);
            const value = Number(byCabang.get(cid) || 0);
            return {
                ...b,
                value,
                displayValue: value,
                serviceSource: "provider_sales_daily"
            };
        }).sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

        const total = branches.reduce((s, b) => s + Number(b.value || 0), 0);
        const maxAbs = Math.max(0, ...branches.map((b) => Math.abs(Number(b.value || 0))));

        return {
            ...breakdown,
            metricKey: "service",
            aggregateMode: "sum",
            total,
            branches,
            maxAbs,
            serviceSource: "provider_sales_daily"
        };
    },

    async openBranchDetail(cabangId){
        const metricKey = this._activeMetric;
        const meta = this.METRICS[metricKey];
        if(!meta || !this.isInlineDetailMetric(metricKey)) return;

        const branch = this.getBranchFromBreakdown(cabangId);
        if(!branch){
            this.showUnavailableNotice("Data cabang tidak ditemukan pada filter aktif");
            return;
        }

        this._view = "detail";
        this._detailCabangId = Number(cabangId);
        const seq = ++this._detailLoadSeq;

        const modal = document.getElementById("kpiBranchModal");
        const titleEl = document.getElementById("kpiBranchTitle");
        const periodEl = document.getElementById("kpiBranchPeriod");
        const totalEl = document.getElementById("kpiBranchTotal");
        const totalLabelEl = document.getElementById("kpiBranchTotalLabel");
        const listEl = document.getElementById("kpiBranchList");
        const noteEl = document.getElementById("kpiBranchFootnote");
        const backEl = document.getElementById("kpiBranchBack");

        const cabangLabel = branch.nama_pendek || branch.nama_cabang || "Cabang";
        const period = this.periodLabel();
        const summary = branch.summary || DashboardEngine.summarizeRows(this.getCabangRecapRows(cabangId));

        if(backEl) backEl.hidden = false;
        if(titleEl) titleEl.textContent = `${meta.title} — ${cabangLabel}`;
        if(periodEl) periodEl.textContent = `${period} · Detail Cabang`;
        if(noteEl){
            noteEl.hidden = true;
            noteEl.textContent = "";
        }

        if(metricKey === "nett"){
            if(totalLabelEl) totalLabelEl.textContent = "TOTAL NETT";
            if(totalEl) totalEl.textContent = this.formatRupiah(summary.nett);
            if(listEl){
                listEl.innerHTML = [
                    this.renderStaticRow("Cabang", cabangLabel),
                    this.renderStaticRow("Periode", period),
                    this.renderStaticRow("Total NETT", this.formatRupiah(summary.nett)),
                    this.renderStaticRow("Cash Minutes", this.formatRupiah(summary.cash)),
                    this.renderStaticRow("QRIS / Non Cash", this.formatRupiah(summary.qris)),
                    this.renderStaticRow("Cash Out", this.formatRupiah(summary.cashOut)),
                    this.renderStaticRow(
                        "Nett Revenue",
                        this.formatRupiah(summary.nettRevenue),
                        null,
                        "is-nett-revenue-final"
                    )
                ].join("");
            }
            return;
        }

        if(metricKey === "customer"){
            if(totalLabelEl) totalLabelEl.textContent = "TOTAL CUSTOMER";
            if(totalEl) totalEl.textContent = this.formatAngka(summary.customer);

            const start = DashboardEngine.lastRange?.start;
            const end = DashboardEngine.lastRange?.end;
            const multiDay = Boolean(start && end && start !== end);
            const daily = multiDay ? this.buildCustomerDailyRows(cabangId) : [];

            const parts = [
                this.renderStaticRow("Cabang", cabangLabel),
                this.renderStaticRow("Periode", period),
                this.renderStaticRow("Total Customer", this.formatAngka(summary.customer))
            ];

            if(multiDay){
                if(daily.length){
                    parts.push(
                        ...daily.map((d) =>
                            this.renderStaticRow(d.tanggal, this.formatAngka(d.customer), "Customer")
                        )
                    );
                }else{
                    parts.push(`<div class="kpi-branch-empty">Tidak ada breakdown tanggal pada periode ini.</div>`);
                }
            }

            if(listEl) listEl.innerHTML = parts.join("");
            return;
        }

        if(metricKey === "service"){
            // Branch-scoped total from provider_sales_daily (same as branch popup row).
            const branchServiceTotal = Number(branch.value || 0);

            if(totalLabelEl) totalLabelEl.textContent = "TOTAL SERVICE";
            if(totalEl) totalEl.textContent = this.formatAngka(branchServiceTotal);
            if(listEl){
                listEl.innerHTML = [
                    this.renderStaticRow("Cabang", cabangLabel),
                    this.renderStaticRow("Periode", period),
                    this.renderStaticRow("Total Service", this.formatAngka(branchServiceTotal)),
                    `<div class="kpi-branch-empty">Memuat barber / service…</div>`
                ].join("");
            }

            const start = DashboardEngine.lastRange?.start;
            const end = DashboardEngine.lastRange?.end;
            let barbers = [];
            let providerNote = "";

            try{
                barbers = await this.fetchProviderServiceByBarber(start, end, cabangId);
            }catch(err){
                console.warn("SERVICE provider_sales_daily read:", err);
                providerNote = "Provider Sales Daily belum terbaca untuk periode ini.";
            }

            if(seq !== this._detailLoadSeq || this._view !== "detail") return;

            const barberSum = barbers.reduce(
                (s, b) => s + Number(b.total_service || 0),
                0
            );
            // Fail-closed identity: detail total = sum barber = branch popup value.
            const totalService = barbers.length ? barberSum : branchServiceTotal;

            if(totalEl) totalEl.textContent = this.formatAngka(totalService);

            const parts = [
                this.renderStaticRow("Cabang", cabangLabel),
                this.renderStaticRow("Periode", period),
                this.renderStaticRow("Total Service", this.formatAngka(totalService))
            ];

            if(barbers.length){
                parts.push(
                    ...barbers.map((b) =>
                        this.renderStaticRow(
                            b.name,
                            `${this.formatAngka(b.total_service)} Svc`,
                            "Barber"
                        )
                    )
                );
            }else if(providerNote){
                if(noteEl){
                    noteEl.hidden = false;
                    noteEl.textContent = providerNote;
                }
            }else{
                parts.push(`<div class="kpi-branch-empty">Tidak ada data barber pada Provider Sales Daily untuk periode ini.</div>`);
            }

            if(listEl) listEl.innerHTML = parts.join("");
        }
    },

    onBranchRowClick(rowEl){
        const metricKey = this._activeMetric;
        const meta = this.METRICS[metricKey];
        if(!meta) return;

        const cabangIdRaw = rowEl.getAttribute("data-kpi-branch-id");
        const cabangId = cabangIdRaw != null && cabangIdRaw !== "" ? Number(cabangIdRaw) : null;
        const cabangName = rowEl.getAttribute("data-kpi-branch-name") || "";
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || null;
        const periode = DashboardEngine.lastPeriode || "hariini";
        const menu = meta.detail?.menu || meta.detail?.focus || metricKey;

        this.persistHandoff({
            metric: metricKey,
            menu,
            cabangId,
            cabangName,
            start,
            end,
            periode,
            focus: meta.detail?.focus || metricKey,
            source: "dashboard-kpi-branch"
        });

        // NETT / CUSTOMER / SERVICE → detail di modal yang sama
        if(this.isInlineDetailMetric(metricKey) && Number.isFinite(cabangId)){
            this.openBranchDetail(cabangId);
            return;
        }

        if(meta.detail?.available && meta.detail?.href){
            // Cash Out → cash-out.html; QRIS → setoran-3-harian.html (modul live)
            this.close();
            window.location.href = this.buildDetailUrl(meta.detail.href, {
                menu,
                cabangId,
                cabangName,
                start,
                end,
                periode,
                metric: metricKey
            });
            return;
        }

        // Modul detail belum ada — jangan fake navigate
        this.showUnavailableNotice(meta.detail?.module || "Modul detail");
    },

    buildDetailUrl(href, params){
        try{
            const url = new URL(href, window.location.href);
            Object.entries(params || {}).forEach(([k, v]) => {
                if(v === null || v === undefined || v === "") return;
                url.searchParams.set(k, String(v));
            });
            return url.pathname.split("/").pop() + url.search + url.hash;
        }catch(_e){
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => {
                if(v === null || v === undefined || v === "") return;
                q.set(k, String(v));
            });
            const qs = q.toString();
            return qs ? `${href}?${qs}` : href;
        }
    },

    showUnavailableNotice(moduleName){
        const noteEl = document.getElementById("kpiBranchFootnote");
        if(!noteEl){
            console.warn(`Detail belum tersedia: ${moduleName}`);
            return;
        }
        noteEl.hidden = false;
        noteEl.textContent =
            `Filter cabang + periode sudah disimpan. Modul detail belum tersedia: ${moduleName}.`;
    },

    persistHandoff(payload){
        try{
            localStorage.setItem(this.FILTER_HANDOFF_KEY, JSON.stringify({
                ...payload,
                savedAt: new Date().toISOString()
            }));
        }catch(_e){ /* ignore */ }
    }
};

KpiBranchPopup.init();
