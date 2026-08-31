/*
=========================================================
VAX ERP — Cash Out Detail Module
=========================================================
Source of truth:
- TOTAL = SUM(daily_recap_source.cash_out)  [sama KPI / popup]
- Detail = parse keterangan_cash_out Minutes (sync.js format)
Tidak ada dummy / estimasi / deskripsi buatan.
=========================================================
*/

const CashOutDetail = {

    TABLE_SOURCE: "daily_recap_source",
    TABLE_CABANG: "cabang",
    HANDOFF_KEY: "vax_kpi_drilldown",
    FILTER_KEY: "vax_cashout_filter",

    cabangList: [],
    rows: [],
    totalCashOut: 0,
    loading: false,
    _bound: false,
    expandedDates: new Set(),
    ranggaAuditRows: [],
    ranggaAuditMeta: null,

    /* UI-only date range picker state (tidak mengubah logic filter) */
    _rangeOpen: false,
    _rangeDraftStart: null,
    _rangeDraftEnd: null,
    _rangeViewYear: null,
    _rangeViewMonth: null, // 0-11

    MONTH_ID: [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ],

    PERIODE_LABEL: {
        hariini: "Hari Ini",
        kemarin: "Kemarin",
        "7hari": "7 Hari",
        "30hari": "30 Hari",
        bulanini: "Bulan Ini",
        tahunini: "Tahun Ini",
        customtanggal: "Custom Tanggal"
    },

    /* Urutan canonical ERP — sama Arus Kas / Setoran. Print Semua Cabang saja. */
    CABANG_ORDER: [
        { label: "Kalijati", aliases: ["kalijati"] },
        { label: "Palabuan", aliases: ["palabuan"] },
        { label: "Barsel", aliases: ["barsel", "soklat"] },
        { label: "Rawabadak", aliases: ["rawabadak", "rawa badak", "rawa-badak"] },
        { label: "AR Hakim", aliases: ["ar hakim", "ar-hakim", "arhkim", "hakim"] },
        { label: "SPBU Pagaden", aliases: ["spbu pagaden", "pagaden"] },
        { label: "Pamanukan", aliases: ["pamanukan", "wijiaya pamanukan", "wijaya pamanukan"] },
        { label: "Parahyangan", aliases: ["parahyangan"] },
        { label: "Cinangsi", aliases: ["cinangsi"] },
        { label: "Mekarwangi", aliases: ["mekarwangi"] }
    ],

    async boot(){
        await this.mountUi();
        this.bindEvents();
        await this.loadCabangOptions();
        this.restoreFiltersFromHandoffOrStorage();
        await this.load();
    },

    async mountUi(){
        const host = document.getElementById("cashOutRoot");
        if(!host) return;
        if(host.dataset.mounted === "1") return;
        const res = await fetch("../components/cash-out-detail.html");
        if(!res.ok) throw new Error("Gagal memuat komponen Cash Out");
        host.innerHTML = await res.text();
        host.dataset.mounted = "1";
    },

    bindEvents(){
        if(this._bound) return;
        this._bound = true;

        document.addEventListener("change", (e) => {
            if(e.target.id === "cashOutPeriode"){
                this.syncCustomVisibility();
                if(e.target.value !== "customtanggal"){
                    this.persistFilters();
                    this.load();
                }
                return;
            }
            if(e.target.id === "cashOutCabang"){
                this.persistFilters();
                this.load();
            }
        });

        document.addEventListener("click", (e) => {
            if(e.target.closest("#cashOutApply")){
                this.persistFilters();
                this.load();
                return;
            }
            if(e.target.closest("#cashOutRefresh")){
                this.load();
                return;
            }
            if(e.target.closest("#cashOutPrintPdf")){
                this.printPdf();
                return;
            }

            const sumRow = e.target.closest("[data-cashout-sum]");
            if(sumRow && sumRow.closest("#cashOutTbody")){
                this.toggleDateExpand(sumRow.getAttribute("data-cashout-sum"));
                return;
            }

            if(e.target.closest("#cashOutRangeTrigger")){
                this.toggleRangePopup();
                return;
            }
            if(e.target.closest("#cashOutRangePrev")){
                this.shiftRangeMonth(-1);
                return;
            }
            if(e.target.closest("#cashOutRangeNext")){
                this.shiftRangeMonth(1);
                return;
            }
            if(e.target.closest("#cashOutRangeClose")){
                this.closeRangePopup();
                return;
            }
            if(e.target.closest("#cashOutRangeClear")){
                this.clearRangeDraft();
                return;
            }
            const dayBtn = e.target.closest("[data-cashout-day]");
            if(dayBtn){
                this.pickRangeDay(dayBtn.getAttribute("data-cashout-day"));
                return;
            }

            /* klik di luar popup → tutup */
            if(this._rangeOpen){
                const wrap = document.getElementById("cashOutRangeWrap");
                if(wrap && !wrap.contains(e.target)){
                    this.closeRangePopup(false);
                }
            }
        });

        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && this._rangeOpen){
                this.closeRangePopup(false);
                return;
            }
            if((e.key === "Enter" || e.key === " ") && e.target.closest?.("[data-cashout-sum]")){
                const sumRow = e.target.closest("[data-cashout-sum]");
                if(sumRow && sumRow.closest("#cashOutTbody")){
                    e.preventDefault();
                    this.toggleDateExpand(sumRow.getAttribute("data-cashout-sum"));
                }
            }
        });
    },

    formatRangeDisplay(iso){
        const key = String(iso || "").slice(0, 10);
        const p = key.split("-");
        if(p.length !== 3 || !p[0]) return "—";
        return `${p[2]}/${p[1]}/${p[0]}`;
    },

    asBigintId(value){
        if(value == null) return null;
        const raw = String(value).trim();
        if(!raw) return null;
        const lower = raw.toLowerCase();
        if(lower === "null" || lower === "undefined" || lower === "nan" || lower === "all") return null;
        const n = Number(raw);
        if(!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
        return n;
    },

    syncRangeLabel(){
        const start = document.getElementById("cashOutStart")?.value || "";
        const end = document.getElementById("cashOutEnd")?.value || "";
        const label = document.getElementById("cashOutRangeLabel");
        if(!label) return;
        if(start && end){
            label.textContent = `${this.formatRangeDisplay(start)} → ${this.formatRangeDisplay(end)}`;
        }else{
            label.textContent = "Pilih rentang tanggal";
        }
    },

    syncCustomVisibility(){
        const key = this.normalizePeriode(document.getElementById("cashOutPeriode")?.value);
        const show = key === "customtanggal";
        const wrap = document.getElementById("cashOutRangeWrap");
        if(wrap) wrap.hidden = !show;
        if(!show) this.closeRangePopup(false);
        this.syncRangeLabel();
    },

    toggleRangePopup(){
        if(this._rangeOpen) this.closeRangePopup(false);
        else this.openRangePopup();
    },

    openRangePopup(){
        const popup = document.getElementById("cashOutRangePopup");
        const trigger = document.getElementById("cashOutRangeTrigger");
        if(!popup) return;

        const start = document.getElementById("cashOutStart")?.value || "";
        const end = document.getElementById("cashOutEnd")?.value || "";
        this._rangeDraftStart = start || null;
        this._rangeDraftEnd = end || null;

        const seed = start || this.getJakartaToday();
        const parts = seed.split("-").map(Number);
        this._rangeViewYear = parts[0];
        this._rangeViewMonth = (parts[1] || 1) - 1;

        this._rangeOpen = true;
        popup.hidden = false;
        if(trigger) trigger.setAttribute("aria-expanded", "true");
        this.renderRangeCalendar();
    },

    closeRangePopup(commit = true){
        const popup = document.getElementById("cashOutRangePopup");
        const trigger = document.getElementById("cashOutRangeTrigger");
        this._rangeOpen = false;
        if(popup) popup.hidden = true;
        if(trigger) trigger.setAttribute("aria-expanded", "false");
        if(commit) this.syncRangeLabel();
    },

    clearRangeDraft(){
        this._rangeDraftStart = null;
        this._rangeDraftEnd = null;
        this.renderRangeCalendar();
    },

    shiftRangeMonth(delta){
        let y = this._rangeViewYear;
        let m = this._rangeViewMonth + Number(delta || 0);
        while(m < 0){ m += 12; y -= 1; }
        while(m > 11){ m -= 12; y += 1; }
        this._rangeViewYear = y;
        this._rangeViewMonth = m;
        this.renderRangeCalendar();
    },

    pickRangeDay(iso){
        const day = String(iso || "").slice(0, 10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;

        /* Tahap 1: pilih mulai — jangan apply filter */
        if(!this._rangeDraftStart || (this._rangeDraftStart && this._rangeDraftEnd)){
            this._rangeDraftStart = day;
            this._rangeDraftEnd = null;
            this.renderRangeCalendar();
            return;
        }

        /* Tahap 2: pilih akhir — isi field existing, jangan load otomatis */
        let start = this._rangeDraftStart;
        let end = day;
        if(end < start){
            const tmp = start;
            start = end;
            end = tmp;
        }
        this._rangeDraftStart = start;
        this._rangeDraftEnd = end;

        const startEl = document.getElementById("cashOutStart");
        const endEl = document.getElementById("cashOutEnd");
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;

        this.syncRangeLabel();
        this.renderRangeCalendar();
        /* Tutup setelah range lengkap — Terapkan tetap lewat tombol existing */
        this.closeRangePopup(true);
    },

    renderRangeCalendar(){
        const grid = document.getElementById("cashOutRangeGrid");
        const monthEl = document.getElementById("cashOutRangeMonth");
        const draftStartEl = document.getElementById("cashOutRangeDraftStart");
        const draftEndEl = document.getElementById("cashOutRangeDraftEnd");
        const hintEl = document.getElementById("cashOutRangeHint");
        if(!grid) return;

        const y = this._rangeViewYear;
        const m = this._rangeViewMonth;
        if(monthEl) monthEl.textContent = `${this.MONTH_ID[m]} ${y}`;

        if(draftStartEl){
            draftStartEl.textContent = this._rangeDraftStart
                ? this.formatRangeDisplay(this._rangeDraftStart)
                : "—";
        }
        if(draftEndEl){
            draftEndEl.textContent = this._rangeDraftEnd
                ? this.formatRangeDisplay(this._rangeDraftEnd)
                : "—";
        }
        if(hintEl){
            hintEl.textContent = (!this._rangeDraftStart || this._rangeDraftEnd)
                ? "Pilih tanggal mulai, lalu tanggal akhir."
                : "Pilih tanggal akhir untuk menyelesaikan range.";
        }

        const first = new Date(Date.UTC(y, m, 1, 12, 0, 0));
        /* Senin = 0 … Minggu = 6 */
        const weekdayMon0 = (first.getUTCDay() + 6) % 7;
        const daysInMonth = new Date(Date.UTC(y, m + 1, 0, 12, 0, 0)).getUTCDate();
        const today = this.getJakartaToday();
        const start = this._rangeDraftStart;
        const end = this._rangeDraftEnd;

        let html = "";
        for(let i = 0; i < weekdayMon0; i++){
            html += `<span class="cashout-day is-empty"></span>`;
        }
        for(let d = 1; d <= daysInMonth; d++){
            const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const cls = ["cashout-day"];
            if(iso === today) cls.push("is-today");
            if(start && iso === start) cls.push("is-start");
            if(end && iso === end) cls.push("is-end");
            if(start && end && iso > start && iso < end) cls.push("is-in-range");
            if(start && !end && iso === start) cls.push("is-picking");
            html += `<button type="button" class="${cls.join(" ")}" data-cashout-day="${iso}">${d}</button>`;
        }
        grid.innerHTML = html;
    },

    getJakartaToday(){
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
    },

    shiftDate(tanggal, jumlahHari){
        const parts = String(tanggal || "").slice(0, 10).split("-").map(Number);
        const y = parts[0], m = parts[1], d = parts[2];
        if(!y || !m || !d) return this.getJakartaToday();
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        dt.setUTCDate(dt.getUTCDate() + Number(jumlahHari || 0));
        const yy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(dt.getUTCDate()).padStart(2, "0");
        return `${yy}-${mm}-${dd}`;
    },

    normalizePeriode(periode){
        const key = String(periode || "hariini").toLowerCase().replace(/\s+/g, "");
        if(key === "custom" || key === "customdate" || key === "customtanggal") return "customtanggal";
        return key || "hariini";
    },

    getPeriodeRange(periode, customStart, customEnd){
        const today = this.getJakartaToday();
        const key = this.normalizePeriode(periode);
        switch(key){
            case "kemarin": {
                const k = this.shiftDate(today, -1);
                return { start: k, end: k };
            }
            case "7hari":
                return { start: this.shiftDate(today, -6), end: today };
            case "30hari":
                return { start: this.shiftDate(today, -29), end: today };
            case "bulanini":
                return { start: `${today.slice(0, 8)}01`, end: today };
            case "tahunini":
                return { start: `${today.slice(0, 4)}-01-01`, end: today };
            case "customtanggal": {
                const s = String(customStart || "").slice(0, 10);
                const e = String(customEnd || "").slice(0, 10);
                if(s && e && s <= e) return { start: s, end: e };
                return { start: today, end: today };
            }
            case "hariini":
            default:
                return { start: today, end: today };
        }
    },

    shortCabangName(nama){
        return String(nama || "")
            .replace(/\bVax\s+Wijiaya\b/gi, "")
            .replace(/\bVax\s+Wijaya\b/gi, "")
            .replace(/\s+/g, " ")
            .trim() || String(nama || "-");
    },

    async loadCabangOptions(){
        const sel = document.getElementById("cashOutCabang");
        if(!sel || typeof db === "undefined") return;

        let data = [];
        try{
            const res = await db
                .from(this.TABLE_CABANG)
                .select("id,nama_cabang,aktif,nama_minutes")
                .order("nama_cabang");
            if(res.error) throw res.error;
            data = (res.data || []).filter((c) => {
                if(c.aktif === false) return false;
                const nama = String(c.nama_cabang || "").toLowerCase();
                if(nama.includes("floating")) return false;
                return true;
            });
        }catch(err){
            console.error("CashOut cabang load:", err);
            data = [];
        }

        this.cabangList = data;
        sel.innerHTML = [`<option value="all">Semua Cabang</option>`]
            .concat(data.map((c) =>
                `<option value="${c.id}">${this.escapeHtml(this.shortCabangName(c.nama_cabang))}</option>`
            )).join("");
    },

    isAllCabang(id, name){
        const i = String(id ?? "").trim().toLowerCase();
        const n = String(name || "").trim().toLowerCase();
        return i === "all" || i === "semua" || n === "semua cabang" || n === "semua";
    },

    readHandoff(){
        try{ return JSON.parse(localStorage.getItem(this.HANDOFF_KEY) || "null"); }
        catch(_e){ return null; }
    },

    readStoredFilter(){
        try{ return JSON.parse(localStorage.getItem(this.FILTER_KEY) || "null"); }
        catch(_e){ return null; }
    },

    restoreFiltersFromHandoffOrStorage(){
        const q = new URLSearchParams(window.location.search || "");
        const handoff = this.readHandoff() || {};
        const stored = this.readStoredFilter() || {};

        // Prioritas: URL drilldown → handoff KPI → filter Cash Out tersimpan
        const cabangNameHint = q.get("cabangName") || handoff.cabangName || stored.cabangName || "";
        const rawCabangId = (q.get("cabangId") != null && q.get("cabangId") !== "")
            ? q.get("cabangId")
            : (handoff.cabangId != null && handoff.cabangId !== ""
                ? handoff.cabangId
                : (this.isAllCabang(null, cabangNameHint)
                    ? "all"
                    : (stored.cabangId ?? null)));
        const cabangId = this.isAllCabang(rawCabangId, cabangNameHint) ? "all" : rawCabangId;
        let periode = this.normalizePeriode(
            q.get("periode") || handoff.periode || stored.periode || "kemarin"
        );
        if(periode === "custom-active") periode = "customtanggal";
        let start = q.get("start") || handoff.start || stored.start || "";
        let end = q.get("end") || handoff.end || stored.end || "";

        if(periode === "customtanggal"){
            if(!start || !end || start > end){
                const range = this.getPeriodeRange("kemarin");
                periode = "kemarin";
                start = range.start;
                end = range.end;
            }
        }else{
            // Periode bernama (kemarin/hariini/…) — hitung ulang dari kalender WIB
            const range = this.getPeriodeRange(periode);
            start = range.start;
            end = range.end;
        }

        const cabangEl = document.getElementById("cashOutCabang");
        const periodeEl = document.getElementById("cashOutPeriode");
        const startEl = document.getElementById("cashOutStart");
        const endEl = document.getElementById("cashOutEnd");

        if(cabangEl && this.isAllCabang(cabangId, cabangNameHint)){
            cabangEl.value = "all";
        }else if(cabangEl && cabangId != null && cabangId !== ""){
            const opt = [...cabangEl.options].find((o) => String(o.value) === String(cabangId));
            if(opt) cabangEl.value = String(cabangId);
            else if(cabangEl.options.length > 1) cabangEl.selectedIndex = 1;
        }else if(cabangEl && (handoff.cabangName || cabangNameHint)){
            const want = this.shortCabangName(handoff.cabangName || cabangNameHint).toLowerCase();
            if(this.isAllCabang(null, want)){
                cabangEl.value = "all";
            }else{
                const opt = [...cabangEl.options].find((o) =>
                    o.textContent.trim().toLowerCase() === want
                    || o.textContent.trim().toLowerCase().includes(want)
                );
                if(opt) cabangEl.value = opt.value;
                else if(cabangEl.options.length > 1) cabangEl.selectedIndex = 1;
            }
        }else if(cabangEl && cabangEl.options.length > 1){
            cabangEl.selectedIndex = 1;
        }

        if(periodeEl){
            const has = [...periodeEl.options].some((o) => o.value === periode);
            periodeEl.value = has ? periode : "kemarin";
        }
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
        this.syncCustomVisibility();
        this.persistFilters();
    },

    getActiveFilter(){
        const rawCabang = String(document.getElementById("cashOutCabang")?.value || "");
        const allCabang = this.isAllCabang(rawCabang, rawCabang === "all" ? "Semua Cabang" : "");
        const cabangId = allCabang ? "all" : this.asBigintId(rawCabang);
        const periode = this.normalizePeriode(document.getElementById("cashOutPeriode")?.value);
        let start = document.getElementById("cashOutStart")?.value || "";
        let end = document.getElementById("cashOutEnd")?.value || "";
        if(periode !== "customtanggal"){
            const range = this.getPeriodeRange(periode);
            start = range.start;
            end = range.end;
            const startEl = document.getElementById("cashOutStart");
            const endEl = document.getElementById("cashOutEnd");
            if(startEl) startEl.value = start;
            if(endEl) endEl.value = end;
        }else{
            const range = this.getPeriodeRange("customtanggal", start, end);
            start = range.start;
            end = range.end;
        }
        const cabang = allCabang
            ? { id: "all", nama_cabang: "Semua Cabang" }
            : (this.cabangList.find((c) => Number(c.id) === Number(cabangId)) || null);
        return { cabangId, cabang, periode, start, end, allCabang };
    },

    persistFilters(){
        const f = this.getActiveFilter();
        try{
            localStorage.setItem(this.FILTER_KEY, JSON.stringify({
                cabangId: f.allCabang ? "all" : f.cabangId,
                periode: f.periode,
                start: f.start,
                end: f.end,
                cabangName: f.allCabang
                    ? "Semua Cabang"
                    : this.shortCabangName(f.cabang?.nama_cabang || ""),
                savedAt: new Date().toISOString()
            }));
        }catch(_e){ /* ignore */ }
    },

    /**
     * Parser tampilan Minutes (VIEW ONLY — tidak menulis ulang sumber).
     * Split `;` lalu ekstrak deskripsi / Rp / Kasir per segmen.
     * Menerima Rp104.000 (id-ID) dan Rp104,000 (en-US / data 19–31 Agu).
     */
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

    parseCashOutKeteranganSegment(chunk){
        const raw = String(chunk || "").trim();
        if(!raw) return null;
        const { body, kasir } = this.extractKasirSuffix(raw);
        const m = body.match(/^(.*?)\s+Rp\s*([\d.,\s\u00a0\u202f\u2009]+)$/i);
        if(!m) return null;
        const nama = String(m[1] || "").trim();
        const nominal = this.parseRupiahToken(m[2]);
        if(!nama || nominal == null) return null;
        return { nama, nominal, kasir: kasir || null, raw };
    },

    parseCashOutKeteranganItems(rawText){
        const raw = String(rawText || "").trim();
        if(!raw) return { items: [], unparsed: [] };

        const chunks = raw.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
        const items = [];
        const unparsed = [];

        chunks.forEach((chunk) => {
            const parsed = this.parseCashOutKeteranganSegment(chunk);
            if(parsed) items.push(parsed);
            else unparsed.push(chunk);
        });

        return { items, unparsed };
    },

    /**
     * Expand daily_recap_source rows → detail lines.
     * TOTAL source of truth tetap sum(cash_out) — tidak dihitung ulang dari parse.
     * String gabungan (pisah `;`) dipecah jadi beberapa row transaksi.
     */
    expandDetailRows(dailyRows){
        const out = [];
        let warnings = [];

        (dailyRows || []).forEach((day) => {
            const tanggal = String(day.tanggal || "").slice(0, 10);
            const dayTotal = Number(day.cash_out || 0);
            const raw = String(day.keterangan_cash_out || "").trim();
            const chunks = raw
                ? raw.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean)
                : [];

            if(chunks.length){
                const parsedChunks = chunks.map((chunk) => ({
                    chunk,
                    parsed: this.parseCashOutKeteranganSegment(chunk)
                }));
                const parsedCount = parsedChunks.filter((c) => c.parsed).length;

                if(parsedCount > 0){
                    parsedChunks.forEach((c) => {
                        if(c.parsed){
                            out.push({
                                tanggal,
                                waktu: null,
                                cabang_id: day.cabang_id ?? null,
                                nominal: c.parsed.nominal,
                                keterangan: c.parsed.nama,
                                kasir: c.parsed.kasir,
                                source: "minutes-keterangan"
                            });
                            return;
                        }
                        const { body, kasir } = this.extractKasirSuffix(c.chunk);
                        out.push({
                            tanggal,
                            waktu: null,
                            cabang_id: day.cabang_id ?? null,
                            nominal: null,
                            keterangan: body || c.chunk,
                            kasir,
                            source: "minutes-unparsed"
                        });
                        warnings.push(`${tanggal}: potongan keterangan tidak ter-parse penuh`);
                    });
                    return;
                }

                // Semua segmen gagal — 1 row aman, nominal harian resmi, teks asli.
                const { kasir } = this.extractKasirSuffix(raw);
                out.push({
                    tanggal,
                    waktu: null,
                    cabang_id: day.cabang_id ?? null,
                    nominal: dayTotal,
                    keterangan: raw,
                    kasir,
                    source: "minutes-raw-day"
                });
                return;
            }

            if(dayTotal > 0){
                out.push({
                    tanggal,
                    waktu: null,
                    cabang_id: day.cabang_id ?? null,
                    nominal: dayTotal,
                    keterangan: "—",
                    kasir: null,
                    source: "minutes-total-only"
                });
                warnings.push(`${tanggal}: cash_out ada, keterangan Minutes kosong`);
            }
        });

        return { rows: out, warnings: [...new Set(warnings)] };
    },

    async load(){
        if(typeof db === "undefined"){
            this.showBanner("Koneksi database tidak tersedia.", true);
            return;
        }

        const filter = this.getActiveFilter();
        if(!filter.allCabang && !filter.cabangId){
            this.showBanner("Pilih cabang terlebih dahulu.", true);
            this.ranggaAuditMeta = { mode: "none" };
            this.ranggaAuditRows = [];
            this.renderEmpty();
            return;
        }
        const cabangId = filter.allCabang ? null : this.asBigintId(filter.cabangId);
        if(!filter.allCabang && cabangId == null){
            this.showBanner("Cabang tidak valid. Pilih cabang operasional.", true);
            this.ranggaAuditMeta = { mode: "none" };
            this.ranggaAuditRows = [];
            this.renderEmpty();
            return;
        }

        this.setLoading(true);
        this.showBanner("");

        try{
            let q = db
                .from(this.TABLE_SOURCE)
                .select("tanggal,cash_out,keterangan_cash_out,cabang_id")
                .order("tanggal", { ascending: true });
            if(filter.allCabang){
                const ids = (this.cabangList || []).map((c) => this.asBigintId(c.id)).filter((id) => id != null);
                if(!ids.length){
                    this.showBanner("Daftar cabang operasional belum siap.", true);
                    this.renderEmpty();
                    return;
                }
                q = q.in("cabang_id", ids);
            }else{
                q = q.eq("cabang_id", cabangId);
            }

            q = (filter.start === filter.end)
                ? q.eq("tanggal", filter.start)
                : q.gte("tanggal", filter.start).lte("tanggal", filter.end);

            const { data, error } = await q;
            if(error) throw error;

            const daily = (data || []).map((r) => ({
                ...r,
                tanggal: String(r.tanggal || "").slice(0, 10),
                cash_out: Number(r.cash_out || 0),
                keterangan_cash_out: r.keterangan_cash_out || ""
            }));

            this.totalCashOut = daily.reduce((t, r) => t + Number(r.cash_out || 0), 0);
            const expanded = this.expandDetailRows(daily.filter((r) => Number(r.cash_out || 0) !== 0 || String(r.keterangan_cash_out || "").trim()));
            this.rows = expanded.rows;
            this.expandedDates = new Set();
            await this.loadRanggaAuditRows(filter);

            // Validasi: sum nominal baris (yang punya angka) vs total KPI
            const detailSum = this.rows.reduce((t, r) => t + Number(r.nominal || 0), 0);
            if(this.rows.length && Math.abs(detailSum - this.totalCashOut) > 1){
                const dLabel = detailSum.toLocaleString("id-ID");
                const tLabel = this.totalCashOut.toLocaleString("id-ID");
                expanded.warnings.push(
                    "Perhatian: jumlah baris detail (Rp" + dLabel +
                    ") != total cash_out Minutes (Rp" + tLabel + "). TOTAL memakai cash_out resmi."
                );
            }

            this.render(filter, expanded.warnings);
        }catch(err){
            console.error("CashOutDetail.load:", err);
            this.showBanner(err?.message || "Gagal memuat Cash Out.", true);
            this.rows = [];
            this.totalCashOut = 0;
            this.ranggaAuditRows = [];
            this.ranggaAuditMeta = { mode: "none" };
            this.render(filter, []);
        }finally{
            this.setLoading(false);
        }
    },

    setLoading(state){
        this.loading = Boolean(state);
        const el = document.getElementById("cashOutLoading");
        if(el) el.hidden = !this.loading;
        if(this.loading){
            const table = document.getElementById("cashOutTable");
            const empty = document.getElementById("cashOutEmpty");
            if(table) table.hidden = true;
            if(empty) empty.hidden = true;
        }
    },

    showBanner(text, isError){
        const el = document.getElementById("cashOutBanner");
        if(!el) return;
        if(!text){
            el.hidden = true;
            el.textContent = "";
            el.classList.remove("is-error");
            return;
        }
        el.hidden = false;
        el.textContent = text;
        el.classList.toggle("is-error", Boolean(isError));
    },

    formatRupiah(nilai){
        if(nilai === null || nilai === undefined || nilai === "") return "—";
        return "Rp" + Number(nilai || 0).toLocaleString("id-ID");
    },

    formatTanggal(tanggal){
        const key = String(tanggal || "").slice(0, 10);
        const parts = key.split("-").map(Number);
        if(parts.length !== 3 || !parts[0]) return key || "—";
        const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
        return dt.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC"
        });
    },

    /** VIEW ONLY: kunci group tanggal, tanpa mengubah urutan/data row. */
    dateGroupKey(row){
        return String(row?.tanggal || "").slice(0, 10);
    },

    isSameDateGroup(row, prevRow){
        if(!prevRow) return false;
        const cur = this.dateGroupKey(row);
        const prev = this.dateGroupKey(prevRow);
        return Boolean(cur) && cur === prev;
    },

    tanggalCellLabel(row, prevRow){
        if(this.isSameDateGroup(row, prevRow)) return "";
        return this.formatTanggal(row.tanggal);
    },

    /**
     * VIEW ONLY — highlight Kasir/User:
     * - nama "Rangga" (case-insensitive, exact setelah trim)
     * - role SVP hanya jika source row menyediakan role secara eksplisit
     */
    isGoldKasirRow(row){
        const kasir = String(row?.kasir || "").trim();
        if(this.isRanggaName(kasir)) return true;
        const roleRaw = row?.role ?? row?.user_role ?? null;
        if(roleRaw == null || roleRaw === "") return false;
        return String(roleRaw).trim().toLowerCase() === "svp";
    },

    isRanggaName(nama){
        return String(nama || "").trim().toLowerCase() === "rangga";
    },

    toggleDateExpand(dateKey){
        const key = String(dateKey || "").slice(0, 10);
        if(!key) return;
        const tbody = document.getElementById("cashOutTbody");
        if(tbody && !tbody.querySelector(`[data-cashout-sum="${key}"]`)) return;
        if(this.expandedDates.has(key)) this.expandedDates.delete(key);
        else this.expandedDates.add(key);
        this.syncExpandUi();
    },

    syncExpandUi(){
        const tbody = document.getElementById("cashOutTbody");
        if(!tbody) return;
        tbody.querySelectorAll("[data-cashout-sum]").forEach((tr) => {
            const open = this.expandedDates.has(tr.getAttribute("data-cashout-sum"));
            tr.classList.toggle("is-open", open);
            tr.setAttribute("aria-expanded", open ? "true" : "false");
        });
        tbody.querySelectorAll("[data-cashout-detail]").forEach((tr) => {
            tr.hidden = !this.expandedDates.has(tr.getAttribute("data-cashout-detail"));
        });
    },

    formatKasirSummaryHtml(names){
        const list = (names || []).filter(Boolean);
        if(!list.length) return '<span class="cashout-muted">—</span>';
        return list.map((n) => {
            const safe = this.escapeHtml(n);
            return this.isRanggaName(n)
                ? `<span class="is-gold-user">${safe}</span>`
                : safe;
        }).join(" / ");
    },

    /**
     * Summary 1 tanggal = 1 row, dari detail parser existing.
     * Urutan tanggal mengikuti urutan detail existing.
     */
    buildDateSummaries(detailRows){
        const map = new Map();
        const order = [];
        (detailRows || []).forEach((r) => {
            const key = this.dateGroupKey(r);
            if(!key) return;
            if(!map.has(key)){
                map.set(key, { tanggal: key, details: [] });
                order.push(key);
            }
            map.get(key).details.push(r);
        });

        return order.map((key) => {
            const details = map.get(key).details;
            let sum = 0;
            const names = [];
            const seen = new Set();
            details.forEach((d) => {
                const n = Number(d.nominal);
                if(Number.isFinite(n)) sum += n;
                const kasir = String(d.kasir || "").trim();
                if(!kasir) return;
                const k = kasir.toLowerCase();
                if(seen.has(k)) return;
                seen.add(k);
                names.push(kasir);
            });
            const firstKet = String(details[0]?.keterangan || "—").trim() || "—";
            const extra = details.length - 1;
            return {
                key,
                tanggal: key,
                nominal: sum,
                keterangan: extra > 0 ? `${firstKet} + ${extra} lainnya` : firstKet,
                kasirNames: names,
                details,
                empty: false
            };
        });
    },

    listCalendarDays(startIso, endIso){
        const start = String(startIso || "").slice(0, 10);
        const end = String(endIso || "").slice(0, 10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
        const out = [];
        let cur = start;
        let guard = 0;
        while(cur <= end && guard < 32){
            out.push(cur);
            cur = this.shiftDate(cur, 1);
            guard += 1;
        }
        return out;
    },

    emptyCalendarSummary(tanggal){
        const key = String(tanggal || "").slice(0, 10);
        return {
            key,
            tanggal: key,
            nominal: 0,
            keterangan: "Tidak ada Cash Out",
            kasirNames: [],
            details: [],
            empty: true
        };
    },

    /**
     * Tabel utama: SEMUA tanggal kalender bulan aktif (28/29/30/31).
     * Hari tanpa Cash Out = row Rp0, tidak expandable, tidak masuk TOTAL/KPI.
     */
    buildMonthCalendarSummaries(detailRows, filter){
        const filled = this.buildDateSummaries(detailRows);
        const month = this.getAuditCalendarMonth(filter);
        const days = this.listCalendarDays(month.monthStart, month.monthEnd);
        if(!days.length) return filled;
        const byKey = new Map(filled.map((s) => [s.key, s]));
        return days.map((d) => byKey.get(d) || this.emptyCalendarSummary(d));
    },

    monthStartIso(ym){
        const m = String(ym || "").slice(0, 7);
        return /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : "";
    },

    monthEndIso(ym){
        const m = String(ym || "").slice(0, 7);
        const parts = m.split("-").map(Number);
        if(parts.length < 2 || !parts[0] || !parts[1]) return "";
        const last = new Date(Date.UTC(parts[0], parts[1], 0, 12, 0, 0));
        const dd = String(last.getUTCDate()).padStart(2, "0");
        const mm = String(last.getUTCMonth() + 1).padStart(2, "0");
        return `${last.getUTCFullYear()}-${mm}-${dd}`;
    },

    /**
     * Bulan kalender aktif dari filter (bukan rolling 30 hari).
     * Satu bulan di range → bulan itu. Lintas bulan → bulan hari ini jika masih di range, else bulan end.
     */
    getAuditCalendarMonth(filter){
        const start = String(filter?.start || "").slice(0, 10);
        const end = String(filter?.end || "").slice(0, 10);
        const sm = start.slice(0, 7);
        const em = end.slice(0, 7);
        let ym = sm && sm === em ? sm : "";
        if(!ym){
            const today = this.getJakartaToday();
            if(today >= start && today <= end) ym = today.slice(0, 7);
            else ym = em || sm;
        }
        const monthStart = this.monthStartIso(ym);
        const monthEnd = this.monthEndIso(ym);
        const mi = Number(String(ym || "").slice(5, 7)) - 1;
        const year = String(ym || "").slice(0, 4);
        const monthLabel = (mi >= 0 && mi < 12)
            ? `${this.MONTH_ID[mi]} ${year}`
            : ym;
        return { ym, monthStart, monthEnd, monthLabel };
    },

    async loadRanggaAuditRows(filter){
        this.ranggaAuditRows = [];
        this.ranggaAuditMeta = { mode: "ok", monthLabel: "", cabangName: "" };

        if(!filter || filter.allCabang){
            this.ranggaAuditMeta = { mode: "all-cabang", monthLabel: "", cabangName: "Semua Cabang" };
            return;
        }

        const cabangId = this.asBigintId(filter.cabangId);
        const cabangName = this.shortCabangName(filter.cabang?.nama_cabang || "");
        const month = this.getAuditCalendarMonth(filter);
        this.ranggaAuditMeta = {
            mode: "ok",
            monthLabel: month.monthLabel,
            cabangName,
            monthStart: month.monthStart,
            monthEnd: month.monthEnd
        };

        if(!cabangId || !month.monthStart || !month.monthEnd){
            this.ranggaAuditMeta.mode = "none";
            return;
        }

        const covered = filter.start <= month.monthStart && filter.end >= month.monthEnd;
        if(covered){
            this.ranggaAuditRows = (this.rows || []).filter((r) => {
                const t = this.dateGroupKey(r);
                return t >= month.monthStart && t <= month.monthEnd
                    && Number(r.cabang_id) === Number(cabangId);
            });
            return;
        }

        try{
            const { data, error } = await db
                .from(this.TABLE_SOURCE)
                .select("tanggal,cash_out,keterangan_cash_out,cabang_id")
                .eq("cabang_id", cabangId)
                .gte("tanggal", month.monthStart)
                .lte("tanggal", month.monthEnd)
                .order("tanggal", { ascending: true });
            if(error) throw error;
            const daily = (data || []).map((r) => ({
                ...r,
                tanggal: String(r.tanggal || "").slice(0, 10),
                cash_out: Number(r.cash_out || 0),
                keterangan_cash_out: r.keterangan_cash_out || ""
            }));
            const expanded = this.expandDetailRows(
                daily.filter((r) => Number(r.cash_out || 0) !== 0 || String(r.keterangan_cash_out || "").trim())
            );
            this.ranggaAuditRows = expanded.rows;
        }catch(err){
            console.error("CashOutDetail.loadRanggaAuditRows:", err);
            this.ranggaAuditRows = [];
        }
    },

    renderRanggaAudit(){
        const host = document.getElementById("cashOutRanggaAudit");
        if(!host) return;

        const meta = this.ranggaAuditMeta || { mode: "none" };
        if(meta.mode === "none"){
            host.hidden = true;
            return;
        }

        host.hidden = false;

        const setText = (id, v) => {
            const el = document.getElementById(id);
            if(el) el.textContent = v;
        };

        const listEl = document.getElementById("cashOutRanggaList");
        const emptyEl = document.getElementById("cashOutRanggaEmpty");

        if(meta.mode === "all-cabang"){
            setText("cashOutRanggaScope", "Pilih satu cabang untuk audit Cash Out Rangga.");
            setText("cashOutRanggaTotal", this.formatRupiah(0));
            setText("cashOutRanggaCount", "0 kali");
            if(listEl) listEl.innerHTML = "";
            if(emptyEl){
                emptyEl.hidden = false;
                emptyEl.textContent = "Audit Rangga hanya untuk cabang yang sedang dibuka — bukan gabungan semua cabang.";
            }
            return;
        }

        const scopeBits = [meta.cabangName, meta.monthLabel].filter(Boolean);
        setText("cashOutRanggaScope", scopeBits.length ? scopeBits.join(" · ") : "—");

        const items = (this.ranggaAuditRows || []).filter((r) => this.isRanggaName(r.kasir));
        const total = items.reduce((t, r) => t + Number(r.nominal || 0), 0);
        setText("cashOutRanggaTotal", this.formatRupiah(total));
        setText("cashOutRanggaCount", `${items.length} kali`);

        if(!items.length){
            if(listEl) listEl.innerHTML = "";
            if(emptyEl){
                emptyEl.hidden = false;
                emptyEl.textContent = "Belum ada Cash Out yang diinput Rangga pada periode ini.";
            }
            return;
        }

        if(emptyEl) emptyEl.hidden = true;
        if(listEl){
            listEl.innerHTML = items.map((r) => {
                const ket = String(r.keterangan || "—").trim() || "—";
                const tgl = this.formatTanggal(r.tanggal);
                const nom = r.nominal == null ? "—" : this.formatRupiah(r.nominal);
                return `<li>
                    <span class="cashout-rangga-item-ket">${this.escapeHtml(ket)}</span>
                    <span class="cashout-rangga-item-nom">${this.escapeHtml(nom)}</span>
                    <span class="cashout-rangga-item-tgl">${this.escapeHtml(tgl)}</span>
                </li>`;
            }).join("");
        }
    },

    insightKeteranganKey(nama){
        return String(nama || "").trim().replace(/\s+/g, " ").toLowerCase();
    },

    /**
     * Insight dari detail aktif di memory (setelah filter).
     * Tidak query baru, tidak mengubah TOTAL / jumlah transaksi.
     */
    buildCashOutInsights(rows){
        const list = rows || [];
        const groups = new Map();

        list.forEach((r) => {
            const display = String(r?.keterangan || "").trim();
            const key = this.insightKeteranganKey(display);
            if(!key || key === "—" || key === "-") return;
            const hit = groups.get(key) || { name: display, count: 0, sum: 0 };
            hit.count += 1;
            hit.sum += Number(r.nominal || 0);
            groups.set(key, hit);
        });

        let palingSering = null;
        groups.forEach((g) => {
            if(!palingSering){
                palingSering = g;
                return;
            }
            if(g.count > palingSering.count){
                palingSering = g;
                return;
            }
            if(g.count === palingSering.count && g.sum > palingSering.sum){
                palingSering = g;
            }
        });

        let terbesar = null;
        list.forEach((r) => {
            const n = Number(r?.nominal);
            if(!Number.isFinite(n)) return;
            if(!terbesar || n > Number(terbesar.nominal)) terbesar = r;
        });

        return { palingSering, terbesar };
    },

    renderInsights(rows){
        const host = document.getElementById("cashOutInsight");
        if(!host) return;
        if(!rows || !rows.length){
            host.hidden = true;
            return;
        }

        const { palingSering, terbesar } = this.buildCashOutInsights(rows);
        host.hidden = false;

        const setText = (id, v) => {
            const el = document.getElementById(id);
            if(el) el.textContent = v;
        };

        if(palingSering){
            setText("cashOutInsightSeringName", palingSering.name);
            setText("cashOutInsightSeringCount", `${palingSering.count} kali`);
            setText("cashOutInsightSeringSum", this.formatRupiah(palingSering.sum));
        }else{
            setText("cashOutInsightSeringName", "—");
            setText("cashOutInsightSeringCount", "—");
            setText("cashOutInsightSeringSum", "—");
        }

        if(terbesar){
            setText("cashOutInsightMaxName", String(terbesar.keterangan || "—").trim() || "—");
            setText("cashOutInsightMaxSum", this.formatRupiah(terbesar.nominal));
            setText("cashOutInsightMaxDate", this.formatTanggal(terbesar.tanggal));
            setText("cashOutInsightMaxKasir", String(terbesar.kasir || "").trim() || "—");
        }else{
            setText("cashOutInsightMaxName", "—");
            setText("cashOutInsightMaxSum", "—");
            setText("cashOutInsightMaxDate", "—");
            setText("cashOutInsightMaxKasir", "—");
        }
    },

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

    periodeLabel(filter){
        if(filter.periode === "customtanggal"){
            return `${this.formatTanggal(filter.start)} — ${this.formatTanggal(filter.end)}`;
        }
        return this.PERIODE_LABEL[filter.periode] || filter.periode;
    },

    resolvePrintCabangName(cabangId){
        if(cabangId == null || cabangId === "") return "—";
        const hit = (this.cabangList || []).find((c) => Number(c.id) === Number(cabangId));
        if(!hit) return "—";
        return this.shortCabangName(hit.nama_cabang) || "—";
    },

    cabangMatchOrderIndex(nama){
        const n = String(nama || "").toLowerCase();
        for(let i = 0; i < this.CABANG_ORDER.length; i++){
            if(this.CABANG_ORDER[i].aliases.some((a) => n.includes(a))) return i;
        }
        return 999;
    },

    sortPrintRowsInCabang(rows){
        return (rows || []).map((r, i) => ({ r, i })).sort((a, b) => {
            const ta = String(a.r.tanggal || "");
            const tb = String(b.r.tanggal || "");
            if(ta !== tb) return ta < tb ? -1 : 1;
            const wa = a.r.waktu ? String(a.r.waktu) : "";
            const wb = b.r.waktu ? String(b.r.waktu) : "";
            if(wa && wb && wa !== wb) return wa < wb ? -1 : 1;
            return a.i - b.i;
        }).map((x) => x.r);
    },

    sumPrintNominal(rows){
        return (rows || []).reduce((t, r) => t + Number(r.nominal || 0), 0);
    },

    matchCanonicalCabang(spec){
        return (this.cabangList || []).find((c) => {
            const n = String(c.nama_cabang || "").toLowerCase();
            const s = this.shortCabangName(c.nama_cabang).toLowerCase();
            return spec.aliases.some((a) => n.includes(a) || s.includes(a));
        }) || null;
    },

    buildAllCabangPrintGroups(){
        const rows = this.rows || [];
        const used = new Set();
        const groups = [];

        this.CABANG_ORDER.forEach((spec) => {
            const cab = this.matchCanonicalCabang(spec);
            if(cab){
                used.add(Number(cab.id));
                const cabRows = this.sortPrintRowsInCabang(
                    rows.filter((r) => Number(r.cabang_id) === Number(cab.id))
                );
                groups.push({
                    id: cab.id,
                    name: this.shortCabangName(cab.nama_cabang) || spec.label,
                    rows: cabRows,
                    subtotal: this.sumPrintNominal(cabRows)
                });
                return;
            }
            groups.push({ id: null, name: spec.label, rows: [], subtotal: 0 });
        });

        const leftover = new Map();
        rows.forEach((r) => {
            if(r.cabang_id == null || r.cabang_id === "") return;
            const id = Number(r.cabang_id);
            if(used.has(id)) return;
            if(!leftover.has(id)) leftover.set(id, []);
            leftover.get(id).push(r);
        });
        leftover.forEach((cabRows, id) => {
            const cab = (this.cabangList || []).find((c) => Number(c.id) === Number(id));
            const name = cab
                ? this.shortCabangName(cab.nama_cabang)
                : this.resolvePrintCabangName(id);
            const sorted = this.sortPrintRowsInCabang(cabRows);
            groups.push({ id, name: name || "—", rows: sorted, subtotal: this.sumPrintNominal(sorted) });
        });

        const unknown = rows.filter((r) => r.cabang_id == null || r.cabang_id === "");
        if(unknown.length){
            const sorted = this.sortPrintRowsInCabang(unknown);
            groups.push({ id: null, name: "—", rows: sorted, subtotal: this.sumPrintNominal(sorted) });
        }
        return groups;
    },

    buildPrintTxnRow(r, prevRow){
        const dateLabel = this.formatTanggal(r.tanggal);
        const gold = this.isGoldKasirRow(r);
        const goldClass = gold ? " is-gold-user" : "";
        return `<tbody class="txn"><tr class="is-aktif">
                <td class="col-date">${this.escapeHtml(dateLabel || "—")}</td>
                <td class="num is-cashout">${r.nominal == null ? "—" : this.escapeHtml(this.formatRupiah(r.nominal))}</td>
                <td class="col-note${goldClass}">${this.escapeHtml(r.keterangan || "—")}</td>
                <td class="col-user${goldClass}">${r.kasir ? this.escapeHtml(r.kasir) : "—"}</td>
            </tr></tbody>`;
    },

    buildAllCabangPrintTables(){
        const groups = this.buildAllCabangPrintGroups();
        const grandLabel = this.formatRupiah(this.totalCashOut);
        const parts = groups.map((g) => {
            const title = String(g.name || "—").toUpperCase();
            if(!g.rows.length){
                return `<section class="co-empty-group keep">
      <div class="title-wrap is-next"><div class="t1">${this.escapeHtml(title)}</div></div>
      <p class="co-empty">Tidak ada transaksi Cash Out pada periode ini.</p>
    </section>`;
            }
            return `<table class="rpt co-group">
      <thead>
        <tr class="grp-title"><th colspan="4">${this.escapeHtml(title)}</th></tr>
        <tr>
          <th class="col-date">Tanggal</th>
          <th class="num">Nominal</th>
          <th class="col-note">Keterangan Cash Out</th>
          <th class="col-user">Kasir / User</th>
        </tr>
      </thead>
        ${g.rows.map((r, i) => this.buildPrintTxnRow(r, i > 0 ? g.rows[i - 1] : null)).join("")}
      <tbody class="sub">
        <tr class="subtotal">
          <td>SUBTOTAL ${this.escapeHtml(title)}</td>
          <td class="num is-cashout">${this.escapeHtml(this.formatRupiah(g.subtotal))}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>`;
        });
        parts.push(`<div class="grand-block">
      <span>GRAND TOTAL SEMUA CABANG</span>
      <strong>${this.escapeHtml(grandLabel)}</strong>
    </div>`);
        return parts.join("\n");
    },

    printPeriodeLabel(filter){
        const name = this.periodeLabel(filter);
        if(filter.periode === "customtanggal") return name;
        if(filter.start && filter.end){
            if(filter.start === filter.end) return `${name} · ${this.formatTanggal(filter.start)}`;
            return `${name} · ${this.formatTanggal(filter.start)} — ${this.formatTanggal(filter.end)}`;
        }
        return name;
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

    async fetchPrintAssetDataUrl(relPaths){
        const candidates = [];
        (relPaths || []).forEach((rel) => {
            try{ candidates.push(new URL(rel, window.location.href).href); }catch(_e){ /* ignore */ }
        });
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

    async resolvePrintLogoSrc(){
        return this.fetchPrintAssetDataUrl([
            "../assets/brand/erp-vax-wijaya.png",
            "../assets/logo/erp-vax-wijaya.png"
        ]);
    },

    /* Hook aset TTD: ERP.NEW/assets/owner-signature.png (PNG transparan). */
    async resolvePrintOwnerSignatureSrc(){
        return this.fetchPrintAssetDataUrl([
            "../assets/owner-signature.png"
        ]);
    },

    getCashOutStampSvg(){
        return `<svg viewBox="0 0 340 196" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <filter id="coInk" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="luminanceToAlpha" result="a"/>
      <feComponentTransfer in="a" result="s">
        <feFuncA type="discrete" tableValues="0 0.18 0.08 0.22 0 0.12 0.2 0"/>
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="s" operator="out"/>
    </filter>
  </defs>
  <g fill="none" stroke="#163E86" filter="url(#coInk)">
    <rect x="7" y="7" width="326" height="182" rx="11" ry="11" stroke-width="3.2"/>
    <rect x="16" y="16" width="308" height="164" rx="7" ry="7" stroke-width="1.6"/>
    <line x1="36" y1="50" x2="304" y2="50" stroke-width="1.5"/>
    <line x1="36" y1="104" x2="304" y2="104" stroke-width="1.5"/>
    <line x1="36" y1="170" x2="152" y2="170" stroke-width="1.5"/>
    <line x1="188" y1="170" x2="304" y2="170" stroke-width="1.5"/>
  </g>
  <g fill="#163E86" filter="url(#coInk)">
    <polygon points="148,28 150.4,34.8 157.6,34.8 151.8,39 154.2,46 148,41.6 141.8,46 144.2,39 138.4,34.8 145.6,34.8"/>
    <polygon points="170,28 172.4,34.8 179.6,34.8 173.8,39 176.2,46 170,41.6 163.8,46 166.2,39 160.4,34.8 167.6,34.8"/>
    <polygon points="192,28 194.4,34.8 201.6,34.8 195.8,39 198.2,46 192,41.6 185.8,46 188.2,39 182.4,34.8 189.6,34.8"/>
  </g>
  <text x="170" y="88" text-anchor="middle" fill="#163E86" font-family="Georgia,'Times New Roman',serif" font-size="26" font-weight="700" letter-spacing="1.2">ERP VAX WIJAYA</text>
  <text x="170" y="126" text-anchor="middle" fill="#163E86" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing="3.2">CONFIDENTIAL</text>
  <text x="170" y="146" text-anchor="middle" fill="#163E86" font-family="Arial,Helvetica,sans-serif" font-size="8.6" font-weight="700" letter-spacing="1.5">ENTERPRISE RESOURCE PLANNING</text>
  <g fill="none" stroke="#163E86" stroke-width="2.1" stroke-linecap="round" filter="url(#coInk)">
    <line x1="162" y1="158" x2="178" y2="174"/>
    <line x1="178" y1="158" x2="162" y2="174"/>
  </g>
</svg>`;
    },

    getOwnerSignatureFallbackSvg(){
        return `<svg viewBox="0 0 280 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <text x="8" y="50" fill="#0E2A4A" font-family="Segoe Script, Brush Script MT, 'Apple Chancery', cursive" font-size="30" font-style="italic">Heri Herdianto</text>
</svg>`;
    },

    buildPrintInsightHtml(){
        const { palingSering, terbesar } = this.buildCashOutInsights(this.rows);
        if(!palingSering && !terbesar) return "";
        const seringName = palingSering ? this.escapeHtml(palingSering.name) : "—";
        const seringMeta = palingSering
            ? `${palingSering.count} kali · ${this.escapeHtml(this.formatRupiah(palingSering.sum))}`
            : "—";
        const maxName = terbesar ? this.escapeHtml(String(terbesar.keterangan || "—").trim() || "—") : "—";
        const maxSum = terbesar ? this.escapeHtml(this.formatRupiah(terbesar.nominal)) : "—";
        const maxMeta = terbesar
            ? `${this.escapeHtml(this.formatTanggal(terbesar.tanggal))} · ${this.escapeHtml(String(terbesar.kasir || "").trim() || "—")}`
            : "—";
        return `<section class="insight keep">
      <article>
        <span class="lbl">Paling Sering</span>
        <strong>${seringName}</strong>
        <p>${seringMeta}</p>
      </article>
      <article>
        <span class="lbl">Cash Out Terbesar</span>
        <strong>${maxName}</strong>
        <p class="amt">${maxSum}</p>
        <p>${maxMeta}</p>
      </article>
    </section>`;
    },

    buildPrintSignBlock(sigSrc){
        const stamp = this.getCashOutStampSvg();
        const ttd = sigSrc
            ? `<img src="${sigSrc}" alt="Tanda tangan Owner">`
            : "";
        return `<section class="sign keep" aria-label="Otorisasi dokumen">
      <div class="box">
        <div class="who">Diperiksa oleh,</div>
        <div class="role">Pemeriksa</div>
        <div class="stage is-empty"></div>
        <div class="name">&nbsp;</div>
        <div class="line"></div>
        <div class="job">Finance / Ops</div>
      </div>
      <div class="box is-owner">
        <div class="who">Disetujui / Mengetahui,</div>
        <div class="role">Otorisasi Owner</div>
        <div class="stage">
          <div class="stamp">${stamp}</div>
          <div class="ttd">${ttd}</div>
        </div>
        <div class="name">Heri Herdianto</div>
        <div class="line"></div>
        <div class="job">OWNER</div>
      </div>
    </section>`;
    },

    getCashOutPrintPagerScript(){
        return `
    function coMarkTxnPageBreaks(){
      var PX = 96 / 25.4;
      var CONTENT = (297 - 12 - 22) * PX;
      var SAFETY = 18 * PX;
      var limit = CONTENT - SAFETY;
      var sheet = document.querySelector(".sheet");
      if(!sheet) return;
      var used = 0;
      var kids = sheet.children;
      for(var i = 0; i < kids.length; i++){
        var child = kids[i];
        var cs = window.getComputedStyle(child);
        if(child.matches && child.matches("table.rpt")){
          var thead = child.querySelector("thead");
          var theadH = thead ? thead.offsetHeight : 0;
          var bodies = child.querySelectorAll("tbody.txn, tbody.sub");
          var b;
          for(b = 0; b < bodies.length; b++) bodies[b].classList.remove("brk");
          if(used + theadH > limit) used = 0;
          used += theadH;
          for(b = 0; b < bodies.length; b++){
            var tb = bodies[b];
            var h = tb.offsetHeight;
            if(used + h > limit){
              tb.classList.add("brk");
              used = theadH + h;
            }else{
              used += h;
            }
          }
          var tfoot = child.querySelector("tfoot");
          if(tfoot){
            tfoot.style.breakBefore = "";
            tfoot.style.pageBreakBefore = "";
            var fh = tfoot.offsetHeight;
            if(used + fh > limit){
              tfoot.style.breakBefore = "page";
              tfoot.style.pageBreakBefore = "always";
              used = theadH + fh;
            }else{
              used += fh;
            }
          }
        }else{
          var blockH = child.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
          if(used + blockH > limit){
            used = blockH;
          }else{
            used += blockH;
          }
        }
      }
    }
    function coPreparePrint(){
      var s = document.getElementById("co-print-measure");
      if(!s){
        s = document.createElement("style");
        s.id = "co-print-measure";
        s.textContent = "body,html{padding:0 !important;background:#fff !important;} .sheet{padding:0 !important;box-shadow:none !important;} .no-print{display:none !important;}";
        document.head.appendChild(s);
      }
      document.body.offsetHeight;
      coMarkTxnPageBreaks();
    }`;
    },

    getCashOutPrintBaseCss(isAll){
        const allCss = isAll ? `
  body.is-all .summary{
    grid-template-columns: 1.15fr 0.85fr 0.9fr 1.75fr;
    align-items: stretch;
  }
  body.is-all .sum.is-main .val{
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
    line-height: 1.3;
  }
  body.is-all .sheet{ break-after:auto !important; page-break-after:auto !important; }
  body.is-all table.rpt.co-group{ margin:0 0 12px; }
  body.is-all table.rpt tr.grp-title th{
    background:var(--head); color:#f8fafc; font-size:10pt; letter-spacing:.08em;
    text-align:left; padding:8px 6px; border-bottom:2px solid var(--gold-line);
  }
  body.is-all table.rpt tr.subtotal td{
    font-weight:800; background:#F7F1DE;
    border-top:2px solid var(--gold-line); border-bottom:2px solid var(--gold-line);
  }
  body.is-all .title-wrap.is-next{ break-after:avoid; page-break-after:avoid; }
  body.is-all .co-empty-group{ margin:0 0 10px; }
  body.is-all .co-empty{ margin:0 0 8px; font-size:9pt; color:var(--muted); }
  body.is-all .grand-block{
    margin:10px 0 8px; padding:8px 10px;
    display:flex; justify-content:space-between; align-items:center; gap:12px;
    background:#F7F1DE; border-top:2px solid var(--gold-line); border-bottom:2px solid var(--gold-line);
    break-inside:avoid; page-break-inside:avoid;
    font-weight:800; letter-spacing:.04em; text-transform:uppercase;
  }
  body.is-all .grand-block strong{ color:var(--cashout); font-size:12pt; white-space:nowrap; }
` : "";
        return `
  :root{
    --ink:#1a1a1a; --muted:#6b6520; --line:#e5e0d0;
    --gold:#c9a227; --gold-line:#d4af37; --soft:#fafaf8;
    --head:#111111; --cashout:#b91c1c;
  }
  *{ box-sizing:border-box; }
  @page{ size:A4 portrait; margin:12mm 14mm 22mm 14mm; }
  html,body{
    margin:0; padding:0; background:#fff; color:var(--ink);
    font-family:Arial,"Segoe UI",Helvetica,sans-serif;
    font-size:10pt; line-height:1.4;
    height:auto; min-height:0;
  }
  body{ padding:0; }
  .sheet{
    width:100%; max-width:182mm; margin:0 auto; padding-bottom:0;
    display:flex; flex-direction:column; min-height:236mm;
  }
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
  .sum .val{ display:block; font-size:12.5pt; font-weight:800; color:var(--head); white-space:nowrap; }
  .sum .val.sm{ font-size:12pt; }
  .sum.is-main{ background:#fcfaf3; border-color:#e2d4a8; }
  .sum.is-main .val{ color:#8a7010; }
  .sum.is-cashout{ border-top-color:var(--cashout); }
  .sum.is-cashout .val{ color:var(--cashout); }
  table.rpt{
    width:100%; table-layout:fixed; page-break-inside:auto;
    border-collapse:separate; border-spacing:0;
    border:1px solid #e5e0d0;
  }
  table.rpt thead{ display:table-header-group !important; }
  table.rpt tfoot{ display:table-row-group; }
  table.rpt th{
    background:var(--head); color:#f8fafc; font-size:7.5pt; font-weight:800;
    letter-spacing:.05em; text-transform:uppercase; text-align:left;
    padding:7px 6px; border:0; border-right:1px solid #2a2a2a;
    border-bottom:2px solid var(--gold-line); vertical-align:middle;
  }
  table.rpt th:last-child{ border-right:0; }
  table.rpt td{
    padding:6px 6px; border:0; border-right:1px solid #e5e0d0; border-bottom:1px solid #e5e0d0;
    vertical-align:top; font-size:9pt; color:var(--ink);
    overflow-wrap:break-word; word-break:normal;
    page-break-inside:avoid !important; break-inside:avoid !important;
  }
  table.rpt td:last-child{ border-right:0; }
  table.rpt th.num, table.rpt td.num{ text-align:right; white-space:nowrap !important; }
  table.rpt td.num{ font-size:9.5pt; font-weight:800; font-variant-numeric:tabular-nums; color:var(--head); }
  table.rpt td.num.is-cashout{ color:var(--cashout); }
  table.rpt .col-date{ width:22%; white-space:nowrap; }
  table.rpt .col-num{ width:18%; }
  table.rpt .col-note{ width:40%; }
  table.rpt .col-user{ width:20%; }
  table.rpt td.is-gold-user{ color:#8a7010; font-weight:800; }
  table.rpt tbody.txn:nth-of-type(even) td{ background:#fafaf8; }
  table.rpt tbody.txn,
  table.rpt tbody.sub,
  table.rpt tbody.txn tr,
  table.rpt tbody.sub tr,
  table.rpt tfoot,
  table.rpt tfoot tr{
    page-break-inside:avoid !important;
    break-inside:avoid-page !important;
  }
  table.rpt tbody.txn.brk,
  table.rpt tbody.sub.brk{
    break-before:page !important;
    page-break-before:always !important;
  }
  table.rpt tfoot td{
    font-weight:800; background:#F7F1DE;
    border-top:2px solid var(--gold-line); border-bottom:2px solid var(--gold-line);
    font-size:9pt; padding:7px 6px; color:var(--ink);
  }
  table.rpt .empty{ text-align:center; color:var(--muted); padding:14px; }
  .keep{ page-break-inside:avoid; break-inside:avoid; }
  .insight{
    display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:8px 0 4px;
  }
  .insight article{
    border:1px solid var(--line); border-top:2px solid var(--gold-line);
    background:#fff; padding:6px 9px;
  }
  .insight .lbl{
    display:block; font-size:7pt; font-weight:800; letter-spacing:.1em;
    text-transform:uppercase; color:var(--muted); margin-bottom:2px;
  }
  .insight strong{ display:block; font-size:9.5pt; color:var(--head); line-height:1.25; }
  .insight p{ margin:2px 0 0; font-size:8pt; color:var(--muted); font-weight:600; }
  .insight .amt{ color:var(--cashout); font-weight:800; font-size:9pt; }
  .audit-note{
    margin:6px 0 4px; padding:0; border:0; background:transparent;
    font-size:7pt; color:var(--muted); line-height:1.35;
  }
  .sign{
    margin-top:auto; padding-top:10px; padding-bottom:8px;
    display:grid; grid-template-columns:1fr 1.2fr; gap:18px 24px;
    break-inside:avoid; page-break-inside:avoid;
    break-after:avoid; page-break-after:avoid;
  }
  .sign .box{ text-align:center; }
  .sign .who{ font-size:9pt; font-weight:700; color:var(--ink); }
  .sign .role{ margin-top:2px; font-size:7pt; font-weight:800; letter-spacing:.12em; color:var(--muted); text-transform:uppercase; }
  .sign .stage{
    position:relative; height:28mm; width:100%; max-width:52mm; margin:2px auto 6px;
  }
  .sign .stage.is-empty{ height:24mm; }
  .sign .stamp{
    position:absolute; left:38%; top:44%;
    width:40mm; height:23mm;
    transform:translate(-50%, -50%) rotate(-6deg);
    opacity:.70; z-index:1; pointer-events:none;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .sign .stamp svg{ width:100%; height:100%; display:block; overflow:visible; }
  .sign .ttd{
    position:absolute; left:58%; top:52%;
    width:48mm; transform:translate(-38%, -50%);
    z-index:2; pointer-events:none;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .sign .ttd img{
    width:100%; height:auto; max-height:22mm;
    object-fit:contain; object-position:center;
    display:block;
  }
  .sign .name{ font-size:9.5pt; font-weight:800; color:var(--head); }
  .sign .line{ margin:4px auto 0; width:68%; border-top:1px solid #8e9aab; }
  .sign .job{ margin-top:3px; font-size:7.5pt; font-weight:800; letter-spacing:.14em; color:var(--muted); text-transform:uppercase; }
  .foot{
    position:fixed; left:0; right:0; bottom:6mm; width:100%;
    margin:0; padding:2px 14mm 0; border-top:1.5px solid var(--gold-line);
    display:grid; grid-template-columns:1.1fr 1.2fr 1fr; gap:8px; align-items:end;
    font-size:7pt; color:var(--muted); background:#fff; height:10mm;
    break-after:avoid; page-break-after:avoid;
  }
  .foot b{ display:block; color:var(--head); font-size:7.5pt; }
  .foot .c{ text-align:center; }
  .foot .r{ text-align:right; }
  @media print{
    .no-print{ display:none !important; }
    html,body{ height:auto !important; min-height:0 !important; padding:0 !important; }
    body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet{ break-after:auto; page-break-after:auto; }
    thead{ display:table-header-group; }
  }
  @media screen{
    body{ padding:16px 16px 28px; background:#f3f1ea; }
    .sheet{ background:#fff; padding:16px 18px 18px; box-shadow:0 8px 28px rgba(17,17,17,.12); }
  }
${allCss}`;
    },

    /**
     * Print PDF — presentation only dari data Cash Out yang sudah di-load.
     * Struktur master Arus Kas. Warna tema Cash Out (hitam / emas / merah).
     * Tidak mengubah nilai / formula / query.
     */
    async printPdf(){
        if(!this.rows.length){
            alert("Tidak ada data Cash Out untuk dicetak pada filter aktif.");
            return;
        }

        const filter = this.getActiveFilter();
        const isAll = Boolean(filter.allCabang);
        const cabang = isAll
            ? "Semua Cabang"
            : this.shortCabangName(filter.cabang?.nama_cabang || "—");
        const periode = this.printPeriodeLabel(filter);
        const clock = this.getPrintClock();
        const logoSrc = await this.resolvePrintLogoSrc();
        const sigSrc = await this.resolvePrintOwnerSignatureSrc();
        const totalLabel = this.formatRupiah(this.totalCashOut);
        const countLabel = String(this.rows.filter((r) => r.nominal != null).length);
        const filename = `CashOut_${cabang.replace(/\s+/g, "_")}_${filter.start}_${filter.end}`;

        const oneBodyRows = this.rows.map((r, i) => this.buildPrintTxnRow(r, i > 0 ? this.rows[i - 1] : null)).join("");
        const insightHtml = this.buildPrintInsightHtml();
        const signHtml = this.buildPrintSignBlock(sigSrc);
        const tablesHtml = isAll
            ? this.buildAllCabangPrintTables()
            : `<table class="rpt">
      <thead>
        <tr>
          <th class="col-date">Tanggal</th>
          <th class="num">Nominal</th>
          <th class="col-note">Keterangan Cash Out</th>
          <th class="col-user">Kasir / User</th>
        </tr>
      </thead>
      ${oneBodyRows}
      <tfoot>
        <tr>
          <td>Grand Total</td>
          <td class="num is-cashout">${this.escapeHtml(totalLabel)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>`;

        const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Cash Out — ERP VAX WIJAYA</title>
<style>${this.getCashOutPrintBaseCss(isAll)}</style></head><body class="${isAll ? "is-all" : "is-one"}">
  <footer class="foot" aria-hidden="true">
    <div><b>ERP VAX WIJAYA</b>CASH OUT</div>
    <div class="c">INTERNAL / CONFIDENTIAL<br>Generated automatically</div>
    <div class="r">${this.escapeHtml(clock.dateLabel)}<br>${this.escapeHtml(clock.timeLabel)}</div>
  </footer>
  <div class="sheet">
    <header class="head">
      <div class="brand">
        ${logoSrc ? `<img src="${logoSrc}" alt="ERP VAX WIJAYA" />` : ""}
        <div class="copy">
          <h1>ERP VAX WIJAYA</h1>
          <div class="doc">CASH OUT</div>
          <div class="sys">Enterprise Management System</div>
        </div>
      </div>
      <div class="head-right">
        <div class="mark">Dokumen Keuangan<em>Internal</em></div>
      </div>
    </header>
    <div class="rule"></div>
    <div class="title-wrap">
      <div class="t1">LAPORAN CASH OUT</div>
      <p class="sub">Rincian pengeluaran Minutes · sesuai filter aktif.</p>
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
      <div class="sum is-cashout"><span class="lbl">Total Cash Out</span><span class="val sm">${this.escapeHtml(totalLabel)}</span></div>
      <div class="sum"><span class="lbl">Jumlah Transaksi</span><span class="val sm">${this.escapeHtml(countLabel)}</span></div>
      <div class="sum"><span class="lbl">Cabang</span><span class="val sm">${this.escapeHtml(cabang)}</span></div>
      <div class="sum is-main"><span class="lbl">Periode</span><span class="val sm">${this.escapeHtml(periode)}</span></div>
    </section>
    ${tablesHtml}
    ${insightHtml}
    <p class="audit-note keep">TOTAL memakai Σ cash_out Minutes (sumber KPI). Baris detail = keterangan Minutes yang sudah di-load. Rumus dan sumber tidak diubah.</p>
    ${signHtml}
  </div>
  <p class="no-print"><button type="button" onclick="window.print()">Print / PDF</button></p>
  <script>
    document.title = ${JSON.stringify(filename)};
    ${this.getCashOutPrintPagerScript()}
    window.addEventListener("beforeprint", coPreparePrint);
    window.onload = function(){
      coPreparePrint();
      setTimeout(function(){ window.print(); }, 220);
    };
  <\/script>
</body></html>`;

        const w = window.open("", "_blank");
        if(!w){
            alert("Popup diblokir — izinkan popup untuk Print PDF.");
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
    },

    renderEmpty(){
        const table = document.getElementById("cashOutTable");
        const empty = document.getElementById("cashOutEmpty");
        const insight = document.getElementById("cashOutInsight");
        if(table) table.hidden = true;
        if(empty) empty.hidden = false;
        if(insight) insight.hidden = true;
        this.renderRanggaAudit();
    },

    render(filter, warnings){
        const cabangName = this.shortCabangName(filter.cabang?.nama_cabang || "—").toUpperCase();
        const periodeLabel = this.periodeLabel(filter);

        const heading = document.getElementById("cashOutHeading");
        const sub = document.getElementById("cashOutSub");
        if(heading) heading.textContent = `CASH OUT — ${cabangName} — ${String(periodeLabel).toUpperCase()}`;
        if(sub) sub.textContent = "Rincian asli Minutes · daily_recap_source";

        const setText = (id, v) => {
            const el = document.getElementById(id);
            if(el) el.textContent = v;
        };

        setText("cashOutTotal", this.formatRupiah(this.totalCashOut));
        setText("cashOutCount", String(this.rows.filter((r) => r.nominal != null).length));
        setText("cashOutCabangLabel", this.shortCabangName(filter.cabang?.nama_cabang || "—"));
        setText("cashOutPeriodeLabel", periodeLabel);

        // Header context (display only)
        const hCabang = document.getElementById("erpHeaderCabang");
        const hPeriode = document.getElementById("erpHeaderPeriode");
        const hTitle = document.getElementById("erpHeaderTitle");
        const hSub = document.getElementById("erpHeaderSub");
        if(hTitle) hTitle.textContent = "Cash Out";
        if(hSub) hSub.textContent = `${cabangName} · ${periodeLabel}`;
        if(hCabang) hCabang.textContent = this.shortCabangName(filter.cabang?.nama_cabang || "—");
        if(hPeriode) hPeriode.textContent = periodeLabel;

        if(warnings?.length){
            this.showBanner(warnings.join(" · "), false);
        }

        const table = document.getElementById("cashOutTable");
        const empty = document.getElementById("cashOutEmpty");
        const tbody = document.getElementById("cashOutTbody");
        const footTotal = document.getElementById("cashOutFootTotal");
        const footNote = document.getElementById("cashOutFootNote");

        if(!this.rows.length && this.totalCashOut > 0){
            if(table) table.hidden = true;
            if(empty){
                empty.hidden = false;
                empty.textContent = "Total Cash Out ada, tetapi baris detail tidak dapat ditampilkan.";
            }
            setText("cashOutCount", "0");
            if(footTotal) footTotal.textContent = this.formatRupiah(this.totalCashOut);
            this.renderInsights([]);
            this.renderRanggaAudit();
            return;
        }

        const summaries = this.buildMonthCalendarSummaries(this.rows, filter);
        if(!summaries.length){
            if(table) table.hidden = true;
            if(empty){
                empty.hidden = false;
                empty.textContent = "Tidak ada Cash Out pada filter aktif.";
            }
            setText("cashOutCount", String(this.rows.filter((r) => r.nominal != null).length));
            if(footTotal) footTotal.textContent = this.formatRupiah(this.totalCashOut);
            this.renderInsights(this.rows);
            this.renderRanggaAudit();
            return;
        }

        if(empty) empty.hidden = true;
        if(table) table.hidden = false;

        if(tbody){
            tbody.innerHTML = summaries.map((g) => {
                if(g.empty || !g.details.length){
                    return `<tr class="cashout-empty-day">
                    <td>${this.escapeHtml(this.formatTanggal(g.tanggal))}</td>
                    <td class="cashout-muted">—</td>
                    <td class="cashout-nominal is-zero">${this.escapeHtml(this.formatRupiah(0))}</td>
                    <td class="cashout-ket cashout-muted">Tidak ada Cash Out</td>
                    <td class="cashout-muted">-</td>
                </tr>`;
                }

                /* 1 transaksi: 1 row lengkap, tanpa expand / child identik */
                if(g.details.length === 1){
                    const r = g.details[0];
                    const gold = this.isGoldKasirRow(r);
                    const goldClass = gold ? " is-gold-user" : "";
                    return `<tr class="cashout-single-day">
                    <td>${this.escapeHtml(this.formatTanggal(g.tanggal))}</td>
                    <td class="cashout-muted">—</td>
                    <td class="cashout-nominal">${r.nominal == null ? "—" : this.escapeHtml(this.formatRupiah(r.nominal))}</td>
                    <td class="cashout-ket${goldClass}">${this.escapeHtml(r.keterangan || "—")}</td>
                    <td${gold ? ' class="is-gold-user"' : ""}>${r.kasir ? this.escapeHtml(r.kasir) : '<span class="cashout-muted">—</span>'}</td>
                </tr>`;
                }

                const open = this.expandedDates.has(g.key);
                const sumRow = `<tr class="cashout-sum-row${open ? " is-open" : ""}" data-cashout-sum="${this.escapeHtml(g.key)}" tabindex="0" role="button" aria-expanded="${open ? "true" : "false"}">
                    <td>
                        <span class="cashout-exp-caret" aria-hidden="true"></span>
                        ${this.escapeHtml(this.formatTanggal(g.tanggal))}
                    </td>
                    <td class="cashout-muted">—</td>
                    <td class="cashout-nominal">${this.escapeHtml(this.formatRupiah(g.nominal))}</td>
                    <td class="cashout-ket">${this.escapeHtml(g.keterangan)}</td>
                    <td>${this.formatKasirSummaryHtml(g.kasirNames)}</td>
                </tr>`;
                const detailRows = g.details.map((r) => {
                    const gold = this.isGoldKasirRow(r);
                    const goldClass = gold ? " is-gold-user" : "";
                    return `<tr class="cashout-detail-row" data-cashout-detail="${this.escapeHtml(g.key)}"${open ? "" : " hidden"}>
                    <td class="cashout-detail-pad"></td>
                    <td class="cashout-muted">—</td>
                    <td class="cashout-nominal">${r.nominal == null ? "—" : this.escapeHtml(this.formatRupiah(r.nominal))}</td>
                    <td class="cashout-ket${goldClass}">${this.escapeHtml(r.keterangan || "—")}</td>
                    <td${gold ? ' class="is-gold-user"' : ""}>${r.kasir ? this.escapeHtml(r.kasir) : '<span class="cashout-muted">—</span>'}</td>
                </tr>`;
                }).join("");
                return sumRow + detailRows;
            }).join("");
        }

        // Footer TOTAL = cash_out resmi (KPI), bukan hasil tebakan
        if(footTotal) footTotal.textContent = this.formatRupiah(this.totalCashOut);
        if(footNote){
            const lineSum = this.rows.reduce((t, r) => t + Number(r.nominal || 0), 0);
            footNote.textContent = Math.abs(lineSum - this.totalCashOut) <= 1
                ? "Σ baris = total Minutes"
                : "TOTAL = Σ cash_out Minutes (sumber KPI)";
        }

        this.renderInsights(this.rows);
        this.renderRanggaAudit();
    }
};

window.CashOutDetail = CashOutDetail;
