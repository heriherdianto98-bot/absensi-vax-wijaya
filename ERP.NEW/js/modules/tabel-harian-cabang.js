/*
=========================================================
VAX ERP — Tabel Harian Semua Cabang
=========================================================
PRESENTATION ONLY.

Control: Dashboard toolbar (dashboard.js)
Data: DashboardEngine.rawData
Uang cabang (Nett / Non Cash / Cash Bersih):
  SetoranMoneyEngine.calculateBranchMoney(raw) — consumer only.
  Cash Out DISPLAY saja, tidak dikurangi dari cash.
  BUKAN setoran_3_harian.setoran_cash_actual

+ Lompat tanggal (navigasi row)
+ Print/PDF = popup dokumen resmi (struktur master Arus Kas, warna tema Harian)
+ Excel (SpreadsheetML, numeric)
+ Total dari current filtered dataset
+ Panel produk: read-only SUM(product_price) dari product_sales_daily_source
+ Rincian produk: group activity_date + product_name (Terjual = SUM qty_sold; jangan COUNT row)
=========================================================
*/

const TabelHarianCabang = {

    rows: [],
    _subscribed: false,
    _uiBound: false,
    _jumpDates: [],
    _jumpSelected: null,
    _jumpViewYear: null,
    _jumpViewMonth: null, // 0-11
    _fromArusKas: false,
    _focusProdukOnce: false,
    _produkSeq: 0,

    boot(){
        if(typeof DashboardEngine === "undefined"){
            this.setUiState({
                loading: false,
                error: "DashboardEngine tidak tersedia. Muat ulang halaman.",
                empty: false,
                rowCount: 0
            });
            return;
        }
        this.applyArusKasHandoff();
        this.mountArusKasBackButton();
        this.bindUi();
        this.bindStickyOffsets();
        this.subscribeEngine();
        if(DashboardEngine.rawData?.length){
            this.renderFromEngine();
        }else if(DashboardEngine.loading){
            this.setUiState({ loading: true, error: null, empty: false, rowCount: 0 });
        }
    },

    /** UI only — ukur tinggi page-head + pin filter untuk sticky thead offset. */
    bindStickyOffsets(){
        if(this._stickyBound) return;
        this._stickyBound = true;
        const page = document.getElementById("thcPage");
        const head = document.getElementById("thcPageHead");
        const pin = document.getElementById("thcPinStack");
        if(!page || !head) return;

        const apply = () => this.syncStickyOffsetVars();

        apply();
        if(typeof ResizeObserver === "function"){
            const ro = new ResizeObserver(() => apply());
            ro.observe(head);
            if(pin) ro.observe(pin);
            this._stickyRo = ro;
        }
        window.addEventListener("resize", apply, { passive: true });
    },

    syncStickyOffsetVars(){
        const page = document.getElementById("thcPage");
        const head = document.getElementById("thcPageHead");
        const pin = document.getElementById("thcPinStack");
        if(!page || !head) return;

        const headH = Math.ceil(head.getBoundingClientRect().height || 0);
        const pinH = Math.ceil(pin?.getBoundingClientRect().height || 0);

        if(headH > 0) page.style.setProperty("--thc-page-head-h", `${headH}px`);
        if(pinH > 0) page.style.setProperty("--thc-pin-stack-h", `${pinH}px`);
    },

    /**
     * Handoff dari Arus Kas (Buka cabang):
     * set filter Cabang + Periode 30 Hari via persistence Dashboard existing.
     * Tidak mengubah behavior halaman jika dibuka dari menu Laporan biasa.
     */
    applyArusKasHandoff(){
        const q = new URLSearchParams(window.location.search || "");
        const fromUrl = q.get("from") === "arus-kas";
        let target = null;
        try{
            target = JSON.parse(localStorage.getItem("vax_tabel_harian_target_cabang") || "null");
        }catch(_e){
            target = null;
        }

        this._fromArusKas = fromUrl;
        const source = String(q.get("source") || target?.source || "").trim().toLowerCase();
        this._focusProdukOnce = fromUrl && source === "produk";
        if(fromUrl){
            try{
                sessionStorage.setItem("vax_tabel_harian_from", "arus-kas");
                localStorage.setItem("vax_tabel_harian_from", "arus-kas");
            }catch(_e){ /* ignore */ }
        }else{
            // Kunjungan normal tanpa query from=arus-kas → jangan pakai flag lama.
            try{
                sessionStorage.removeItem("vax_tabel_harian_from");
                localStorage.removeItem("vax_tabel_harian_from");
            }catch(_e){ /* ignore */ }
            return;
        }

        const periode = q.get("periode") || target?.periode || "30hari";
        const start = q.get("start") || target?.start || null;
        const end = q.get("end") || target?.end || null;
        const isCustom = periode === "customtanggal";
        const cabangFromQuery = String(q.get("cabang") || "").trim();
        const cabangName = cabangFromQuery || String(target?.toolbarCabang || target?.cabangName || "").trim();

        const branchFilter = document.getElementById("branchFilter");
        const periodFilter = document.getElementById("periodFilter");

        let matchedCabang = "Semua Cabang";
        if(branchFilter){
            const opts = [...branchFilter.options];
            const byExact = opts.find((o) => o.value === cabangName);
            const byLoose = opts.find((o) => {
                const a = String(o.value || "").toLowerCase();
                const b = String(cabangName || "").toLowerCase();
                return a && b && (a === b || a.includes(b) || b.includes(a));
            });
            // Alias Barsel ↔ Soklat, SPBU Pagaden ↔ Pagaden
            const aliasMap = {
                barsel: "Soklat",
                soklat: "Soklat",
                pagaden: "Pagaden",
                "spbu pagaden": "Pagaden",
                "ar hakim": "AR Hakim"
            };
            const alias = aliasMap[String(cabangName || "").toLowerCase()];
            const byAlias = alias ? opts.find((o) => o.value === alias) : null;
            const hit = byExact || byAlias || byLoose;
            if(hit){
                branchFilter.value = hit.value;
                matchedCabang = hit.value;
            }
        }

        if(periodFilter){
            const has = [...periodFilter.options].some((o) => o.value === periode);
            periodFilter.value = has ? periode : "30hari";
        }

        try{
            localStorage.setItem("erp.dashboard.filters", JSON.stringify({
                cabang: matchedCabang,
                periode: periodFilter?.value || "30hari",
                customStart: isCustom ? (start || null) : null,
                customEnd: isCustom ? (end || null) : null,
                customMode: isCustom ? "range" : null,
                customMonth: null,
                customYear: null,
                displayLabel: null
            }));
        }catch(_e){ /* ignore */ }
    },

    mountArusKasBackButton(){
        if(!this._fromArusKas) return;
        if(document.getElementById("thcBackArusKas")) return;

        const actions = document.querySelector(".thc-tb-actions");
        const printBtn = document.getElementById("thcPrint");
        if(!actions) return;

        const btn = document.createElement("a");
        btn.id = "thcBackArusKas";
        btn.href = "./arus-kas.html";
        btn.className = "thc-action-btn thc-action-back-arus";
        btn.textContent = "← ARUS KAS";
        btn.setAttribute("aria-label", "Kembali ke Arus Kas");

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            try{
                sessionStorage.removeItem("vax_tabel_harian_from");
                localStorage.removeItem("vax_tabel_harian_from");
                localStorage.removeItem("vax_tabel_harian_target_cabang");
            }catch(_err){ /* ignore */ }
            window.location.href = "./arus-kas.html";
        });

        if(printBtn && printBtn.parentElement === actions){
            actions.insertBefore(btn, printBtn);
        }else{
            actions.insertBefore(btn, actions.firstChild);
        }
    },

    bindUi(){
        if(this._uiBound) return;
        this._uiBound = true;

        const runJump = (value) => {
            if(this._jumpBusy) return;
            this._jumpBusy = true;
            try{
                this.jumpToDate(value);
            }finally{
                setTimeout(() => { this._jumpBusy = false; }, 80);
            }
        };

        document.addEventListener("click", (e) => {
            if(e.target.closest("#thcJumpDateBtn")){
                this.openJumpCalendar();
                return;
            }
            if(e.target.closest("[data-thc-jump-close]")){
                this.closeJumpCalendar();
                return;
            }
            if(e.target.closest("#thcJumpCalPrev")){
                this.shiftJumpCalendar(-1);
                return;
            }
            if(e.target.closest("#thcJumpCalNext")){
                this.shiftJumpCalendar(1);
                return;
            }
            const dayBtn = e.target.closest("#thcJumpCalDays [data-thc-jump-day]");
            if(dayBtn && !dayBtn.disabled && !dayBtn.classList.contains("is-disabled")){
                const iso = dayBtn.getAttribute("data-thc-jump-day");
                this._jumpSelected = iso;
                this.syncJumpTriggerLabel();
                this.closeJumpCalendar();
                runJump(iso);
                return;
            }
            if(e.target.closest("#thcPrint")){
                this.printFullPage();
                return;
            }
            if(e.target.closest("#thcPdf")){
                this.openReport("pdf");
                return;
            }
            if(e.target.closest("#thcExcel")){
                this.exportExcel();
                return;
            }
            if(e.target.closest("#thcCardCashOut")){
                this.openCashOutModule();
            }
        });

        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape") this.closeJumpCalendar();
            const cashOutCard = e.target.closest?.("#thcCardCashOut");
            if(cashOutCard && (e.key === "Enter" || e.key === " ")){
                e.preventDefault();
                this.openCashOutModule();
            }
        });

        window.addEventListener("beforeprint", () => {
            this.syncPrintIdentity();
            document.body.classList.add("thc-printing");
        });
        window.addEventListener("afterprint", () => {
            this.restorePrintChrome();
        });
    },

    subscribeEngine(){
        if(this._subscribed) return;
        this._subscribed = true;

        DashboardEngine.subscribe((event, payload) => {
            if(event === "loading"){
                this.setUiState({
                    loading: Boolean(payload),
                    error: null,
                    empty: false,
                    rowCount: this.rows.length
                });
                return;
            }
            if(event === "error"){
                this.rows = [];
                this.renderTable();
                this.renderJumpDates();
                this.renderTotals();
                this.renderProdukSection();
                this.setUiState({
                    loading: false,
                    error: payload || "Gagal memuat data DashboardEngine.",
                    empty: false,
                    rowCount: 0
                });
                return;
            }
            if(event === "loaded" || event === "calculated"){
                this.renderFromEngine();
            }
        });
    },

    renderFromEngine(){
        if(DashboardEngine.error){
            this.rows = [];
            this.renderTable();
            this.renderJumpDates();
            this.renderTotals();
            this.renderProdukSection();
            this.setUiState({
                loading: false,
                error: DashboardEngine.error,
                empty: false,
                rowCount: 0
            });
            this.focusProdukSectionIfNeeded();
            return;
        }

        this.rows = this.buildTableRows(DashboardEngine.rawData);
        this.reportIncompleteDateGroups();
        this.renderTable();
        this.renderJumpDates();
        this.renderTotals();
        this.renderProdukSection();
        this.syncStickyOffsetVars();
        this.setUiState({
            loading: false,
            error: null,
            empty: this.rows.length === 0,
            rowCount: this.rows.length
        });
        this.focusProdukSectionIfNeeded();
    },

    /**
     * Audit only — tidak fabricate row.
     * Warning UI hanya untuk mode Semua Cabang (bukan filter cabang tunggal).
     */
    reportIncompleteDateGroups(){
        const note = document.getElementById("thcIncompleteNote");
        const cabangId = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
        const branchVal = document.getElementById("branchFilter")?.value || "";
        const isSemuaCabang = cabangId == null
            && (!branchVal || branchVal === "Semua Cabang");

        if(!isSemuaCabang){
            this._incompleteGroups = [];
            if(note){
                note.hidden = true;
                note.textContent = "";
            }
            return;
        }

        const opList = DashboardEngine.getOperationalCabangList() || [];
        const expected = opList.length;
        const byDate = new Map();

        this.rows.forEach((r) => {
            if(!byDate.has(r.tanggal)) byDate.set(r.tanggal, new Set());
            byDate.get(r.tanggal).add(Number(r.cabang_id));
        });

        const incomplete = [];
        byDate.forEach((ids, tanggal) => {
            if(expected > 0 && ids.size < expected){
                const present = opList.filter((c) => ids.has(Number(c.id)));
                const missing = opList.filter((c) => !ids.has(Number(c.id)));
                incomplete.push({
                    tanggal,
                    available: present.map((c) => this.shortCabangName(c.nama_cabang)),
                    missing: missing.map((c) => this.shortCabangName(c.nama_cabang)),
                    count: ids.size
                });
            }
        });

        this._incompleteGroups = incomplete;

        if(incomplete.length){
            console.warn("[Tabel Harian] INCOMPLETE DATE GROUP", incomplete.map((g) => ({
                tanggal: g.tanggal,
                available: g.available,
                missing: g.missing
            })));
        }

        if(note){
            if(!incomplete.length){
                note.hidden = true;
                note.textContent = "";
            }else{
                const sample = incomplete.slice(0, 3).map((g) =>
                    `${this.formatTanggal(g.tanggal)}: ${g.count}/${expected} (missing: ${g.missing.join(", ") || "—"})`
                ).join(" · ");
                note.hidden = false;
                note.textContent = `INCOMPLETE DATE GROUP · ${incomplete.length} tanggal < ${expected} cabang · ${sample}`;
            }
        }
    },

    rowFromEngine(raw){
        const s = DashboardEngine.summarizeRows([raw]);
        if(typeof SetoranMoneyEngine === "undefined" || typeof SetoranMoneyEngine.calculateBranchMoney !== "function"){
            throw new Error("SetoranMoneyEngine tidak termuat — canonical money engine wajib.");
        }
        const money = SetoranMoneyEngine.calculateBranchMoney(raw);
        return {
            tanggal: DashboardEngine.normalizeTanggal(raw?.tanggal) || String(raw?.tanggal || "").slice(0, 10),
            cabang_id: Number(raw?.cabang_id),
            cabang_name: this.shortCabangName(raw?.nama_cabang || "-"),
            omzet: s.omzet,
            nett: money.netRevenueErp,
            non_cash: money.nonCash,
            cash_out: s.cashOut,
            setoran_cash_aktual: money.cashReference, // Cash Bersih = canonical cash referensi
            customer: s.customer,
            transaction: s.transaction,
            services: s.service,
            produk: Number(s.product || 0)
        };
    },

    buildTableRows(rawRows){
        const unique = new Map();
        (rawRows || []).forEach((r) => {
            const cabangId = Number(r.cabang_id);
            const tanggal = DashboardEngine.normalizeTanggal(r.tanggal)
                || String(r.tanggal || "").slice(0, 10);
            if(!tanggal || !Number.isFinite(cabangId)) return;
            const key = `${tanggal}|${cabangId}`;
            if(!unique.has(key)) unique.set(key, r);
        });

        const opOrder = new Map(
            DashboardEngine.getOperationalCabangList().map((c, i) => [Number(c.id), i])
        );

        const built = [...unique.values()].map((r) => this.rowFromEngine(r));
        built.sort((a, b) => {
            if(a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
            const oa = opOrder.has(a.cabang_id) ? opOrder.get(a.cabang_id) : 999;
            const ob = opOrder.has(b.cabang_id) ? opOrder.get(b.cabang_id) : 999;
            if(oa !== ob) return oa - ob;
            return a.cabang_id - b.cabang_id;
        });
        return built;
    },

    computeTotals(rows){
        const list = Array.isArray(rows) ? rows : [];
        const sum = (k) => list.reduce((t, r) => t + Number(r[k] || 0), 0);
        return {
            omzet: sum("omzet"),
            nett: sum("nett"),
            non_cash: sum("non_cash"),
            cash_out: sum("cash_out"),
            setoran_cash_aktual: sum("setoran_cash_aktual"),
            customer: sum("customer"),
            transaction: sum("transaction"),
            services: sum("services"),
            produk: sum("produk")
        };
    },

    /* ---------- Format ---------- */

    shortCabangName(nama){
        return String(nama || "")
            .replace(/\bVax\s+Wijiaya\b/gi, "")
            .replace(/\bVax\s+Wijaya\b/gi, "")
            .replace(/\s+/g, " ")
            .trim() || String(nama || "-");
    },

    formatRupiah(nilai){
        const n = Number(nilai);
        if(!Number.isFinite(n)) return "—";
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(n);
    },

    formatTanggal(iso){
        const s = String(iso || "").slice(0, 10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
        const [y, m, d] = s.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        return new Intl.DateTimeFormat("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC"
        }).format(dt);
    },

    formatTanggalLong(iso){
        const s = String(iso || "").slice(0, 10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
        const [y, m, d] = s.split("-").map(Number);
        const months = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
    },

    formatInt(n){
        const v = Number(n);
        if(!Number.isFinite(v)) return "—";
        return new Intl.NumberFormat("id-ID").format(v);
    },

    /** Tanggal Cetak dinamis — Asia/Jakarta */
    formatCetakStamp(dateObj = new Date()){
        const d = dateObj instanceof Date ? dateObj : new Date();
        const datePart = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(d);
        const timePart = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(d);
        return `${datePart} • ${timePart} WIB`;
    },

    escapeHtml(str){
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    escapeXml(str){
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    periodeRangeLabel(){
        const start = DashboardEngine.lastRange?.start;
        const end = DashboardEngine.lastRange?.end;
        if(start && end){
            if(start === end) return this.formatTanggalLong(start);
            return `${this.formatTanggalLong(start)} – ${this.formatTanggalLong(end)}`;
        }
        if(typeof getPeriodeLabel === "function"){
            return getPeriodeLabel(DashboardEngine.lastPeriode);
        }
        return this.periodeLabelFallback();
    },

    periodeLabelFallback(){
        const key = DashboardEngine.normalizePeriode(DashboardEngine.lastPeriode);
        const map = {
            hariini: "Hari Ini",
            kemarin: "Kemarin",
            "7hari": "7 Hari",
            "30hari": "30 Hari",
            bulanini: "Bulan Ini",
            tahunini: "Tahun Ini",
            customtanggal: "Custom Tanggal"
        };
        return map[key] || key;
    },

    cabangLabel(){
        const cabangId = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
        if(cabangId == null) return "Semua Cabang";
        const cab = DashboardEngine.cabangList.find((c) => Number(c.id) === Number(cabangId));
        return cab ? this.shortCabangName(cab.nama_cabang) : `Cabang #${cabangId}`;
    },

    fileSlug(text){
        return String(text || "data")
            .normalize("NFKD")
            .replace(/[^\w\s-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-") || "data";
    },

    buildFilename(ext){
        const cabang = this.fileSlug(this.cabangLabel());
        const start = DashboardEngine.lastRange?.start || "";
        const end = DashboardEngine.lastRange?.end || start;
        let periodePart = "Periode";
        if(start && end){
            if(
                typeof DashboardEngine.isFullCalendarMonth === "function"
                && DashboardEngine.isFullCalendarMonth(start, end)
            ){
                const months = [
                    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
                ];
                const m = Number(String(start).slice(5, 7));
                const y = String(start).slice(0, 4);
                periodePart = `${months[m - 1] || m}-${y}`;
            }else if(start === end){
                periodePart = start;
            }else{
                periodePart = `${start}_sd_${end}`;
            }
        }
        return `Tabel-Harian-${cabang}-${this.fileSlug(periodePart)}.${ext}`;
    },

    /* ---------- UI render ---------- */

    setUiState({ loading, error, empty, rowCount }){
        const loadingEl = document.getElementById("thcLoading");
        const emptyEl = document.getElementById("thcEmpty");
        const errorEl = document.getElementById("thcError");
        const table = document.getElementById("thcTable");
        const meta = document.getElementById("thcMeta");
        const totals = document.getElementById("thcTotals");

        if(loadingEl) loadingEl.hidden = !loading;
        if(errorEl){
            errorEl.hidden = !error;
            if(error) errorEl.textContent = error;
        }
        if(emptyEl) emptyEl.hidden = loading || !!error || !empty;
        if(table) table.hidden = loading || !!error || empty;
        if(totals) totals.hidden = loading || !!error || empty || !(rowCount > 0);

        if(meta && !loading && !error){
            meta.textContent = `${rowCount || 0} baris`;
        }
    },

    renderJumpDates(){
        const btn = document.getElementById("thcJumpDateBtn");
        const wrap = document.getElementById("thcJumpWrap");
        const feedback = document.getElementById("thcJumpFeedback");
        if(feedback){
            feedback.hidden = true;
            feedback.textContent = "";
        }

        const dates = [...new Set(
            this.rows
                .map((r) => String(r.tanggal || "").slice(0, 10))
                .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        )].sort();
        this._jumpDates = dates;

        if(wrap) wrap.hidden = false;

        if(!dates.length){
            this._jumpSelected = null;
            if(btn) btn.disabled = true;
            this.syncJumpTriggerLabel();
            this.closeJumpCalendar();
            return;
        }

        if(btn) btn.disabled = false;

        // Seed ke tanggal dataset (bukan ubah periode)
        if(!this._jumpSelected || !dates.includes(this._jumpSelected)){
            this._jumpSelected = dates[dates.length - 1];
        }
        const seed = this._jumpSelected;
        this._jumpViewYear = Number(seed.slice(0, 4));
        this._jumpViewMonth = Number(seed.slice(5, 7)) - 1;

        this.syncJumpTriggerLabel();
        if(this.isJumpCalendarOpen()) this.renderJumpCalendar();
    },

    syncJumpTriggerLabel(){
        const label = document.getElementById("thcJumpDateLabel");
        if(!label) return;
        if(this._jumpSelected){
            label.textContent = this.formatTanggal(this._jumpSelected);
        }else if(this._jumpDates.length === 1){
            label.textContent = this.formatTanggal(this._jumpDates[0]);
        }else{
            label.textContent = "Pilih tanggal";
        }
    },

    isJumpCalendarOpen(){
        const modal = document.getElementById("thcJumpCalModal");
        return Boolean(modal && !modal.hidden);
    },

    openJumpCalendar(){
        const btn = document.getElementById("thcJumpDateBtn");
        const modal = document.getElementById("thcJumpCalModal");
        if(!modal || !btn || btn.disabled || !this._jumpDates.length) return;

        const seed = this._jumpSelected || this._jumpDates[this._jumpDates.length - 1];
        this._jumpViewYear = Number(seed.slice(0, 4));
        this._jumpViewMonth = Number(seed.slice(5, 7)) - 1;

        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        btn.setAttribute("aria-expanded", "true");
        document.body.classList.add("thc-jump-cal-open");
        this.renderJumpCalendar();
    },

    closeJumpCalendar(){
        const modal = document.getElementById("thcJumpCalModal");
        const btn = document.getElementById("thcJumpDateBtn");
        if(modal){
            modal.hidden = true;
            modal.setAttribute("aria-hidden", "true");
        }
        if(btn) btn.setAttribute("aria-expanded", "false");
        document.body.classList.remove("thc-jump-cal-open");
    },

    shiftJumpCalendar(delta){
        if(this._jumpViewYear == null || this._jumpViewMonth == null) return;
        const d = new Date(Date.UTC(this._jumpViewYear, this._jumpViewMonth + delta, 1));
        this._jumpViewYear = d.getUTCFullYear();
        this._jumpViewMonth = d.getUTCMonth();
        this.renderJumpCalendar();
    },

    renderJumpCalendar(){
        const grid = document.getElementById("thcJumpCalDays");
        const label = document.getElementById("thcJumpCalMonthLabel");
        if(!grid || this._jumpViewYear == null || this._jumpViewMonth == null) return;

        const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
        if(label) label.textContent = `${monthNames[this._jumpViewMonth]} ${this._jumpViewYear}`;

        const allowed = new Set(this._jumpDates);
        const today = (typeof DashboardEngine !== "undefined" && DashboardEngine.getJakartaToday)
            ? DashboardEngine.getJakartaToday()
            : "";

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
            const inDataset = allowed.has(iso);
            if(iso === today) classes.push("is-today");
            if(this._jumpSelected && iso === this._jumpSelected) classes.push("is-selected");
            if(!inDataset) classes.push("is-disabled");
            const disabled = inDataset ? "" : " disabled";
            html += `<button type="button" class="${classes.join(" ")}" data-thc-jump-day="${iso}"${disabled}>${day}</button>`;
        }

        grid.innerHTML = html;
    },

    showJumpFeedback(msg){
        const feedback = document.getElementById("thcJumpFeedback");
        if(!feedback) return;
        if(!msg){
            feedback.hidden = true;
            feedback.textContent = "";
            return;
        }
        feedback.hidden = false;
        feedback.textContent = msg;
    },

    getNearestScroller(el){
        let node = el?.parentElement || null;
        while(node && node !== document.body && node !== document.documentElement){
            const style = getComputedStyle(node);
            const oy = style.overflowY;
            const canY = oy === "auto" || oy === "scroll" || oy === "overlay";
            if(canY && node.scrollHeight > node.clientHeight + 2){
                return node;
            }
            node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    },

    /** Simpan posisi horizontal semua scroller terkait tabel — jangan diubah oleh lompat tanggal. */
    captureHorizontalScroll(fromEl){
        const seen = new Set();
        const snaps = [];
        const push = (el) => {
            if(!el || seen.has(el)) return;
            seen.add(el);
            if(el === window){
                snaps.push({ el: window, left: window.scrollX || window.pageXOffset || 0 });
                return;
            }
            snaps.push({ el, left: el.scrollLeft || 0 });
        };

        push(window);
        push(document.scrollingElement);
        push(document.documentElement);
        push(document.body);
        push(document.getElementById("thcScroll"));
        push(document.getElementById("thcTableSection"));

        let node = fromEl?.parentElement || null;
        while(node && node !== document.documentElement){
            const style = getComputedStyle(node);
            const ox = style.overflowX;
            if(ox === "auto" || ox === "scroll" || ox === "overlay"){
                push(node);
            }
            node = node.parentElement;
        }
        return snaps;
    },

    restoreHorizontalScroll(snaps){
        if(!Array.isArray(snaps)) return;
        for(const s of snaps){
            if(!s?.el) continue;
            if(s.el === window){
                if((window.scrollX || window.pageXOffset || 0) !== s.left){
                    window.scrollTo(s.left, window.scrollY || window.pageYOffset || 0);
                }
                continue;
            }
            if(s.el.scrollLeft !== s.left){
                s.el.scrollLeft = s.left;
            }
        }
    },

    /**
     * Sisi bawah header kolom sticky (viewport Y).
     * Diukur dari DOM aktual: topbar global + toolbar sticky + thead.
     * Tidak membaca --thc-thead-top (calc() tidak bisa di-parseFloat).
     */
    measureJumpStickyBottom(){
        if(typeof this.syncStickyOffsetVars === "function"){
            this.syncStickyOffsetVars();
        }
        const header = document.getElementById("header");
        const pin = document.getElementById("thcPinStack");
        const th = document.querySelector("#thcTable thead th");

        const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
        const pinH = pin ? pin.getBoundingClientRect().height : 0;
        const theadH = th ? th.getBoundingClientRect().height : 0;

        if(th){
            const usedTop = Number.parseFloat(getComputedStyle(th).top);
            if(Number.isFinite(usedTop) && usedTop > 0){
                return usedTop + theadH;
            }
            const thRect = th.getBoundingClientRect();
            if(thRect.top <= headerBottom + pinH + 2){
                return thRect.bottom;
            }
        }
        return headerBottom + pinH + theadH;
    },

    /**
     * NAVIGASI SAJA dalam current filtered dataset.
     * Vertical-only — horizontal scroll position tidak boleh berubah.
     * Tidak ubah Periode / Cabang / reload / query.
     */
    jumpToDate(iso){
        const tanggal = String(iso || "").trim().slice(0, 10);
        if(!tanggal) return;

        if(!this._jumpDates.includes(tanggal)){
            this.showJumpFeedback("Tanggal tidak ada pada periode aktif.");
            return;
        }
        this.showJumpFeedback("");
        this._jumpSelected = tanggal;
        this.syncJumpTriggerLabel();

        let row = document.querySelector(`#thcTbody tr[data-tanggal="${tanggal}"]`);
        if(!row){
            row = [...document.querySelectorAll("#thcTbody tr[data-tanggal]")].find((tr) =>
                String(tr.getAttribute("data-tanggal") || "").slice(0, 10) === tanggal
            ) || null;
        }
        if(!row){
            this.showJumpFeedback("Tanggal tidak ada pada periode aktif.");
            return;
        }

        const xSnaps = this.captureHorizontalScroll(row);
        const offset = this.measureJumpStickyBottom();
        const scroller = this.getNearestScroller(row);
        const isPageScroller =
            scroller === document.scrollingElement
            || scroller === document.documentElement
            || scroller === document.body;

        const applyY = (behavior) => {
            const target = document.querySelector(`#thcTbody tr[data-tanggal="${tanggal}"]`) || row;
            const scrollY = isPageScroller
                ? (window.scrollY || window.pageYOffset || 0)
                : scroller.scrollTop;
            const top = Math.max(0, scrollY + target.getBoundingClientRect().top - offset);
            if(isPageScroller){
                window.scrollTo({
                    top,
                    left: window.scrollX || window.pageXOffset || 0,
                    behavior
                });
            }else{
                scroller.scrollTo({ top, left: scroller.scrollLeft, behavior });
            }
        };

        applyY("smooth");

        // Jangan pakai scrollIntoView — default-nya bisa geser horizontal.
        // Kunci scrollLeft selama smooth scroll vertikal selesai.
        const lockX = () => this.restoreHorizontalScroll(xSnaps);
        lockX();
        requestAnimationFrame(lockX);
        requestAnimationFrame(() => requestAnimationFrame(lockX));
        const lockTimer = setInterval(lockX, 50);
        setTimeout(() => {
            clearInterval(lockTimer);
            applyY("auto");
            lockX();
        }, 450);

        document.querySelectorAll("#thcTbody tr.thc-jump-flash").forEach((tr) => {
            tr.classList.remove("thc-jump-flash");
        });
        document.querySelectorAll("#thcTbody tr[data-tanggal]").forEach((tr) => {
            if(String(tr.getAttribute("data-tanggal") || "").slice(0, 10) === tanggal){
                tr.classList.add("thc-jump-flash");
            }
        });
        setTimeout(() => {
            document.querySelectorAll("#thcTbody tr.thc-jump-flash").forEach((tr) => {
                tr.classList.remove("thc-jump-flash");
            });
        }, 1400);
    },

    renderTotals(){
        const t = this.computeTotals(this.rows);
        const set = (id, text) => {
            const el = document.getElementById(id);
            if(el) el.textContent = text;
        };
        set("thcTotOmzet", this.formatRupiah(t.omzet));
        set("thcTotNett", this.formatRupiah(t.nett));
        set("thcTotNonTunai", this.formatRupiah(t.non_cash));
        set("thcTotCashOut", this.formatRupiah(t.cash_out));
        set("thcTotSetoran", this.formatRupiah(t.setoran_cash_aktual));
        set("thcTotCustomer", this.formatInt(t.customer));
        set("thcTotTransaksi", this.formatInt(t.transaction));
        set("thcTotServices", this.formatInt(t.services));
    },

    /**
     * READ-ONLY consumer: public.product_sales_daily_source
     * TOTAL = SUM(product_price). Rincian group per activity_date + product_name.
     * Filter: cabang aktif + activity_date dalam periode toolbar.
     * Tidak ada write / edit / delete.
     */
    produkFilter(){
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || start;
        const cabangId = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
        const opIds = (!cabangId && typeof DashboardEngine.getOperationalCabangIds === "function")
            ? DashboardEngine.getOperationalCabangIds()
            : null;
        return { start, end, cabangId, opIds };
    },

    async fetchProdukDailyRows(filter){
        if(typeof db === "undefined") throw new Error("Supabase client (db) tidak tersedia");
        const start = filter?.start;
        const end = filter?.end;
        if(!start || !end) return [];

        const cabangId = filter?.cabangId != null ? Number(filter.cabangId) : null;
        const opIds = Array.isArray(filter?.opIds) ? filter.opIds : null;
        if(!cabangId && (!opIds || !opIds.length)) return [];

        const pageSize = 1000;
        const rows = [];
        let from = 0;

        for(;;){
            let q = db.from("product_sales_daily_source")
                .select("activity_date,cabang_id,product_name,qty_sold,product_price");

            q = (start === end)
                ? q.eq("activity_date", start)
                : q.gte("activity_date", start).lte("activity_date", end);

            q = cabangId
                ? q.eq("cabang_id", cabangId)
                : q.in("cabang_id", opIds);

            q = q
                .order("activity_date", { ascending: false })
                .order("product_name", { ascending: true })
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

    produkQty(row){
        if(row?.qty_sold == null || row?.qty_sold === "") return null;
        const q = Number(row.qty_sold);
        return Number.isFinite(q) ? q : null;
    },

    formatProdukQty(item){
        if(!item?.qtyKnown) return "-";
        const n = Number(item.qty);
        if(!Number.isFinite(n)) return "-";
        return this.formatInt(n);
    },

    groupProdukDetail(rawRows){
        const dayMap = new Map();
        (rawRows || []).forEach((r) => {
            const tanggal = String(r.activity_date || "").slice(0, 10);
            const name = String(r.product_name || "").trim();
            if(!tanggal || !name) return;
            const price = Number(r.product_price || 0);
            const qty = this.produkQty(r);
            if(!dayMap.has(tanggal)) dayMap.set(tanggal, new Map());
            const products = dayMap.get(tanggal);
            const key = name.toLowerCase();
            const prev = products.get(key);
            if(!prev){
                products.set(key, {
                    name,
                    qty: qty == null ? 0 : qty,
                    qtyKnown: qty != null,
                    total: price
                });
            }else{
                if(qty != null){
                    prev.qty += qty;
                    prev.qtyKnown = true;
                }
                prev.total += price;
            }
        });

        return [...dayMap.entries()]
            .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
            .map(([tanggal, products]) => {
                const items = [...products.values()]
                    .filter((p) => Number(p.total || 0) !== 0 || (p.qtyKnown && Number(p.qty) !== 0))
                    .sort((a, b) => a.name.localeCompare(b.name, "id"));
                const qtyKnown = items.length > 0 && items.every((p) => p.qtyKnown);
                const total_qty_harian = items.reduce(
                    (s, p) => s + (p.qtyKnown ? Number(p.qty) || 0 : 0),
                    0
                );
                const total_nominal_harian = items.reduce(
                    (s, p) => s + Number(p.total || 0),
                    0
                );
                return {
                    tanggal,
                    items,
                    total_qty_harian,
                    qtyKnown,
                    total_nominal_harian
                };
            })
            .filter((d) => d.items.length);
    },

    formatRupiahOrZero(nilai){
        const n = Number(nilai);
        return this.formatRupiah(Number.isFinite(n) ? n : 0);
    },

    paintProdukSection(total, days){
        const valEl = document.getElementById("thcProdukTotalVal");
        const metaEl = document.getElementById("thcProdukTotalMeta");
        const list = document.getElementById("thcProdukList");
        if(valEl) valEl.textContent = this.formatRupiahOrZero(total);
        if(metaEl){
            metaEl.textContent = `${this.cabangLabel()} · ${this.periodeRangeLabel()}`;
        }
        if(!list) return;
        if(!days.length){
            list.innerHTML = `<p class="thc-produk-empty">Rp0 · belum ada penjualan produk pada periode ini.</p>`;
            return;
        }
        list.innerHTML = days.map((d) => {
            const compact = d.items.length > 1;
            const items = d.items.map((p) => {
                const qty = this.formatProdukQty(p);
                const rp = this.formatRupiahOrZero(p.total);
                const meta = compact
                    ? `Terjual ${qty} — ${rp}`
                    : `Terjual ${qty} • ${rp}`;
                return `<li class="thc-produk-item${compact ? " is-compact" : ""}">
                    <b class="thc-produk-item-name">${this.escapeHtml(p.name)}</b>
                    <span class="thc-produk-item-sep" aria-hidden="true"> — </span>
                    <span class="thc-produk-item-meta">${this.escapeHtml(meta)}</span>
                </li>`;
            }).join("");
            const dayQty = this.formatProdukQty({
                qty: d.total_qty_harian,
                qtyKnown: d.qtyKnown
            });
            const dayRp = this.formatRupiahOrZero(d.total_nominal_harian);
            return `<article class="thc-produk-day">
                <h4 class="thc-produk-day-date">${this.escapeHtml(this.formatTanggal(d.tanggal))}</h4>
                <ul class="thc-produk-items">${items}</ul>
                <footer class="thc-produk-day-total">
                    <span class="thc-produk-day-total-label">Total hari ini</span>
                    <span class="thc-produk-day-total-qty">${this.escapeHtml(dayQty)} item</span>
                    <strong class="thc-produk-day-total-val">${this.escapeHtml(dayRp)}</strong>
                </footer>
            </article>`;
        }).join("");
    },

    async renderProdukSection(){
        const seq = ++this._produkSeq;
        const valEl = document.getElementById("thcProdukTotalVal");
        const metaEl = document.getElementById("thcProdukTotalMeta");
        const list = document.getElementById("thcProdukList");
        if(valEl) valEl.textContent = "…";
        if(metaEl) metaEl.textContent = `${this.cabangLabel()} · ${this.periodeRangeLabel()}`;
        if(list){
            list.innerHTML = `<p class="thc-produk-empty">Memuat penjualan produk…</p>`;
        }

        try{
            const filter = this.produkFilter();
            const raw = await this.fetchProdukDailyRows(filter);
            if(seq !== this._produkSeq) return;
            const total = raw.reduce((t, r) => t + Number(r.product_price || 0), 0);
            this.paintProdukSection(total, this.groupProdukDetail(raw));
        }catch(err){
            if(seq !== this._produkSeq) return;
            console.warn("TabelHarianCabang.renderProdukSection:", err);
            this.paintProdukSection(0, []);
            if(metaEl){
                metaEl.textContent = `${this.cabangLabel()} · ${this.periodeRangeLabel()} · gagal memuat product sales`;
            }
        }
    },

    focusProdukSectionIfNeeded(){
        if(!this._focusProdukOnce) return;
        this._focusProdukOnce = false;
        const el = document.getElementById("thcProdukSection");
        if(!el) return;

        const run = () => {
            const page = document.getElementById("thcPage");
            const topbarH = Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue("--erp-top-header-h")
            ) || 96;
            const headH = page
                ? Number.parseFloat(getComputedStyle(page).getPropertyValue("--thc-page-head-h")) || 92
                : 92;
            const pinH = page
                ? Number.parseFloat(getComputedStyle(page).getPropertyValue("--thc-pin-stack-h")) || 120
                : 120;
            const offset = topbarH + headH + 12 + pinH + 8;
            const y = (window.scrollY || window.pageYOffset || 0)
                + el.getBoundingClientRect().top
                - offset;
            window.scrollTo({
                top: Math.max(0, y),
                left: window.scrollX || window.pageXOffset || 0,
                behavior: "smooth"
            });
            el.classList.add("is-focused");
            setTimeout(() => el.classList.remove("is-focused"), 1800);
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(run);
        });
        setTimeout(run, 180);
    },

    renderTable(){
        const tbody = document.getElementById("thcTbody");
        if(!tbody) return;

        if(!this.rows.length){
            tbody.innerHTML = "";
            return;
        }

        tbody.innerHTML = this.rows.map((r) => `
            <tr data-tanggal="${this.escapeHtml(String(r.tanggal || "").slice(0, 10))}">
                <td>${this.escapeHtml(this.formatTanggal(r.tanggal))}</td>
                <td>${this.escapeHtml(r.cabang_name)}</td>
                <td class="thc-num">${this.escapeHtml(this.formatRupiah(r.omzet))}</td>
                <td class="thc-num">${this.escapeHtml(this.formatRupiah(r.nett))}</td>
                <td class="thc-num">${this.escapeHtml(this.formatRupiah(r.non_cash))}</td>
                <td class="thc-num thc-cashout">${this.escapeHtml(this.formatRupiah(r.cash_out))}</td>
                <td class="thc-num thc-highlight">${this.escapeHtml(this.formatRupiah(r.setoran_cash_aktual))}</td>
                <td class="thc-num thc-int">${this.escapeHtml(this.formatInt(r.customer))}</td>
                <td class="thc-num thc-int">${this.escapeHtml(this.formatInt(r.transaction))}</td>
                <td class="thc-num thc-int">${this.escapeHtml(this.formatInt(r.services))}</td>
            </tr>
        `).join("");
    },

    /* ---------- Print halaman penuh — DOM existing, tanpa engine baru ---------- */

    syncPrintIdentity(){
        const clock = this.getPrintClock();
        const cabangEl = document.getElementById("thcPrintCabang");
        const periodeEl = document.getElementById("thcPrintPeriode");
        const dateEl = document.getElementById("thcPrintDate");
        const timeEl = document.getElementById("thcPrintTime");
        const footDate = document.getElementById("thcPrintFootDate");
        const footTime = document.getElementById("thcPrintFootTime");
        const identity = document.getElementById("thcPrintIdentity");
        const foot = document.getElementById("thcPrintFoot");
        if(cabangEl) cabangEl.textContent = this.properCabangName(this.cabangLabel());
        if(periodeEl) periodeEl.textContent = this.periodeRangeLabel();
        if(dateEl) dateEl.textContent = clock.dateLabel;
        if(timeEl) timeEl.textContent = clock.timeLabel;
        if(footDate) footDate.textContent = clock.dateLabel;
        if(footTime) footTime.textContent = clock.timeLabel;
        if(identity) identity.setAttribute("aria-hidden", "false");
        if(foot) foot.setAttribute("aria-hidden", "false");
    },

    getPrintClock(){
        const now = new Date();
        const dateLabel = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric"
        }).format(now);
        const timeLabel = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false
        }).format(now) + " WIB";
        return { now, dateLabel, timeLabel };
    },

    async resolvePrintLogoSrc(){
        const candidates = [];
        try{ candidates.push(new URL("../assets/brand/erp-vax-wijaya.png", window.location.href).href); }catch(_e){ /* ignore */ }
        try{ candidates.push(new URL("../assets/logo/erp-vax-wijaya.png", window.location.href).href); }catch(_e){ /* ignore */ }
        for(const url of candidates){
            try{
                const res = await fetch(url, { cache: "force-cache" });
                if(!res.ok) continue;
                const blob = await res.blob();
                if(!blob || blob.size < 200) continue;
                const dataUrl = await new Promise((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(String(fr.result || ""));
                    fr.onerror = () => reject(new Error("read fail"));
                    fr.readAsDataURL(blob);
                });
                if(dataUrl && dataUrl.indexOf("data:") === 0) return dataUrl;
                return url;
            }catch(_e){ /* try next */ }
        }
        return "";
    },

    getActivePeriodKey(){
        const raw = String(
            (typeof DashboardEngine !== "undefined" && DashboardEngine.lastPeriode)
            || document.getElementById("periodFilter")?.value
            || ""
        ).toLowerCase().replace(/\s+/g, "");
        if(raw === "custom-active" || raw === "custom" || raw === "customdate") return "customtanggal";
        return raw || "hariini";
    },

    getActiveRange(){
        const start = String(
            (typeof DashboardEngine !== "undefined" && (DashboardEngine.lastRange?.start || DashboardEngine.lastCustomStart))
            || ""
        ).slice(0, 10);
        const end = String(
            (typeof DashboardEngine !== "undefined" && (DashboardEngine.lastRange?.end || DashboardEngine.lastCustomEnd))
            || start
        ).slice(0, 10);
        return { start, end };
    },

    /**
     * Drilldown ke modul Cash Out — pakai handoff KPI existing.
     * Tidak membuat sistem filter baru. Periode custom ikut start/end aktif.
     */
    openCashOutModule(){
        const cabangName = this.properCabangName(this.cabangLabel());
        const cabangIdRaw = (typeof DashboardEngine !== "undefined")
            ? DashboardEngine.resolveCabangId(
                DashboardEngine.lastCabangId ?? document.getElementById("branchFilter")?.value
            )
            : null;
        const isAll = cabangIdRaw == null || /^semua\s+cabang$/i.test(cabangName);
        const cabangId = isAll ? "all" : cabangIdRaw;
        const periode = this.getActivePeriodKey();
        const range = this.getActiveRange();
        const payload = {
            metric: "cashOut",
            menu: "cash-out",
            focus: "cash-out",
            cabangId,
            cabangName,
            start: range.start || "",
            end: range.end || "",
            periode,
            source: "tabel-harian",
            savedAt: new Date().toISOString()
        };

        try{
            localStorage.setItem("vax_kpi_drilldown", JSON.stringify(payload));
            localStorage.setItem("vax_cashout_filter", JSON.stringify({
                cabangId,
                periode,
                start: range.start || "",
                end: range.end || "",
                cabangName,
                savedAt: payload.savedAt
            }));
        }catch(_e){ /* ignore */ }

        const url = new URL("./cash-out.html", window.location.href);
        url.searchParams.set("menu", "cash-out");
        url.searchParams.set("cabangId", String(cabangId));
        url.searchParams.set("cabangName", cabangName);
        url.searchParams.set("periode", periode);
        if(range.start) url.searchParams.set("start", range.start);
        if(range.end) url.searchParams.set("end", range.end);
        window.location.href = url.pathname.split("/").pop() + url.search;
    },

    restorePrintChrome(){
        document.body.classList.remove("thc-printing");
        const identity = document.getElementById("thcPrintIdentity");
        const foot = document.getElementById("thcPrintFoot");
        if(identity) identity.setAttribute("aria-hidden", "true");
        if(foot) foot.setAttribute("aria-hidden", "true");
        if(this._printTitlePrev != null){
            document.title = this._printTitlePrev;
            this._printTitlePrev = null;
        }
    },

    printFullPage(){
        this.openReport("print");
    },

    /* ---------- PDF popup (tabel harian) — presentation only ---------- */

    /** Title-case cabang name for PDF header (display only). */
    properCabangName(name){
        const s = String(name || "").trim();
        if(!s) return "—";
        if(/^semua\s+cabang$/i.test(s)) return "Semua Cabang";
        return s
            .toLowerCase()
            .replace(/\b([a-zà-ÿ])/g, (ch) => ch.toUpperCase())
            .replace(/\b(Spbu|SpbU)\b/g, "SPBU");
    },

    /**
     * Anomaly flags for PDF display only — does not alter values.
     * Conservative: only clear negatives / activity-without-finance / cash-out > gross.
     */
    reportRowFlags(r){
        const omzet = Number(r.omzet);
        const nett = Number(r.nett);
        const nonCash = Number(r.non_cash);
        const cashOut = Number(r.cash_out);
        const setoran = Number(r.setoran_cash_aktual);
        const trx = Number(r.transaction);

        const moneyNeg = [omzet, nett, nonCash, cashOut, setoran].some(
            (v) => Number.isFinite(v) && v < 0
        );
        const hasActivity =
            (Number.isFinite(omzet) && omzet > 0) ||
            (Number.isFinite(trx) && trx > 0);
        const financeZero =
            (!Number.isFinite(nett) || nett === 0) &&
            (!Number.isFinite(nonCash) || nonCash === 0) &&
            (!Number.isFinite(setoran) || setoran === 0);
        const perluCek = hasActivity && financeZero;
        const extreme =
            Number.isFinite(omzet) &&
            omzet > 0 &&
            Number.isFinite(cashOut) &&
            cashOut > omzet;

        return { moneyNeg, perluCek, extreme };
    },

    reportMoneyCell(value, isNeg){
        const cls = isNeg && Number(value) < 0 ? "num is-neg" : "num";
        return `<td class="${cls}">${this.escapeHtml(this.formatRupiah(value))}</td>`;
    },

    buildReportDataRow(r){
        const flags = this.reportRowFlags(r);
        const rowCls = [
            flags.moneyNeg ? "row-neg" : "",
            flags.perluCek ? "row-cek" : "",
            flags.extreme ? "row-warn" : ""
        ].filter(Boolean).join(" ");

        let tanggalCell = this.escapeHtml(this.formatTanggalLong(r.tanggal));
        if(flags.perluCek){
            tanggalCell += `<span class="badge-cek">PERLU CEK</span>`;
        }else if(flags.extreme){
            tanggalCell += `<span class="badge-warn" title="Cash Out &gt; Gross">⚠</span>`;
        }

        return `<tr class="${rowCls} is-aktif">
                <td class="col-date">${tanggalCell}</td>
                <td class="col-branch">${this.escapeHtml(r.cabang_name)}</td>
                ${this.reportMoneyCell(r.omzet, flags.moneyNeg)}
                ${this.reportMoneyCell(r.nett, flags.moneyNeg)}
                ${this.reportMoneyCell(r.non_cash, flags.moneyNeg)}
                ${this.reportMoneyCell(r.cash_out, flags.moneyNeg)}
                ${this.reportMoneyCell(r.setoran_cash_aktual, flags.moneyNeg)}
                <td class="num">${this.escapeHtml(this.formatInt(r.customer))}</td>
                <td class="num">${this.escapeHtml(this.formatInt(r.transaction))}</td>
                <td class="num">${this.escapeHtml(this.formatInt(r.services))}</td>
            </tr>`;
    },

    textOf(id){
        return String(document.getElementById(id)?.textContent || "").trim();
    },

    snapshotTbody(tbodyId, colspan, numIdx){
        const tbody = document.getElementById(tbodyId);
        const nums = new Set(numIdx || []);
        if(!tbody || !tbody.rows.length){
            return `<tr><td colspan="${colspan}" class="empty">—</td></tr>`;
        }
        return [...tbody.rows].map((tr) => {
            const cells = [...tr.cells];
            if(cells.length === 1){
                return `<tr><td colspan="${colspan}" class="empty">${this.escapeHtml(cells[0].textContent.trim())}</td></tr>`;
            }
            return `<tr class="is-aktif">${cells.map((td, i) =>
                `<td class="${nums.has(i) ? "num" : ""}">${this.escapeHtml(td.textContent.trim())}</td>`
            ).join("")}</tr>`;
        }).join("");
    },

    snapshotProdukPrintBody(){
        const list = document.getElementById("thcProdukList");
        if(!list){
            return `<tr><td colspan="4" class="empty">—</td></tr>`;
        }
        const empty = list.querySelector(".thc-produk-empty");
        if(empty){
            return `<tr><td colspan="4" class="empty">${this.escapeHtml(empty.textContent.trim())}</td></tr>`;
        }
        const rows = [];
        list.querySelectorAll(".thc-produk-day").forEach((day) => {
            const tanggal = day.querySelector(".thc-produk-day-date")?.textContent.trim() || "—";
            day.querySelectorAll(".thc-produk-item").forEach((item) => {
                const name = item.querySelector(".thc-produk-item-name")?.textContent.trim() || "—";
                const meta = item.querySelector(".thc-produk-item-meta")?.textContent.trim() || "";
                const sold = (meta.match(/Terjual\s+([^\s•—]+)/i) || [])[1] || "—";
                const nilai = (meta.match(/Rp[\d.\s]+/i) || [])[0] || meta || "—";
                rows.push(
                    `<tr class="is-aktif"><td>${this.escapeHtml(tanggal)}</td>` +
                    `<td>${this.escapeHtml(name)}</td>` +
                    `<td class="num">${this.escapeHtml(sold)}</td>` +
                    `<td class="num">${this.escapeHtml(nilai)}</td></tr>`
                );
            });
            const footQty = day.querySelector(".thc-produk-day-total-qty")?.textContent.trim() || "";
            const footVal = day.querySelector(".thc-produk-day-total-val")?.textContent.trim() || "";
            const foot = [footQty, footVal].filter(Boolean).join(" • ");
            if(foot){
                rows.push(
                    `<tr class="is-aktif"><td>${this.escapeHtml(tanggal)}</td>` +
                    `<td>TOTAL HARI INI</td><td class="num" colspan="2">${this.escapeHtml(foot)}</td></tr>`
                );
            }
        });
        if(!rows.length){
            return `<tr><td colspan="4" class="empty">—</td></tr>`;
        }
        return rows.join("");
    },

    buildHarianExtraPrintSections(isAll){
        const produkTotal = this.textOf("thcProdukTotalVal") || "Rp0";
        const produkMeta = this.textOf("thcProdukTotalMeta");
        const kpiMeta = this.textOf("thcKpiuMeta");
        const produkSummary = `<section class="summary keep">
      <div class="sum is-main"><span class="lbl">Total Penjualan Produk</span><span class="val sm">${this.escapeHtml(produkTotal)}</span></div>
    </section>`;
        const produkTable = `<table class="rpt">
      <thead><tr><th class="col-date">Tanggal</th><th>Nama Produk</th><th class="num">Terjual</th><th class="num">Nilai</th></tr></thead>
      <tbody>${this.snapshotProdukPrintBody()}</tbody>
    </table>`;
        const kpiSummary = `<section class="summary keep">
      <div class="sum"><span class="lbl">Target Bulanan</span><span class="val sm">${this.escapeHtml(this.textOf("thcKpiuTargetVal") || "Rp0")}</span></div>
      <div class="sum is-main"><span class="lbl">Realisasi</span><span class="val sm">${this.escapeHtml(this.textOf("thcKpiuRealisasiVal") || "Rp0")}</span></div>
      <div class="sum"><span class="lbl">Selisih</span><span class="val sm">${this.escapeHtml(this.textOf("thcKpiuSelisihVal") || "Rp0")}</span></div>
      <div class="sum"><span class="lbl">Progress</span><span class="val sm">${this.escapeHtml(this.textOf("thcKpiuProgressVal") || "0%")}</span></div>
    </section>`;
        const kasirTable = `<table class="rpt">
      <thead>
        <tr>
          <th>Nama Kasir</th>
          <th class="num">Trx Ultimate</th>
          <th class="num">Realisasi</th>
          <th class="num">Target Cabang</th>
          <th class="num">Progress</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${this.snapshotTbody("thcKpiuKasirTbody", 6, [1, 2, 3, 4])}</tbody>
    </table>`;

        if(!isAll){
            return `
    <section class="print-sec">
    <div class="title-wrap is-next">
      <div class="t1">PRODUCT SALES</div>
      <p class="sub">${this.escapeHtml(produkMeta || "Penjualan produk pada filter aktif.")}</p>
    </div>
    ${produkSummary}
    ${produkTable}
    </section>
    <section class="print-sec">
    <div class="title-wrap is-next">
      <div class="t1">KPI ULTIMATE</div>
      <p class="sub">${this.escapeHtml(kpiMeta || "KPI Ultimate kasir pada filter aktif.")}</p>
    </div>
    ${kpiSummary}
    ${kasirTable}
    </section>`;
        }

        return `
    <section class="print-sec">
    <div class="print-head">
    <div class="title-wrap is-next">
      <div class="t1">PRODUCT SALES</div>
      <p class="sub">${this.escapeHtml(produkMeta || "Penjualan produk pada filter aktif.")}</p>
    </div>
    ${produkSummary}
    </div>
    ${produkTable}
    </section>
    <section class="print-sec">
    <div class="print-head">
    <div class="title-wrap is-next">
      <div class="t1">KPI ULTIMATE</div>
      <p class="sub">${this.escapeHtml(kpiMeta || "KPI Ultimate kasir pada filter aktif.")}</p>
    </div>
    ${kpiSummary}
    </div>
    </section>
    <section class="print-sec">
    <div class="title-wrap is-next">
      <div class="t1">PER KASIR</div>
      <p class="sub">Realisasi kasir pada filter aktif.</p>
    </div>
    ${kasirTable}
    </section>`;
    },

    isPrintAllCabang(){
        const cabangId = (typeof DashboardEngine !== "undefined" && DashboardEngine.resolveCabangId)
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;
        if(cabangId != null) return false;
        const branchVal = String(document.getElementById("branchFilter")?.value || "").trim();
        if(branchVal && !/^semua\s+cabang$/i.test(branchVal) && branchVal.toLowerCase() !== "all"){
            return false;
        }
        return /^semua\s+cabang$/i.test(this.properCabangName(this.cabangLabel()));
    },

    getHarianPrintBaseCss(isAll){
        return isAll ? this.getHarianAllBranchesPrintCss() : this.getHarianSingleBranchPrintCss();
    },

    getHarianSingleBranchPrintCss(){
        return `
  :root{
    --ink:#1a1a1a; --muted:#6b6520; --line:#e5e0d0;
    --gold:#c9a227; --gold-line:#d4af37; --soft:#fafaf8;
    --head:#111111; --cashout:#b91c1c;
  }
  *{ box-sizing:border-box; }
  @page{ size:A4 portrait; margin:14mm 12mm 12mm 12mm; }
  html,body{
    margin:0; padding:0; background:#fff; color:var(--ink);
    font-family:Arial,"Segoe UI",Helvetica,sans-serif;
    font-size:10pt; line-height:1.4;
    height:auto; min-height:0;
  }
  body{ padding:0; }
  .sheet{ width:100%; max-width:186mm; margin:0 auto; padding-bottom:0; }
  .no-print{ margin-top:14px; }
  .no-print button{
    border:1px solid var(--gold); background:#f7f1de; color:var(--head);
    font-weight:700; padding:9px 14px; border-radius:6px; cursor:pointer;
  }
  .head{ display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .brand{ display:flex; align-items:center; gap:10px; min-width:0; }
  .brand img{ width:52px; height:52px; object-fit:contain; display:block; }
  .brand .copy h1{
    margin:0; font-size:13.5pt; font-weight:800; letter-spacing:.04em;
    color:var(--head); text-transform:uppercase;
  }
  .brand .copy .doc{ margin:2px 0 0; font-size:9.5pt; font-weight:700; color:var(--ink); letter-spacing:.08em; text-transform:uppercase; }
  .brand .copy .sys{ margin:1px 0 0; font-size:7.5pt; font-weight:600; letter-spacing:.1em; color:var(--muted); text-transform:uppercase; }
  .head-right{ text-align:right; flex:0 0 auto; }
  .head-right .mark{ font-size:8pt; font-weight:800; letter-spacing:.12em; color:var(--head); text-transform:uppercase; }
  .head-right .mark em{ display:block; margin-top:2px; font-style:normal; color:var(--gold); }
  .rule{ height:2px; margin:8px 0 10px; background:linear-gradient(90deg,var(--gold-line),#e7d7a4 55%,transparent); }
  .title-wrap{ margin:0 0 10px; }
  .title-wrap .t1{ margin:0; font-size:14pt; line-height:1.2; font-weight:800; color:var(--head); letter-spacing:.04em; }
  .title-wrap .sub{ margin:4px 0 0; font-size:8.5pt; color:var(--muted); }
  .meta{
    display:grid; grid-template-columns:1fr 1fr; gap:2px 24px;
    padding:8px 10px; margin:0 0 10px;
    border:1px solid var(--line); border-left:3px solid var(--gold-line);
    background:var(--soft);
  }
  .meta .item{ padding:3px 0; }
  .meta .lbl{ display:block; font-size:7pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
  .meta .val{ display:block; margin-top:1px; font-size:9.5pt; font-weight:700; color:var(--ink); }
  .summary{ display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin:0 0 10px; }
  .sum{
    border:1px solid var(--line); background:#fff; padding:8px 10px;
    border-top:2px solid var(--gold-line);
  }
  .sum .lbl{ display:block; font-size:7pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:3px; }
  .sum .val{ display:block; font-size:11pt; font-weight:800; color:var(--head); white-space:nowrap; }
  .sum.is-main{ background:#fcfaf3; border-color:#e2d4a8; }
  .sum.is-main .val{ color:#8a7010; }
  .sum .val.sm{ font-size:12pt; }
  .sum.is-cashout{ border-top-color:var(--cashout); }
  .sum.is-cashout .val{ color:var(--cashout); }
  table.rpt .empty{ text-align:center; color:var(--muted); padding:14px; }
  table.rpt{ width:100%; border-collapse:collapse; table-layout:auto; }
  table.rpt thead{ display:table-header-group; }
  table.rpt tfoot{ display:table-footer-group; }
  table.rpt th{
    background:var(--head); color:#f8fafc; font-size:7.5pt; font-weight:800;
    letter-spacing:.04em; text-transform:uppercase; text-align:left;
    padding:7px 5px; border:1px solid var(--head); border-bottom:2px solid var(--gold-line);
    vertical-align:middle; line-height:1.25; white-space:normal;
  }
  table.rpt td{
    padding:7px 5px; border:1px solid #e5e0d0; vertical-align:top;
    font-size:9pt; color:var(--ink);
    overflow-wrap:break-word; word-break:normal;
  }
  table.rpt th.num{ text-align:right; }
  table.rpt td.num{ text-align:right; white-space:nowrap; font-size:8.5pt; font-weight:800; font-variant-numeric:tabular-nums; color:var(--head); }
  table.rpt td.num.is-neg{ color:#8B1A1A; background:#FFF1F1; }
  table.rpt .col-date{ width:22mm; white-space:nowrap; }
  table.rpt .col-branch{ width:22mm; }
  table.rpt tbody tr.is-aktif:nth-child(even) td{ background:#fafaf8; }
  table.rpt tbody tr.row-cek td{ background:#FFFBF0; }
  table.rpt tfoot td{
    font-weight:800; background:#F7F1DE;
    border-top:2px solid var(--gold-line); border-bottom:2px solid var(--gold-line);
    font-size:8.5pt; padding:7px 5px; color:var(--ink);
  }
  .title-wrap.is-next{ margin-top:14px; break-after:avoid; page-break-after:avoid; }
  .print-sec{ break-inside:auto; page-break-inside:auto; }
  .badge-cek{
    display:inline-block; margin-left:3px; padding:0 3px;
    font-size:5.5pt; font-weight:800; letter-spacing:.04em;
    color:#7A5A00; background:#F5E6B8; border:1px solid var(--gold); vertical-align:middle; white-space:nowrap;
  }
  .badge-warn{ display:inline-block; margin-left:2px; color:#9A6B00; font-size:8px; vertical-align:middle; }
  tr, .keep{ page-break-inside:avoid; break-inside:avoid; }
  .audit-note{
    margin:8px 0 10px; padding:7px 9px;
    border:1px solid #e6ebf0; background:#fafbfc;
    font-size:7.5pt; color:var(--muted); line-height:1.45;
  }
  .sign.keep{
    margin:6px 0 0; display:grid; grid-template-columns:1fr 1fr; gap:28px;
  }
  .sign .box{ text-align:center; }
  .sign .who{ font-size:9pt; font-weight:700; color:var(--ink); }
  .sign .role{ margin-top:2px; font-size:7.5pt; font-weight:800; letter-spacing:.12em; color:var(--muted); text-transform:uppercase; }
  .sign .space{ height:42px; }
  .sign .name{ font-size:9.5pt; font-weight:800; color:var(--head); }
  .sign .line{ margin:4px auto 0; width:68%; border-top:1px solid #8e9aab; }
  .foot{
    position:fixed; left:0; right:0; bottom:0; width:100%;
    margin:0; padding:4px 12mm 0; border-top:1.5px solid var(--gold-line);
    display:grid; grid-template-columns:1.1fr 1.2fr 1fr; gap:8px; align-items:end;
    font-size:7pt; color:var(--muted); background:#fff;
  }
  .foot b{ display:block; color:var(--head); font-size:7.5pt; }
  .foot .c{ text-align:center; }
  .foot .r{ text-align:right; }
  @media print{
    .no-print{ display:none !important; }
    html,body{ height:auto !important; min-height:0 !important; padding:0 !important; }
    body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
  @media screen{
    body{ padding:16px 16px 28px; background:#f3f1ea; }
    .sheet{ background:#fff; padding:16px 16px 18px; box-shadow:0 8px 28px rgba(17,17,17,.12); }
  }`;
    },

    getHarianAllBranchesPrintCss(){
        return `
  :root{
    --ink:#1a1a1a; --muted:#6b6520; --line:#e5e0d0;
    --gold:#c9a227; --gold-line:#d4af37; --soft:#fafaf8;
    --head:#111111; --cashout:#b91c1c;
  }
  *{ box-sizing:border-box; }
  @page{ size:A4 landscape; margin:10mm 10mm 12mm 10mm; }
  html,body{
    margin:0; padding:0; background:#fff; color:var(--ink);
    font-family:Arial,"Segoe UI",Helvetica,sans-serif;
    font-size:10pt; line-height:1.4;
    height:auto; min-height:0;
    width:auto; min-width:0;
  }
  body{ padding:0; }
  .sheet{ width:100%; max-width:277mm; margin:0 auto; padding-bottom:0; }
  .no-print{ margin-top:14px; }
  .no-print button{
    border:1px solid var(--gold); background:#f7f1de; color:var(--head);
    font-weight:700; padding:9px 14px; border-radius:6px; cursor:pointer;
  }
  .head{ display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .brand{ display:flex; align-items:center; gap:10px; min-width:0; }
  .brand img{ width:52px; height:52px; object-fit:contain; display:block; }
  .brand .copy h1{
    margin:0; font-size:13.5pt; font-weight:800; letter-spacing:.04em;
    color:var(--head); text-transform:uppercase;
  }
  .brand .copy .doc{ margin:2px 0 0; font-size:9.5pt; font-weight:700; color:var(--ink); letter-spacing:.08em; text-transform:uppercase; }
  .brand .copy .sys{ margin:1px 0 0; font-size:7.5pt; font-weight:600; letter-spacing:.1em; color:var(--muted); text-transform:uppercase; }
  .head-right{ text-align:right; flex:0 0 auto; }
  .head-right .mark{ font-size:8pt; font-weight:800; letter-spacing:.12em; color:var(--head); text-transform:uppercase; }
  .head-right .mark em{ display:block; margin-top:2px; font-style:normal; color:var(--gold); }
  .rule{ height:2px; margin:8px 0 10px; background:linear-gradient(90deg,var(--gold-line),#e7d7a4 55%,transparent); }
  .title-wrap{ margin:0 0 10px; }
  .title-wrap .t1{ margin:0; font-size:14pt; line-height:1.2; font-weight:800; color:var(--head); letter-spacing:.04em; }
  .title-wrap .sub{ margin:4px 0 0; font-size:8.5pt; color:var(--muted); }
  .meta{
    display:grid; grid-template-columns:1fr 1fr; gap:2px 24px;
    padding:8px 10px; margin:0 0 10px;
    border:1px solid var(--line); border-left:3px solid var(--gold-line);
    background:var(--soft);
  }
  .meta .item{ padding:3px 0; }
  .meta .lbl{ display:block; font-size:7pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
  .meta .val{ display:block; margin-top:1px; font-size:9.5pt; font-weight:700; color:var(--ink); }
  .summary{ display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin:0 0 10px; }
  .sum{
    border:1px solid var(--line); background:#fff; padding:8px 10px;
    border-top:2px solid var(--gold-line);
  }
  .sum .lbl{ display:block; font-size:7pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:3px; }
  .sum .val{ display:block; font-size:11pt; font-weight:800; color:var(--head); white-space:nowrap; }
  .sum.is-main{ background:#fcfaf3; border-color:#e2d4a8; }
  .sum.is-main .val{ color:#8a7010; }
  .sum .val.sm{ font-size:12pt; }
  .sum.is-cashout{ border-top-color:var(--cashout); }
  .sum.is-cashout .val{ color:var(--cashout); }
  table.rpt .empty{ text-align:center; color:var(--muted); padding:14px; }
  table.rpt{ width:100%; border-collapse:collapse; table-layout:fixed; }
  table.rpt thead{ display:table-header-group; }
  table.rpt th{
    background:var(--head); color:#f8fafc; font-size:7.5pt; font-weight:800;
    letter-spacing:.05em; text-transform:uppercase; text-align:left;
    padding:7px 6px; border:1px solid var(--head); border-bottom:2px solid var(--gold-line); vertical-align:middle;
  }
  table.rpt td{
    padding:7px 6px; border:1px solid #e5e0d0; vertical-align:top;
    font-size:9pt; color:var(--ink);
    overflow-wrap:break-word; word-break:normal;
  }
  table.rpt th.num, table.rpt td.num{ text-align:right; white-space:nowrap !important; }
  table.rpt td.num{ font-size:9.5pt; font-weight:800; font-variant-numeric:tabular-nums; color:var(--head); }
  table.rpt.is-wide th{
    font-size:8pt; padding:7px 6px; white-space:nowrap; line-height:1.25;
  }
  table.rpt.is-wide td{ font-size:8.5pt; padding:6px 6px; }
  table.rpt.is-wide td.num{ font-size:8.5pt; }
  table.rpt.is-wide .col-date{ width:10%; }
  table.rpt.is-wide .col-branch{ width:11%; }
  .title-wrap.is-next{
    margin-top:14px;
    break-after:avoid; page-break-after:avoid;
  }
  .print-sec{
    break-before:auto; page-break-before:auto;
    break-inside:auto; page-break-inside:auto;
  }
  .print-head{
    break-inside:avoid; page-break-inside:avoid;
    break-after:avoid; page-break-after:avoid;
  }
  .print-close{
    margin-top:8px;
    break-before:avoid; page-break-before:avoid;
    break-inside:avoid; page-break-inside:avoid;
  }
  .print-close .audit-note{ margin:8px 0; }
  table.rpt td.num.is-neg{ color:#8B1A1A; background:#FFF1F1; }
  table.rpt .col-date{ width:12%; white-space:nowrap; }
  table.rpt .col-branch{ width:11%; }
  table.rpt tbody tr.is-aktif:nth-child(even) td{ background:#fafaf8; }
  table.rpt tbody tr.row-cek td{ background:#FFFBF0; }
  table.rpt tr.grand-total td{
    font-weight:800; background:#F7F1DE;
    border-top:2px solid var(--gold-line); border-bottom:2px solid var(--gold-line);
    font-size:8.5pt; padding:7px 6px; color:var(--ink);
  }
  .badge-cek{
    display:inline-block; margin-left:3px; padding:0 3px;
    font-size:5.5pt; font-weight:800; letter-spacing:.04em;
    color:#7A5A00; background:#F5E6B8; border:1px solid var(--gold); vertical-align:middle; white-space:nowrap;
  }
  .badge-warn{ display:inline-block; margin-left:2px; color:#9A6B00; font-size:8px; vertical-align:middle; }
  tr, .keep{ page-break-inside:avoid; break-inside:avoid; }
  .audit-note{
    margin:8px 0 10px; padding:7px 9px;
    border:1px solid #e6ebf0; background:#fafbfc;
    font-size:7.5pt; color:var(--muted); line-height:1.45;
  }
  .sign.keep{
    margin:6px 0 0; display:grid; grid-template-columns:1fr 1fr; gap:28px;
  }
  .sign .box{ text-align:center; }
  .sign .who{ font-size:9pt; font-weight:700; color:var(--ink); }
  .sign .role{ margin-top:2px; font-size:7.5pt; font-weight:800; letter-spacing:.12em; color:var(--muted); text-transform:uppercase; }
  .sign .space{ height:42px; }
  .sign .name{ font-size:9.5pt; font-weight:800; color:var(--head); }
  .sign .line{ margin:4px auto 0; width:68%; border-top:1px solid #8e9aab; }
  .foot{
    position:fixed; left:0; right:0; bottom:0; width:100%;
    margin:0; padding:4px 12mm 0; border-top:1.5px solid var(--gold-line);
    display:grid; grid-template-columns:1.1fr 1.2fr 1fr; gap:8px; align-items:end;
    font-size:7pt; color:var(--muted); background:#fff;
  }
  .foot b{ display:block; color:var(--head); font-size:7.5pt; }
  .foot .c{ text-align:center; }
  .foot .r{ text-align:right; }
  @media print{
    @page{ size:A4 landscape; margin:10mm 10mm 12mm 10mm; }
    .no-print{ display:none !important; }
    html,body{ height:auto !important; min-height:0 !important; padding:0 !important; width:auto !important; }
    body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet{ width:100%; max-width:none; }
  }
  @media screen{
    body{ padding:16px 16px 28px; background:#f3f1ea; }
    .sheet{ background:#fff; padding:16px 16px 18px; box-shadow:0 8px 28px rgba(17,17,17,.12); max-width:297mm; }
  }`;
    },

    async openReport(mode){
        if(!this.rows.length){
            alert("Tidak ada data untuk diekspor pada filter aktif.");
            return;
        }

        const clock = this.getPrintClock();
        const logoSrc = await this.resolvePrintLogoSrc();
        const cabang = this.properCabangName(this.cabangLabel());
        const isAll = this.isPrintAllCabang();
        const periode = this.periodeRangeLabel();
        const totals = this.computeTotals(this.rows);
        const titleHint = mode === "pdf" ? "PDF" : "Print";
        const mainBody = this.rows.map((r) => this.buildReportDataRow(r)).join("");
        const grandRow = `<tr class="grand-total">
          <td class="col-date">Grand Total</td>
          <td></td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.omzet))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.nett))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.non_cash))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.cash_out))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.setoran_cash_aktual))}</td>
          <td class="num">${this.escapeHtml(this.formatInt(totals.customer))}</td>
          <td class="num">${this.escapeHtml(this.formatInt(totals.transaction))}</td>
          <td class="num">${this.escapeHtml(this.formatInt(totals.services))}</td>
        </tr>`;

        const extra = this.buildHarianExtraPrintSections(isAll);
        const dailyTable = isAll
            ? `<table class="rpt is-wide">
      <colgroup>
        <col class="col-date"><col class="col-branch">
        <col><col><col><col><col><col><col><col>
      </colgroup>
      <thead>
        <tr>
          <th class="col-date">Tanggal</th>
          <th class="col-branch">Cabang</th>
          <th class="num">Omzet / Gross</th>
          <th class="num">Nett Revenue</th>
          <th class="num">Non Tunai</th>
          <th class="num">Cash Out</th>
          <th class="num">Cash Bersih</th>
          <th class="num">Customer</th>
          <th class="num">Transaksi</th>
          <th class="num">Services</th>
        </tr>
      </thead>
      <tbody>${mainBody}${grandRow}</tbody>
    </table>`
            : `<table class="rpt">
      <thead>
        <tr>
          <th class="col-date">Tanggal</th>
          <th class="col-branch">Cabang</th>
          <th class="num">Omzet / Gross</th>
          <th class="num">Nett Revenue</th>
          <th class="num">Non Tunai</th>
          <th class="num">Cash Out</th>
          <th class="num">Cash Bersih</th>
          <th class="num">Customer</th>
          <th class="num">Transaksi</th>
          <th class="num">Services</th>
        </tr>
      </thead>
      <tbody>${mainBody}</tbody>
      <tfoot>
        <tr>
          <td class="col-date">Grand Total</td>
          <td></td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.omzet))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.nett))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.non_cash))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.cash_out))}</td>
          <td class="num">${this.escapeHtml(this.formatRupiah(totals.setoran_cash_aktual))}</td>
          <td class="num">${this.escapeHtml(this.formatInt(totals.customer))}</td>
          <td class="num">${this.escapeHtml(this.formatInt(totals.transaction))}</td>
          <td class="num">${this.escapeHtml(this.formatInt(totals.services))}</td>
        </tr>
      </tfoot>
    </table>`;
        if(isAll){
            const sheetHtml = `
    <header class="head">
      <div class="brand">
        ${logoSrc ? `<img src="${logoSrc}" alt="ERP VAX WIJAYA" />` : ""}
        <div class="copy">
          <h1>ERP VAX WIJAYA</h1>
          <div class="doc">HARIAN</div>
          <div class="sys">Enterprise Management System</div>
        </div>
      </div>
      <div class="head-right">
        <div class="mark">Dokumen Operasional<em>Internal</em></div>
      </div>
    </header>
    <div class="rule"></div>
    <div class="title-wrap">
      <div class="t1">TABEL HARIAN</div>
      <p class="sub">Daily Recap · posisi sesuai filter aktif.</p>
    </div>
    <section class="meta">
      <div>
        <div class="item"><span class="lbl">Cabang</span><span class="val">${this.escapeHtml(cabang)}</span></div>
        <div class="item"><span class="lbl">Periode</span><span class="val">${this.escapeHtml(periode)}</span></div>
      </div>
      <div>
        <div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${this.escapeHtml(clock.dateLabel)}</span></div>
        <div class="item"><span class="lbl">Waktu Cetak</span><span class="val">${this.escapeHtml(clock.timeLabel)}</span></div>
      </div>
    </section>
    <section class="summary keep">
      <div class="sum"><span class="lbl">Nett Revenue</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.nett))}</span></div>
      <div class="sum"><span class="lbl">Customer</span><span class="val">${this.escapeHtml(this.formatInt(totals.customer))}</span></div>
      <div class="sum"><span class="lbl">Services</span><span class="val">${this.escapeHtml(this.formatInt(totals.services))}</span></div>
      <div class="sum is-main"><span class="lbl">Cash Bersih</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.setoran_cash_aktual))}</span></div>
      <div class="sum"><span class="lbl">Omzet / Gross</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.omzet))}</span></div>
      <div class="sum"><span class="lbl">Non Tunai</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.non_cash))}</span></div>
      <div class="sum is-cashout"><span class="lbl">Cash Out</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.cash_out))}</span></div>
      <div class="sum"><span class="lbl">Transaksi</span><span class="val">${this.escapeHtml(this.formatInt(totals.transaction))}</span></div>
    </section>
    ${dailyTable}
    ${extra}
    <div class="print-close">
    <p class="audit-note keep">Cash Out pada laporan Harian adalah total periode. Angka memakai dataset filter aktif DashboardEngine — rumus dan sumber tidak diubah.</p>
    <section class="sign keep">
      <div class="box">
        <div class="who">Disiapkan oleh,</div>
        <div class="role">System / ERP VAX</div>
        <div class="space"></div>
        <div class="name">ERP VAX Wijaya</div>
        <div class="line"></div>
      </div>
      <div class="box">
        <div class="who">Mengetahui,</div>
        <div class="role">Owner</div>
        <div class="space"></div>
        <div class="name">Heri Herdianto</div>
        <div class="line"></div>
      </div>
    </section>
    </div>`;
            this.openAllBranchesPrintDocument({
                filename: this.buildFilename("pdf").replace(/\.pdf$/i, ""),
                titleHint,
                sheetHtml,
                footDate: clock.dateLabel,
                footTime: clock.timeLabel
            });
            return;
        }

        const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Harian — ERP VAX WIJAYA</title>
<style>${this.getHarianSingleBranchPrintCss()}</style></head><body class="single-branch-print is-one">
  <footer class="foot" aria-hidden="true">
    <div><b>ERP VAX WIJAYA</b>HARIAN</div>
    <div class="c">INTERNAL / CONFIDENTIAL<br>Generated automatically</div>
    <div class="r">${this.escapeHtml(clock.dateLabel)}<br>${this.escapeHtml(clock.timeLabel)}</div>
  </footer>
  <div class="sheet">
    <header class="head">
      <div class="brand">
        ${logoSrc ? `<img src="${logoSrc}" alt="ERP VAX WIJAYA" />` : ""}
        <div class="copy">
          <h1>ERP VAX WIJAYA</h1>
          <div class="doc">HARIAN</div>
          <div class="sys">Enterprise Management System</div>
        </div>
      </div>
      <div class="head-right">
        <div class="mark">Dokumen Operasional<em>Internal</em></div>
      </div>
    </header>
    <div class="rule"></div>
    <div class="title-wrap">
      <div class="t1">TABEL HARIAN</div>
      <p class="sub">Daily Recap · posisi sesuai filter aktif.</p>
    </div>
    <section class="meta">
      <div>
        <div class="item"><span class="lbl">Cabang</span><span class="val">${this.escapeHtml(cabang)}</span></div>
        <div class="item"><span class="lbl">Periode</span><span class="val">${this.escapeHtml(periode)}</span></div>
      </div>
      <div>
        <div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${this.escapeHtml(clock.dateLabel)}</span></div>
        <div class="item"><span class="lbl">Waktu Cetak</span><span class="val">${this.escapeHtml(clock.timeLabel)}</span></div>
      </div>
    </section>
    <section class="summary keep">
      <div class="sum"><span class="lbl">Nett Revenue</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.nett))}</span></div>
      <div class="sum"><span class="lbl">Customer</span><span class="val">${this.escapeHtml(this.formatInt(totals.customer))}</span></div>
      <div class="sum"><span class="lbl">Services</span><span class="val">${this.escapeHtml(this.formatInt(totals.services))}</span></div>
      <div class="sum is-main"><span class="lbl">Cash Bersih</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.setoran_cash_aktual))}</span></div>
      <div class="sum"><span class="lbl">Omzet / Gross</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.omzet))}</span></div>
      <div class="sum"><span class="lbl">Non Tunai</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.non_cash))}</span></div>
      <div class="sum is-cashout"><span class="lbl">Cash Out</span><span class="val">${this.escapeHtml(this.formatRupiah(totals.cash_out))}</span></div>
      <div class="sum"><span class="lbl">Transaksi</span><span class="val">${this.escapeHtml(this.formatInt(totals.transaction))}</span></div>
    </section>
    ${dailyTable}
    ${extra}
    <p class="audit-note keep">Cash Out pada laporan Harian adalah total periode. Angka memakai dataset filter aktif DashboardEngine — rumus dan sumber tidak diubah.</p>
    <section class="sign keep">
      <div class="box">
        <div class="who">Disiapkan oleh,</div>
        <div class="role">System / ERP VAX</div>
        <div class="space"></div>
        <div class="name">ERP VAX Wijaya</div>
        <div class="line"></div>
      </div>
      <div class="box">
        <div class="who">Mengetahui,</div>
        <div class="role">Owner</div>
        <div class="space"></div>
        <div class="name">Heri Herdianto</div>
        <div class="line"></div>
      </div>
    </section>
  </div>
  <p class="no-print"><button type="button" onclick="window.print()">Print / PDF</button></p>
  <script>
    document.title = ${JSON.stringify(this.buildFilename(mode === "pdf" ? "pdf" : "print"))};
    window.onload=function(){ setTimeout(function(){ window.print(); }, 220); };
  <\/script>
</body></html>`;

        this.openGeneratedPrintWindow(html, titleHint);
    },

    openAllBranchesPrintDocument(payload){
        try{
            sessionStorage.setItem("vax_harian_print_all_v1", JSON.stringify(payload));
        }catch(_e){
            alert("Gagal menyiapkan dokumen print Semua Cabang.");
            return;
        }
        const url = new URL("./harian-print-all.html", window.location.href).href;
        const w = window.open(url, "_blank");
        if(!w){
            alert(`Popup diblokir — izinkan popup untuk ${payload.titleHint || "Print"}.`);
        }
    },

    openGeneratedPrintWindow(html, titleHint){
        const w = window.open("", "_blank");
        if(!w){
            alert(`Popup diblokir — izinkan popup untuk ${titleHint}.`);
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
    },

    /* ---------- Excel — full current dataset, numeric cells ---------- */

    exportExcel(){
        if(!this.rows.length){
            alert("Tidak ada data untuk diekspor pada filter aktif.");
            return;
        }

        const cetakAt = this.formatCetakStamp(new Date());
        const cabang = this.cabangLabel();
        const periode = this.periodeRangeLabel();
        const totals = this.computeTotals(this.rows);

        const cellS = (v) =>
            `<Cell><Data ss:Type="String">${this.escapeXml(v)}</Data></Cell>`;
        const cellN = (v) => {
            const n = Number(v);
            const safe = Number.isFinite(n) ? n : 0;
            return `<Cell><Data ss:Type="Number">${safe}</Data></Cell>`;
        };

        const dataRows = this.rows.map((r) =>
            `<Row>` +
            cellS(this.formatTanggalLong(r.tanggal)) +
            cellS(r.cabang_name) +
            cellN(r.omzet) +
            cellN(r.nett) +
            cellN(r.non_cash) +
            cellN(r.cash_out) +
            cellN(r.setoran_cash_aktual) +
            cellN(r.customer) +
            cellN(r.transaction) +
            cellN(r.services) +
            `</Row>`
        ).join("");

        const totalRow =
            `<Row>` +
            cellS("TOTAL") +
            cellS("") +
            cellN(totals.omzet) +
            cellN(totals.nett) +
            cellN(totals.non_cash) +
            cellN(totals.cash_out) +
            cellN(totals.setoran_cash_aktual) +
            cellN(totals.customer) +
            cellN(totals.transaction) +
            cellN(totals.services) +
            `</Row>`;

        const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
<Worksheet ss:Name="Laporan Setoran">
<Table>
<Row>${cellS("ERP VAX WIJAYA")}</Row>
<Row>${cellS("Enterprise Management System")}</Row>
<Row>${cellS("Laporan Setoran Cabang")}</Row>
<Row>${cellS("")}</Row>
<Row>${cellS("Cabang")}${cellS(cabang)}</Row>
<Row>${cellS("Periode")}${cellS(periode)}</Row>
<Row>${cellS("Tanggal Export")}${cellS(cetakAt)}</Row>
<Row>${cellS("")}</Row>
<Row>
${cellS("Tanggal")}
${cellS("Cabang")}
${cellS("Omzet / Gross")}
${cellS("Nett Revenue")}
${cellS("Non Tunai")}
${cellS("Cash Out")}
${cellS("Cash Bersih")}
${cellS("Customer")}
${cellS("Transaksi")}
${cellS("Services")}
</Row>
${dataRows}
${totalRow}
</Table>
</Worksheet>
</Workbook>`;

        // SpreadsheetML — Excel opens natively; no new dependency.
        // Extension .xls (SpreadsheetML). Owner can Save As .xlsx in Excel if needed.
        const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = this.buildFilename("xls");
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
};
