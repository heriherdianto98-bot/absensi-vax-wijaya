/*
=========================================================
VAX ERP — Tabel Arus Kas (Kas Fisik Cabang)
RESTORE + ROOT FIX PERSISTENCE — 11 Agu 2026
=========================================================
SOURCE MAP:
- Saldo Awal   = arus_kas_saldo_awal (seed Owner + tanggal efektif)
- Cash In      = daily_recap_source.cash_payment
- Non Tunai    = daily_recap_source.non_cash (informasi, tidak masuk kas fisik)
- Cash Out     = daily_recap_source.cash_out
- Setoran      = setoran_3_harian.setoran_cash_actual
- Saldo Akhir  = Saldo Awal + Cash In - Cash Out - Setoran
- Arus Bersih  = Cash In - Cash Out - Setoran

Tanpa seed cabang => transaksi tetap otomatis berjalan dari Rp0; seed hanya koreksi saldo awal.
Floating dikecualikan. Scope = cabang operasional.
=========================================================
*/

"use strict";

const ArusKas = {
    TABLE_SEED: "arus_kas_saldo_awal",
    TABLE_SOURCE: "daily_recap_source",
    TABLE_SETORAN: "setoran_3_harian",
    TABLE_CABANG: "cabang",
    TABLE_KAS_UTAMA: "arus_kas_utama",

    HANDOFF_KEY: "vax_kpi_drilldown",
    FILTER_KEY: "vax_aruskas_filter",
    GLOBAL_CABANG_FILTER_KEY: "vax_setoran3_filter",

    SETORAN_STATUS_OK: [
        "MENUNGGU APPROVAL OWNER",
        "CLEAR",
        "PERLU TINDAK LANJUT"
    ],

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

    PERIODE_LABEL: {
        hariini: "Hari Ini",
        kemarin: "Kemarin",
        "7hari": "7 Hari",
        "30hari": "30 Hari",
        bulanini: "Bulan Ini",
        tahunini: "Tahun Ini",
        customtanggal: "Custom Tanggal"
    },

    MONTH_ID: [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ],

    MONTH_SHORT: [
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
    ],

    cabangList: [],
    seeds: [],
    dailyRows: [],
    viewRows: [],
    summary: null,
    loading: false,
    _bound: false,
    lastCrossCheck: null,
    kasUtamaRows: [],
    _rangeOpen: false,
    _rangeDraftStart: null,
    _rangeDraftEnd: null,
    _rangeViewYear: null,
    _rangeViewMonth: null,
    _seedCalYear: null,
    _seedCalMonth: null,

    async boot(){
        try{
            await this.mountUi();
            this.mountKasUtamaUi();
            this.bindEvents();
            await this.loadCabangOptions();
            this.restoreFiltersFromHandoffOrStorage();
            this.syncRangeLabel();
            this.syncSeedDateLabel();
            this.syncOwnerSeedPanel();
            await this.loadSeeds();
            await this.load();
        }catch(err){
            console.error("ArusKas.boot:", err);
            this.showBanner(err?.message || "Gagal membuka modul Arus Kas.", "error");
        }
    },

    async mountUi(){
        const host = document.getElementById("arusKasRoot");
        if(!host) return;
        if(host.dataset.mounted === "1") return;
        const res = await fetch("../components/arus-kas.html", { cache: "no-store" });
        if(!res.ok) throw new Error("Gagal memuat komponen Arus Kas");
        host.innerHTML = await res.text();
        host.dataset.mounted = "1";
    },

    isOwner(){
        try{
            return typeof OwnerAuth !== "undefined" && OwnerAuth.isOwnerRole(OwnerAuth.profile?.role);
        }catch(_e){
            return false;
        }
    },

    syncOwnerSeedPanel(){
        const panel = document.getElementById("arusKasSeedPanel");
        if(panel) panel.hidden = !this.isOwner();
    },

    bindEvents(){
        if(this._bound) return;
        this._bound = true;

        document.addEventListener("input", (e) => {
            if(e.target?.id === "arusKasSeedNominal" || e.target?.id === "arusKasUtamaNominal") this.handleSeedNominalInput(e.target);
        });

        document.addEventListener("change", (e) => {
            const id = e.target?.id;
            if(id === "arusKasPeriode"){
                this.syncCustomVisibility();
                if(e.target.value !== "customtanggal"){
                    this.persistFilters();
                    this.load();
                }
                return;
            }
            if(id === "arusKasCabang" || id === "arusKasRekapMode"){
                if(id === "arusKasCabang") this.syncSeedCabangWithActive();
                this.persistFilters();
                this.load();
            }
        });

        document.addEventListener("click", (e) => {
            if(e.target.closest("#arusKasApply")){
                this.persistFilters();
                this.load();
                return;
            }
            if(e.target.closest("#arusKasRefresh")){
                this.loadSeeds().then(() => this.load());
                return;
            }
            if(e.target.closest("#arusKasPrintPdf")){
                this.printPdf();
                return;
            }
            if(e.target.closest("#arusKasSeedSave")){
                this.saveSeed();
                return;
            }
            if(e.target.closest("#arusKasUtamaOpen")){
                this.openKasUtama();
                return;
            }
            if(e.target.closest("#arusKasUtamaClose")){
                this.closeKasUtama();
                return;
            }
            if(e.target.closest("#arusKasUtamaSave")){
                this.saveKasUtama();
                return;
            }
            const mainDel = e.target.closest("[data-arus-utama-del]");
            if(mainDel){
                this.deleteKasUtama(mainDel.getAttribute("data-arus-utama-del"));
                return;
            }
            const del = e.target.closest("[data-arus-seed-del]");
            if(del){
                this.deleteSeed(del.getAttribute("data-arus-seed-del"));
                return;
            }
            if(e.target.closest("#arusKasRangeTrigger")){
                this.toggleRangePopup();
                return;
            }
            if(e.target.closest("#arusKasRangePrev")){
                this.shiftRangeMonth(-1);
                return;
            }
            if(e.target.closest("#arusKasRangeNext")){
                this.shiftRangeMonth(1);
                return;
            }
            if(e.target.closest("#arusKasRangeClose")){
                this.closeRangePopup(false);
                return;
            }
            if(e.target.closest("#arusKasRangeClear")){
                this.clearRangeDraft();
                return;
            }
            const rangeDay = e.target.closest("[data-aruskas-day]");
            if(rangeDay){
                this.pickRangeDay(rangeDay.getAttribute("data-aruskas-day"));
                return;
            }
            if(e.target.closest("[data-aruskas-seed-cal-close]")){
                this.closeSeedCalendar();
                return;
            }
            if(e.target.closest("#arusKasSeedDateBtn")){
                this.openSeedCalendar();
                return;
            }
            if(e.target.closest("#arusKasSeedCalPrev")){
                this.shiftSeedCalendarMonth(-1);
                return;
            }
            if(e.target.closest("#arusKasSeedCalNext")){
                this.shiftSeedCalendarMonth(1);
                return;
            }
            if(e.target.closest("#arusKasSeedCalToday")){
                this.pickSeedDate(this.todayWib());
                return;
            }
            const seedDay = e.target.closest("[data-aruskas-seed-day]");
            if(seedDay){
                this.pickSeedDate(seedDay.getAttribute("data-aruskas-seed-day"));
                return;
            }
            if(this._rangeOpen){
                const wrap = document.getElementById("arusKasRangeWrap");
                if(wrap && !wrap.contains(e.target)) this.closeRangePopup(false);
            }
        });

        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape"){
                if(this._rangeOpen) this.closeRangePopup(false);
                else this.closeSeedCalendar();
            }
        });
    },

    todayWib(){
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
    },

    addDaysIso(iso, delta){
        const p = String(iso || "").slice(0, 10).split("-").map(Number);
        if(p.length !== 3 || !p[0]) return iso;
        const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
        dt.setUTCDate(dt.getUTCDate() + Number(delta || 0));
        return dt.toISOString().slice(0, 10);
    },

    eachDate(start, end){
        const out = [];
        let cur = String(start || "").slice(0, 10);
        const last = String(end || "").slice(0, 10);
        if(!cur || !last || cur > last) return out;
        while(cur <= last){
            out.push(cur);
            cur = this.addDaysIso(cur, 1);
        }
        return out;
    },

    normalizePeriode(raw){
        const v = String(raw || "").toLowerCase();
        return this.PERIODE_LABEL[v] ? v : "bulanini";
    },

    getPeriodeRange(periode, customStart, customEnd){
        const today = this.todayWib();
        switch(String(periode || "").toLowerCase()){
            case "kemarin": {
                const d = this.addDaysIso(today, -1);
                return { start: d, end: d };
            }
            case "7hari": return { start: this.addDaysIso(today, -6), end: today };
            case "30hari": return { start: this.addDaysIso(today, -29), end: today };
            case "bulanini": {
                const [y, m] = today.split("-");
                return { start: `${y}-${m}-01`, end: today };
            }
            case "tahunini": return { start: `${today.slice(0, 4)}-01-01`, end: today };
            case "customtanggal": {
                const s = String(customStart || "").slice(0, 10);
                const e = String(customEnd || "").slice(0, 10);
                if(s && e && s <= e) return { start: s, end: e };
                return { start: today, end: today };
            }
            case "hariini":
            default: return { start: today, end: today };
        }
    },

    syncCustomVisibility(){
        const periode = document.getElementById("arusKasPeriode")?.value;
        const wrap = document.getElementById("arusKasRangeWrap");
        const show = periode === "customtanggal";
        if(wrap) wrap.hidden = !show;
        if(!show) this.closeRangePopup(false);
        this.syncRangeLabel();
    },

    formatRangeDisplay(iso){
        const p = String(iso || "").slice(0, 10).split("-");
        if(p.length !== 3 || !p[0]) return "—";
        return `${p[2]}/${p[1]}/${p[0]}`;
    },

    syncRangeLabel(){
        const start = document.getElementById("arusKasStart")?.value || "";
        const end = document.getElementById("arusKasEnd")?.value || "";
        const label = document.getElementById("arusKasRangeLabel");
        if(label) label.textContent = start && end
            ? `${this.formatRangeDisplay(start)} → ${this.formatRangeDisplay(end)}`
            : "Pilih rentang tanggal";
    },

    toggleRangePopup(){
        if(this._rangeOpen) this.closeRangePopup(false);
        else this.openRangePopup();
    },

    openRangePopup(){
        const popup = document.getElementById("arusKasRangePopup");
        const trigger = document.getElementById("arusKasRangeTrigger");
        if(!popup) return;
        const start = document.getElementById("arusKasStart")?.value || "";
        const end = document.getElementById("arusKasEnd")?.value || "";
        this._rangeDraftStart = start || null;
        this._rangeDraftEnd = end || null;
        const parts = (start || this.todayWib()).split("-").map(Number);
        this._rangeViewYear = parts[0];
        this._rangeViewMonth = (parts[1] || 1) - 1;
        this._rangeOpen = true;
        popup.hidden = false;
        trigger?.setAttribute("aria-expanded", "true");
        this.renderRangeCalendar();
    },

    closeRangePopup(commit){
        const popup = document.getElementById("arusKasRangePopup");
        const trigger = document.getElementById("arusKasRangeTrigger");
        this._rangeOpen = false;
        if(popup) popup.hidden = true;
        trigger?.setAttribute("aria-expanded", "false");
        if(commit !== false) this.syncRangeLabel();
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
        if(!this._rangeDraftStart || this._rangeDraftEnd){
            this._rangeDraftStart = day;
            this._rangeDraftEnd = null;
            this.renderRangeCalendar();
            return;
        }
        let start = this._rangeDraftStart;
        let end = day;
        if(end < start) [start, end] = [end, start];
        this._rangeDraftStart = start;
        this._rangeDraftEnd = end;
        const s = document.getElementById("arusKasStart");
        const e = document.getElementById("arusKasEnd");
        if(s) s.value = start;
        if(e) e.value = end;
        this.syncRangeLabel();
        this.renderRangeCalendar();
        this.closeRangePopup(true);
    },

    renderRangeCalendar(){
        const grid = document.getElementById("arusKasRangeGrid");
        const monthEl = document.getElementById("arusKasRangeMonth");
        const draftStartEl = document.getElementById("arusKasRangeDraftStart");
        const draftEndEl = document.getElementById("arusKasRangeDraftEnd");
        const hintEl = document.getElementById("arusKasRangeHint");
        if(!grid) return;
        const y = this._rangeViewYear;
        const m = this._rangeViewMonth;
        if(monthEl) monthEl.textContent = `${this.MONTH_ID[m]} ${y}`;
        if(draftStartEl) draftStartEl.textContent = this._rangeDraftStart ? this.formatRangeDisplay(this._rangeDraftStart) : "—";
        if(draftEndEl) draftEndEl.textContent = this._rangeDraftEnd ? this.formatRangeDisplay(this._rangeDraftEnd) : "—";
        if(hintEl) hintEl.textContent = (!this._rangeDraftStart || this._rangeDraftEnd)
            ? "Pilih tanggal mulai, lalu tanggal akhir."
            : "Pilih tanggal akhir untuk menyelesaikan range.";

        const first = new Date(Date.UTC(y, m, 1, 12));
        const weekdayMon0 = (first.getUTCDay() + 6) % 7;
        const daysInMonth = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
        const today = this.todayWib();
        const start = this._rangeDraftStart;
        const end = this._rangeDraftEnd;
        let html = "";
        for(let i = 0; i < weekdayMon0; i++) html += '<span class="aruskas-day is-empty"></span>';
        for(let d = 1; d <= daysInMonth; d++){
            const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const cls = ["aruskas-day"];
            if(iso === today) cls.push("is-today");
            if(start && iso === start) cls.push("is-start");
            if(end && iso === end) cls.push("is-end");
            if(start && end && iso > start && iso < end) cls.push("is-in-range");
            if(start && !end && iso === start) cls.push("is-picking");
            html += `<button type="button" class="${cls.join(" ")}" data-aruskas-day="${iso}">${d}</button>`;
        }
        grid.innerHTML = html;
    },

    syncSeedDateLabel(){
        const label = document.getElementById("arusKasSeedDateLabel");
        const val = String(document.getElementById("arusKasSeedTanggal")?.value || "").slice(0, 10);
        if(label) label.textContent = val ? this.formatRangeDisplay(val) : "Pilih tanggal";
    },

    openSeedCalendar(){
        const modal = document.getElementById("arusKasSeedCalModal");
        if(!modal) return;
        const val = String(document.getElementById("arusKasSeedTanggal")?.value || this.todayWib()).slice(0, 10);
        const parts = val.split("-").map(Number);
        this._seedCalYear = parts[0] || new Date().getFullYear();
        this._seedCalMonth = (parts[1] || 1) - 1;
        this.renderSeedCalendar();
        modal.hidden = false;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("custom-cal-open");
    },

    closeSeedCalendar(){
        const modal = document.getElementById("arusKasSeedCalModal");
        if(!modal) return;
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("custom-cal-open");
    },

    shiftSeedCalendarMonth(delta){
        this._seedCalMonth += Number(delta || 0);
        if(this._seedCalMonth < 0){ this._seedCalMonth = 11; this._seedCalYear -= 1; }
        else if(this._seedCalMonth > 11){ this._seedCalMonth = 0; this._seedCalYear += 1; }
        this.renderSeedCalendar();
    },

    renderSeedCalendar(){
        const label = document.getElementById("arusKasSeedCalMonthLabel");
        const days = document.getElementById("arusKasSeedCalDays");
        if(!days) return;
        if(label) label.textContent = `${this.MONTH_ID[this._seedCalMonth]} ${this._seedCalYear}`;
        const first = new Date(this._seedCalYear, this._seedCalMonth, 1);
        const startPad = (first.getDay() + 6) % 7;
        const dim = new Date(this._seedCalYear, this._seedCalMonth + 1, 0).getDate();
        const selected = String(document.getElementById("arusKasSeedTanggal")?.value || "").slice(0, 10);
        const today = this.todayWib();
        let html = "";
        for(let i = 0; i < startPad; i++) html += '<span class="cal-day is-empty" aria-hidden="true"></span>';
        for(let day = 1; day <= dim; day++){
            const iso = `${this._seedCalYear}-${String(this._seedCalMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const classes = ["cal-day"];
            if(iso === selected) classes.push("is-selected");
            if(iso === today) classes.push("is-today");
            html += `<button type="button" class="${classes.join(" ")}" data-aruskas-seed-day="${iso}">${day}</button>`;
        }
        days.innerHTML = html;
    },

    pickSeedDate(iso){
        const el = document.getElementById("arusKasSeedTanggal");
        if(el) el.value = String(iso || "").slice(0, 10);
        this.syncSeedDateLabel();
        this.closeSeedCalendar();
    },

    formatDisplayDateId(iso){
        const p = String(iso || "").slice(0, 10).split("-").map(Number);
        if(p.length !== 3 || !p[0]) return String(iso || "") || "—";
        return `${String(p[2]).padStart(2, "0")} ${this.MONTH_SHORT[p[1] - 1]} ${p[0]}`;
    },

    formatHeaderPeriode(filter){
        const f = filter || this.getActiveFilter();
        if(f.periode !== "customtanggal") return this.PERIODE_LABEL[f.periode] || f.periode;
        const s = String(f.start || "").slice(0, 10);
        const e = String(f.end || "").slice(0, 10);
        if(s && e && s === e) return this.formatDisplayDateId(s);
        if(s.slice(0, 4) && s.slice(0, 4) === e.slice(0, 4)){
            const left = this.formatDisplayDateId(s).replace(/\s+\d{4}$/, "");
            return `${left} — ${this.formatDisplayDateId(e)}`;
        }
        return `${this.formatDisplayDateId(s)} — ${this.formatDisplayDateId(e)}`;
    },

    syncHeaderContext(filter){
        const f = filter || this.getActiveFilter();
        const cabangEl = document.getElementById("erpHeaderCabang");
        const periodeEl = document.getElementById("erpHeaderPeriode");
        const hTitle = document.getElementById("erpHeaderTitle");
        const hSub = document.getElementById("erpHeaderSub");
        const cabangOpt = document.getElementById("arusKasCabang")?.selectedOptions?.[0];
        const cabangName = cabangOpt ? cabangOpt.textContent.trim() : this.shortCabangName(f.cabang?.nama_cabang || "—");
        const periodeLabel = this.formatHeaderPeriode(f);
        if(cabangEl) cabangEl.textContent = cabangName || "—";
        if(periodeEl) periodeEl.textContent = periodeLabel || "—";
        if(hTitle) hTitle.textContent = "Arus Kas";
        if(hSub) hSub.textContent = `${cabangName} · ${periodeLabel}`;
        if(typeof syncSidebarRoleMeta === "function") syncSidebarRoleMeta();
    },

    shortCabangName(nama){
        return String(nama || "")
            .replace(/\bVax\s+Wijiaya\b/gi, "")
            .replace(/\bVax\s+Wijaya\b/gi, "")
            .replace(/\s+/g, " ")
            .trim() || String(nama || "-");
    },

    cabangMatchOrderIndex(nama){
        const n = String(nama || "").toLowerCase();
        for(let i = 0; i < this.CABANG_ORDER.length; i++){
            if(this.CABANG_ORDER[i].aliases.some((a) => n.includes(a))) return i;
        }
        return 999;
    },

    filterOperationalCabang(list){
        return (list || [])
            .filter((c) => {
                if(c.aktif === false) return false;
                if(!String(c.nama_minutes || "").trim()) return false;
                if(String(c.nama_cabang || "").toLowerCase().includes("floating")) return false;
                return true;
            })
            .sort((a, b) => {
                const oa = this.cabangMatchOrderIndex(a.nama_cabang);
                const ob = this.cabangMatchOrderIndex(b.nama_cabang);
                if(oa !== ob) return oa - ob;
                return String(a.nama_cabang || "").localeCompare(String(b.nama_cabang || ""), "id");
            });
    },

    async loadCabangOptions(){
        const sel = document.getElementById("arusKasCabang");
        const seedSel = document.getElementById("arusKasSeedCabang");
        if(typeof db === "undefined") return;

        let data = [];
        try{
            const res = await db
                .from(this.TABLE_CABANG)
                .select("id,nama_cabang,aktif,nama_minutes")
                .order("nama_cabang");
            if(res.error) throw res.error;
            data = this.filterOperationalCabang(res.data || []);
        }catch(err){
            console.error("ArusKas cabang:", err);
        }

        this.cabangList = data;
        const opts = data.map((c) => `<option value="${c.id}">${this.escapeHtml(this.shortCabangName(c.nama_cabang))}</option>`).join("");
        if(sel) sel.innerHTML = opts;
        if(seedSel) seedSel.innerHTML = opts;

        const seedTgl = document.getElementById("arusKasSeedTanggal");
        if(seedTgl && !seedTgl.value) seedTgl.value = this.todayWib();
        this.syncSeedDateLabel();
    },

    syncSeedCabangWithActive(){
        const cabangEl = document.getElementById("arusKasCabang");
        const seedEl = document.getElementById("arusKasSeedCabang");
        if(!cabangEl || !seedEl) return;
        const activeValue = String(cabangEl.value || "");
        const hasMatch = [...seedEl.options].some((opt) => String(opt.value) === activeValue);
        if(activeValue && hasMatch) seedEl.value = activeValue;
    },

    readJson(key){
        try{ return JSON.parse(localStorage.getItem(key) || "null"); }
        catch(_e){ return null; }
    },

    readHandoff(){ return this.readJson(this.HANDOFF_KEY); },
    readStoredFilter(){ return this.readJson(this.FILTER_KEY); },
    readGlobalCabangFilter(){ return this.readJson(this.GLOBAL_CABANG_FILTER_KEY); },

    restoreFiltersFromHandoffOrStorage(){
        const q = new URLSearchParams(window.location.search || "");
        const stored = this.readStoredFilter() || {};
        const globalStored = this.readGlobalCabangFilter() || {};
        const handoff = this.readHandoff() || {};

        // ROOT FIX: modul Arus Kas sendiri harus menjadi sumber persistence utama.
        // Priority: URL > ArusKas stored > global cabang > handoff drilldown.
        const cabangId = q.get("cabangId") ?? stored.cabangId ?? globalStored.cabangId ?? handoff.cabangId ?? null;
        let periode = this.normalizePeriode(q.get("periode") || stored.periode || handoff.periode || "bulanini");
        let start = q.get("start") || stored.start || handoff.start || "";
        let end = q.get("end") || stored.end || handoff.end || "";
        const rekap = String(q.get("rekap") || stored.rekap || handoff.rekap || "harian").toLowerCase() === "bulanan"
            ? "bulanan" : "harian";

        if(periode === "customtanggal"){
            if(!start || !end || start > end){
                const range = this.getPeriodeRange("bulanini");
                periode = "bulanini";
                start = range.start;
                end = range.end;
            }
        }else{
            const range = this.getPeriodeRange(periode);
            start = range.start;
            end = range.end;
        }

        const cabangEl = document.getElementById("arusKasCabang");
        const periodeEl = document.getElementById("arusKasPeriode");
        const startEl = document.getElementById("arusKasStart");
        const endEl = document.getElementById("arusKasEnd");
        const rekapEl = document.getElementById("arusKasRekapMode");

        if(cabangEl){
            const opt = cabangId != null
                ? [...cabangEl.options].find((o) => String(o.value) === String(cabangId))
                : null;
            if(opt){
                cabangEl.value = String(opt.value);
            }else{
                const nameWant = String(stored.cabangName || globalStored.cabangName || handoff.cabangName || "").toLowerCase();
                const byName = nameWant ? [...cabangEl.options].find((o) => o.textContent.trim().toLowerCase().includes(nameWant)) : null;
                if(byName) cabangEl.value = byName.value;
                else if(cabangEl.options.length) cabangEl.selectedIndex = 0;
            }
        }

        if(periodeEl){
            const has = [...periodeEl.options].some((o) => o.value === periode);
            periodeEl.value = has ? periode : "bulanini";
        }
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
        if(rekapEl) rekapEl.value = rekap;

        this.syncCustomVisibility();
        this.syncRangeLabel();
        this.syncSeedCabangWithActive();
        this.persistFilters();
    },

    getActiveFilter(){
        const cabangId = Number(document.getElementById("arusKasCabang")?.value || 0) || null;
        const periode = this.normalizePeriode(document.getElementById("arusKasPeriode")?.value);
        let start = document.getElementById("arusKasStart")?.value || "";
        let end = document.getElementById("arusKasEnd")?.value || "";

        if(periode !== "customtanggal"){
            const range = this.getPeriodeRange(periode);
            start = range.start;
            end = range.end;
            const startEl = document.getElementById("arusKasStart");
            const endEl = document.getElementById("arusKasEnd");
            if(startEl) startEl.value = start;
            if(endEl) endEl.value = end;
        }else{
            const range = this.getPeriodeRange("customtanggal", start, end);
            start = range.start;
            end = range.end;
        }

        const rekap = document.getElementById("arusKasRekapMode")?.value === "bulanan" ? "bulanan" : "harian";
        const cabang = this.cabangList.find((c) => Number(c.id) === Number(cabangId)) || null;
        return { cabangId, cabang, periode, start, end, rekap };
    },

    persistFilters(){
        const f = this.getActiveFilter();
        if(!f.cabangId) return;
        try{
            const payload = {
                cabangId: f.cabangId,
                cabangName: this.shortCabangName(f.cabang?.nama_cabang || ""),
                periode: f.periode,
                start: f.start,
                end: f.end,
                rekap: f.rekap,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem(this.FILTER_KEY, JSON.stringify(payload));

            const globalSaved = this.readGlobalCabangFilter() || {};
            localStorage.setItem(this.GLOBAL_CABANG_FILTER_KEY, JSON.stringify({
                ...globalSaved,
                cabangId: payload.cabangId,
                cabangName: payload.cabangName,
                savedAt: payload.savedAt
            }));

            // Sinkronkan handoff agar tidak membawa nilai lama ketika berpindah halaman.
            const handoffSaved = this.readHandoff() || {};
            localStorage.setItem(this.HANDOFF_KEY, JSON.stringify({
                ...handoffSaved,
                cabangId: payload.cabangId,
                cabangName: payload.cabangName,
                periode: payload.periode,
                start: payload.start,
                end: payload.end,
                rekap: payload.rekap,
                savedAt: payload.savedAt
            }));
        }catch(err){
            console.warn("ArusKas.persistFilters:", err);
        }
    },

    parseRupiahInput(raw){
        const s = String(raw || "").trim().replace(/rp/gi, "").replace(/\s/g, "");
        if(!s) return null;
        const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\./g, "");
        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
    },

    extractDigits(raw){ return String(raw || "").replace(/\D/g, ""); },

    formatRupiahInputDisplay(raw){
        const digits = this.extractDigits(raw);
        return digits ? Number(digits).toLocaleString("id-ID") : "";
    },

    setCaretAfterDigit(input, digitIndex){
        const text = String(input?.value || "");
        if(!input || typeof input.setSelectionRange !== "function") return;
        if(!text){ input.setSelectionRange(0, 0); return; }
        if(digitIndex <= 0){
            const first = text.search(/\d/);
            const pos = first >= 0 ? first : text.length;
            input.setSelectionRange(pos, pos);
            return;
        }
        let seen = 0;
        for(let i = 0; i < text.length; i++){
            if(/\d/.test(text[i])){
                seen++;
                if(seen >= digitIndex){ input.setSelectionRange(i + 1, i + 1); return; }
            }
        }
        input.setSelectionRange(text.length, text.length);
    },

    handleSeedNominalInput(input){
        if(!input) return;
        const raw = String(input.value || "");
        const start = Number(input.selectionStart || 0);
        const digitIndex = this.extractDigits(raw.slice(0, start)).length;
        const formatted = this.formatRupiahInputDisplay(raw);
        if(input.value !== formatted) input.value = formatted;
        this.setCaretAfterDigit(input, digitIndex);
    },

    formatRupiah(nilai){
        if(nilai === null || nilai === undefined || nilai === "") return "—";
        const n = Number(nilai);
        return Number.isFinite(n) ? "Rp" + n.toLocaleString("id-ID") : "—";
    },

    formatTanggal(tanggal){
        const key = String(tanggal || "").slice(0, 10);
        const p = key.split("-").map(Number);
        if(p.length !== 3 || !p[0]) return key || "—";
        const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
        return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    },

    formatMonth(ym){
        const [y, m] = String(ym || "").slice(0, 7).split("-").map(Number);
        if(!y || !m) return String(ym || "") || "—";
        const dt = new Date(Date.UTC(y, m - 1, 1, 12));
        return dt.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
    },

    escapeHtml(str){
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    periodeLabel(filter){
        if(filter.periode === "customtanggal") return `${this.formatTanggal(filter.start)} — ${this.formatTanggal(filter.end)}`;
        return this.PERIODE_LABEL[filter.periode] || filter.periode;
    },

    toast(message, type){
        if(typeof ErpToast !== "undefined" && ErpToast.show){
            ErpToast.show(message, type || "info");
            return;
        }
        const root = document.getElementById("erpToastRoot");
        if(root){
            root.hidden = false;
            const msg = root.querySelector("#erpToastMessage");
            if(msg) msg.textContent = message;
        }
    },

    showBanner(text, kind){
        const el = document.getElementById("arusKasBanner");
        const txt = document.getElementById("arusKasBannerText");
        if(!el) return;
        if(!text){
            el.hidden = true;
            if(txt) txt.textContent = "";
            el.classList.remove("is-error", "is-warn", "is-info");
            return;
        }
        el.hidden = false;
        if(txt) txt.textContent = text;
        el.classList.remove("is-error", "is-warn", "is-info");
        if(kind === "error") el.classList.add("is-error");
        else if(kind === "warn") el.classList.add("is-warn");
        else el.classList.add("is-info");
    },

    setLoading(state){
        this.loading = Boolean(state);
        const el = document.getElementById("arusKasLoading");
        if(el) el.hidden = !this.loading;
        if(this.loading){
            const table = document.getElementById("arusKasTable");
            const empty = document.getElementById("arusKasEmpty");
            if(table) table.hidden = true;
            if(empty) empty.hidden = true;
        }
    },

    mountKasUtamaUi(){
        if(!this.isOwner()) return;
        if(document.getElementById("arusKasUtamaOpen")) return;

        const printBtn = document.getElementById("arusKasPrintPdf");
        if(printBtn?.parentElement){
            const btn = document.createElement("button");
            btn.type = "button";
            btn.id = "arusKasUtamaOpen";
            btn.className = printBtn.className;
            btn.textContent = "Kas Utama";
            btn.style.cssText = "border-color:#d6aa22;color:#f2c230;box-shadow:0 0 18px rgba(242,194,48,.12);";
            printBtn.parentElement.appendChild(btn);
        }

        const root = document.getElementById("arusKasRoot");
        if(!root) return;
        const wrap = document.createElement("div");
        wrap.id = "arusKasUtamaModal";
        wrap.hidden = true;
        wrap.innerHTML = `
        <div style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:24px;">
          <section style="width:min(1120px,96vw);max-height:88vh;overflow:auto;background:linear-gradient(180deg,#111820,#090d12);border:1px solid rgba(242,194,48,.45);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.72),0 0 26px rgba(242,194,48,.12);padding:22px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;">
              <div><div style="color:#f2c230;font-size:12px;font-weight:800;letter-spacing:.12em;">OWNER · KAS UTAMA</div><h2 style="margin:5px 0 0;color:#fff;">Arus Kas Utama</h2><div style="color:#8fa0b4;margin-top:5px;">Kas pusat/Owner terpisah dari transaksi kas cabang.</div></div>
              <button id="arusKasUtamaClose" type="button" style="background:#252b34;border:1px solid #39414d;color:#fff;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer;">Tutup</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px;">
              <div style="background:#11171e;border:1px solid #303944;border-radius:14px;padding:15px;"><div style="color:#8fa0b4;font-size:11px;font-weight:800;">SALDO KAS UTAMA</div><div id="arusKasUtamaSaldo" style="color:#f2c230;font-size:28px;font-weight:900;margin-top:7px;">Rp0</div></div>
              <div style="background:#11171e;border:1px solid #303944;border-radius:14px;padding:15px;"><div style="color:#8fa0b4;font-size:11px;font-weight:800;">TOTAL TRANSAKSI</div><div id="arusKasUtamaCount" style="color:#fff;font-size:28px;font-weight:900;margin-top:7px;">0</div></div>
            </div>
            <div style="display:grid;grid-template-columns:150px 190px 210px 1fr auto;gap:10px;align-items:end;background:#0d1319;border:1px solid #27313c;border-radius:14px;padding:14px;margin-bottom:16px;">
              <label style="color:#9aabba;font-size:11px;font-weight:800;">TANGGAL<input id="arusKasUtamaTanggal" type="date" style="width:100%;margin-top:6px;background:#1b232d;border:1px solid #364250;color:#fff;border-radius:9px;padding:10px;box-sizing:border-box;"></label>
              <label style="color:#9aabba;font-size:11px;font-weight:800;">JENIS<select id="arusKasUtamaJenis" style="width:100%;margin-top:6px;background:#1b232d;border:1px solid #364250;color:#fff;border-radius:9px;padding:10px;"><option value="SALDO_AWAL">Saldo Awal</option><option value="KAS_MASUK">Kas Masuk</option><option value="KAS_KELUAR">Kas Keluar</option><option value="TRANSFER_MASUK">Transfer Masuk</option><option value="TRANSFER_KELUAR">Transfer Keluar</option><option value="PENARIKAN_OWNER">Penarikan Owner</option></select></label>
              <label style="color:#9aabba;font-size:11px;font-weight:800;">NOMINAL (RP)<input id="arusKasUtamaNominal" inputmode="numeric" placeholder="0" style="width:100%;margin-top:6px;background:#1b232d;border:1px solid #364250;color:#fff;border-radius:9px;padding:10px;box-sizing:border-box;font-weight:800;"></label>
              <label style="color:#9aabba;font-size:11px;font-weight:800;">CATATAN<input id="arusKasUtamaCatatan" placeholder="Keterangan Owner" style="width:100%;margin-top:6px;background:#1b232d;border:1px solid #364250;color:#fff;border-radius:9px;padding:10px;box-sizing:border-box;"></label>
              <button id="arusKasUtamaSave" type="button" style="background:linear-gradient(180deg,#f6cf42,#d8a916);border:0;color:#111;border-radius:10px;padding:11px 18px;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(242,194,48,.18);">Simpan</button>
            </div>
            <div style="overflow:auto;border:1px solid #27313c;border-radius:14px;">
              <table style="width:100%;border-collapse:collapse;min-width:760px;"><thead><tr style="background:#0b0f13;color:#f2c230;text-align:left;"><th style="padding:12px;">Tanggal</th><th style="padding:12px;">Jenis</th><th style="padding:12px;text-align:right;">Nominal</th><th style="padding:12px;">Catatan</th><th style="padding:12px;width:80px;">Aksi</th></tr></thead><tbody id="arusKasUtamaTbody"></tbody></table>
            </div>
          </section>
        </div>`;
        root.appendChild(wrap);
    },

    kasUtamaSignedAmount(row){
        const n = Number(row?.nominal || 0);
        return ["KAS_KELUAR","TRANSFER_KELUAR","PENARIKAN_OWNER"].includes(String(row?.jenis || "")) ? -n : n;
    },

    async openKasUtama(){
        const modal = document.getElementById("arusKasUtamaModal");
        if(!modal) return;
        modal.hidden = false;
        const t = document.getElementById("arusKasUtamaTanggal");
        if(t && !t.value) t.value = this.todayWib();
        await this.loadKasUtama();
    },

    closeKasUtama(){
        const modal = document.getElementById("arusKasUtamaModal");
        if(modal) modal.hidden = true;
    },

    async loadKasUtama(){
        if(typeof db === "undefined" || !this.isOwner()) return;
        const { data, error } = await db.from(this.TABLE_KAS_UTAMA).select("id,tanggal,jenis,nominal,sumber,catatan,created_at").order("tanggal", { ascending: false }).order("created_at", { ascending: false });
        if(error){ this.toast(error.message || "Gagal memuat Kas Utama.", "error"); return; }
        this.kasUtamaRows = data || [];
        this.renderKasUtama();
    },

    renderKasUtama(){
        const rows = this.kasUtamaRows || [];
        const saldo = rows.reduce((t,r) => t + this.kasUtamaSignedAmount(r), 0);
        const saldoEl = document.getElementById("arusKasUtamaSaldo");
        const countEl = document.getElementById("arusKasUtamaCount");
        if(saldoEl) saldoEl.textContent = this.formatRupiah(saldo);
        if(countEl) countEl.textContent = String(rows.length);
        const tbody = document.getElementById("arusKasUtamaTbody");
        if(!tbody) return;
        if(!rows.length){ tbody.innerHTML = `<tr><td colspan="5" style="padding:28px;text-align:center;color:#75869a;">Belum ada transaksi Kas Utama.</td></tr>`; return; }
        const labels = {SALDO_AWAL:"Saldo Awal",KAS_MASUK:"Kas Masuk",KAS_KELUAR:"Kas Keluar",TRANSFER_MASUK:"Transfer Masuk",TRANSFER_KELUAR:"Transfer Keluar",PENARIKAN_OWNER:"Penarikan Owner",LAINNYA:"Lainnya"};
        tbody.innerHTML = rows.map(r => {
            const signed = this.kasUtamaSignedAmount(r);
            return `<tr style="border-top:1px solid #222d38;color:#e8edf2;"><td style="padding:12px;">${this.escapeHtml(this.formatTanggal(r.tanggal))}</td><td style="padding:12px;">${this.escapeHtml(labels[r.jenis] || r.jenis)}</td><td style="padding:12px;text-align:right;font-weight:900;color:${signed < 0 ? '#ff7474' : '#52e48d'};">${this.escapeHtml((signed < 0 ? '- ' : '+ ') + this.formatRupiah(Math.abs(signed)))}</td><td style="padding:12px;">${this.escapeHtml(r.catatan || '—')}</td><td style="padding:12px;"><button type="button" data-arus-utama-del="${this.escapeHtml(r.id)}" style="background:#351719;border:1px solid #63292d;color:#ff9b9b;border-radius:8px;padding:7px 10px;font-weight:800;cursor:pointer;">Hapus</button></td></tr>`;
        }).join("");
    },

    async saveKasUtama(){
        if(!this.isOwner() || typeof db === "undefined") return;
        const tanggal = String(document.getElementById("arusKasUtamaTanggal")?.value || "").slice(0,10);
        const jenis = String(document.getElementById("arusKasUtamaJenis")?.value || "");
        const nominal = this.parseRupiahInput(document.getElementById("arusKasUtamaNominal")?.value);
        const catatan = String(document.getElementById("arusKasUtamaCatatan")?.value || "").trim();
        if(!tanggal){ this.toast("Tanggal Kas Utama wajib diisi.", "warn"); return; }
        if(nominal === null || nominal < 0){ this.toast("Nominal Kas Utama tidak valid.", "warn"); return; }
        const { error } = await db.from(this.TABLE_KAS_UTAMA).insert({tanggal,jenis,nominal,catatan:catatan || null,sumber:"OWNER"});
        if(error){ this.toast(error.message || "Gagal menyimpan Kas Utama.", "error"); return; }
        const n = document.getElementById("arusKasUtamaNominal");
        const c = document.getElementById("arusKasUtamaCatatan");
        if(n) n.value = "";
        if(c) c.value = "";
        this.toast("Transaksi Kas Utama tersimpan.", "success");
        await this.loadKasUtama();
    },

    async deleteKasUtama(id){
        if(!this.isOwner() || !id || typeof db === "undefined") return;
        const { error } = await db.from(this.TABLE_KAS_UTAMA).delete().eq("id", id);
        if(error){ this.toast(error.message || "Gagal menghapus transaksi Kas Utama.", "error"); return; }
        this.toast("Transaksi Kas Utama dihapus.", "success");
        await this.loadKasUtama();
    },

    async loadSeeds(){
        if(typeof db === "undefined") return;
        try{
            const ids = this.cabangList.map((c) => c.id);
            if(!ids.length){
                this.seeds = [];
                this.renderSeedTable();
                return;
            }
            const { data, error } = await db
                .from(this.TABLE_SEED)
                .select("id,cabang_id,tanggal_efektif,saldo_awal,catatan,updated_at")
                .in("cabang_id", ids)
                .order("tanggal_efektif", { ascending: false });
            if(error) throw error;
            this.seeds = (data || []).map((r) => ({
                ...r,
                tanggal_efektif: String(r.tanggal_efektif || "").slice(0, 10),
                saldo_awal: Number(r.saldo_awal)
            }));
        }catch(err){
            console.error("ArusKas.loadSeeds:", err);
            this.seeds = [];
            const msg = String(err?.message || err || "");
            if(/arus_kas_saldo_awal|does not exist|relation/i.test(msg)){
                this.showBanner("Tabel seed belum ada. Jalankan migrasi 20260824_arus_kas_saldo_awal.sql di Supabase.", "error");
            }
        }
        this.renderSeedTable();
    },

    seedsForCabang(cabangId){
        return this.seeds
            .filter((s) => Number(s.cabang_id) === Number(cabangId))
            .sort((a, b) => a.tanggal_efektif < b.tanggal_efektif ? -1 : 1);
    },

    renderSeedTable(){
        const tbody = document.getElementById("arusKasSeedTbody");
        if(!tbody) return;
        if(!this.seeds.length){
            tbody.innerHTML = `<tr class="aruskas-empty-row"><td colspan="5"><div class="aruskas-empty-state"><strong>Belum ada seed Owner</strong><span>Isi form di atas untuk memulai ledger kas cabang.</span></div></td></tr>`;
            return;
        }
        const nameOf = (id) => {
            const c = this.cabangList.find((x) => Number(x.id) === Number(id));
            return this.shortCabangName(c?.nama_cabang || ("#" + id));
        };
        const sorted = [...this.seeds].sort((a, b) => {
            const oa = this.cabangMatchOrderIndex(nameOf(a.cabang_id));
            const ob = this.cabangMatchOrderIndex(nameOf(b.cabang_id));
            if(oa !== ob) return oa - ob;
            return a.tanggal_efektif < b.tanggal_efektif ? 1 : -1;
        });
        tbody.innerHTML = sorted.map((s) => `
            <tr>
                <td>${this.escapeHtml(nameOf(s.cabang_id))}</td>
                <td>${this.escapeHtml(this.formatTanggal(s.tanggal_efektif))}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(s.saldo_awal))}</td>
                <td>${this.escapeHtml(s.catatan || "—")}</td>
                <td>${this.isOwner() ? `<button type="button" class="aruskas-btn-danger" data-arus-seed-del="${this.escapeHtml(s.id)}">Hapus</button>` : ""}</td>
            </tr>`).join("");
    },

    async saveSeed(){
        if(!this.isOwner()){
            this.toast("Hanya Owner yang boleh seed Saldo Awal.", "error");
            return;
        }
        if(typeof db === "undefined"){
            this.toast("Koneksi database tidak tersedia.", "error");
            return;
        }
        const cabangId = Number(document.getElementById("arusKasSeedCabang")?.value || 0);
        const tanggal = String(document.getElementById("arusKasSeedTanggal")?.value || "").slice(0, 10);
        const nominal = this.parseRupiahInput(document.getElementById("arusKasSeedNominal")?.value);
        const catatan = String(document.getElementById("arusKasSeedCatatan")?.value || "").trim();
        if(!cabangId){ this.toast("Pilih cabang untuk seed.", "warn"); return; }
        if(!tanggal){ this.toast("Tanggal efektif wajib diisi.", "warn"); return; }
        if(nominal === null){ this.toast("Saldo awal wajib angka valid.", "warn"); return; }

        try{
            const payload = { cabang_id: cabangId, tanggal_efektif: tanggal, saldo_awal: nominal, catatan: catatan || null };
            const { error } = await db.from(this.TABLE_SEED).upsert(payload, { onConflict: "cabang_id,tanggal_efektif" });
            if(error) throw error;
            const n = document.getElementById("arusKasSeedNominal");
            const c = document.getElementById("arusKasSeedCatatan");
            if(n) n.value = "";
            if(c) c.value = "";
            this.toast("Seed Saldo Awal tersimpan.", "success");
            await this.loadSeeds();
            await this.load();
        }catch(err){
            console.error("ArusKas.saveSeed:", err);
            this.toast(err?.message || "Gagal menyimpan seed.", "error");
        }
    },

    async deleteSeed(id){
        if(!this.isOwner() || !id || typeof db === "undefined") return;
        try{
            const { error } = await db.from(this.TABLE_SEED).delete().eq("id", id);
            if(error) throw error;
            this.toast("Seed dihapus.", "success");
            await this.loadSeeds();
            await this.load();
        }catch(err){
            this.toast(err?.message || "Gagal menghapus seed.", "error");
        }
    },

    buildDailyLedger({ start, end, seeds, daily, setoranByDate }){
        const seedList = (seeds || [])
            .map((s) => ({ tanggal_efektif: String(s.tanggal_efektif).slice(0, 10), saldo_awal: Number(s.saldo_awal) }))
            .filter((s) => s.tanggal_efektif && Number.isFinite(s.saldo_awal))
            .sort((a, b) => a.tanggal_efektif < b.tanggal_efektif ? -1 : 1);

        const seedByDate = new Map(seedList.map((s) => [s.tanggal_efektif, s]));
        // Mulai dari filter.start. Hanya mundur ke seed pertama jika seed < start
        // (untuk carry-forward saldo). Tanggal sebelum seed pertama tetap dihitung dari Rp0.
        const realWalkStart = seedList.length && seedList[0].tanggal_efektif < start
            ? seedList[0].tanggal_efektif
            : start;

        // Seed BUKAN syarat ledger. Tanpa seed => running Rp0. Seed hanya reset pada tanggal efektifnya.
        let running = 0;
        let activeSeed = null;
        const rows = [];

        for(const d of this.eachDate(realWalkStart, end)){
            const seedToday = seedByDate.get(d);
            if(seedToday){
                running = Number(seedToday.saldo_awal);
                activeSeed = seedToday;
            }

            const cashIn = Number(daily[d]?.cash_in || 0);
            const nonTunai = Number(daily[d]?.non_tunai || 0);
            const cashOut = Number(daily[d]?.cash_out || 0);
            const setoran = Number(setoranByDate[d] || 0);

            const saldoAwal = running;
            const arusBersih = cashIn - cashOut - setoran;
            const saldoAkhir = saldoAwal + arusBersih;
            if(d >= start && d <= end){
                rows.push({ tanggal: d, needsSeed: false, saldo_awal: saldoAwal, cash_in: cashIn, non_tunai: nonTunai, cash_out: cashOut, setoran, arus_bersih: arusBersih, saldo_akhir: saldoAkhir });
            }
            running = saldoAkhir;
        }

        return { needsSeed: false, rows, activeSeed };
    },

    aggregateMonthly(dailyRows){
        const map = new Map();
        (dailyRows || []).forEach((r) => {
            if(r.needsSeed) return;
            const ym = String(r.tanggal).slice(0, 7);
            if(!map.has(ym)){
                map.set(ym, {
                    tanggal: ym, isMonth: true, saldo_awal: r.saldo_awal,
                    cash_in: 0, non_tunai: 0, cash_out: 0, setoran: 0,
                    arus_bersih: 0, saldo_akhir: r.saldo_akhir,
                    _first: r.tanggal, _last: r.tanggal
                });
            }
            const m = map.get(ym);
            m.cash_in += Number(r.cash_in || 0);
            m.non_tunai += Number(r.non_tunai || 0);
            m.cash_out += Number(r.cash_out || 0);
            m.setoran += Number(r.setoran || 0);
            m.arus_bersih += Number(r.arus_bersih || 0);
            if(r.tanggal < m._first){ m._first = r.tanggal; m.saldo_awal = r.saldo_awal; }
            if(r.tanggal >= m._last){ m._last = r.tanggal; m.saldo_akhir = r.saldo_akhir; }
        });
        return [...map.values()].sort((a, b) => a.tanggal < b.tanggal ? -1 : 1);
    },

    summarizeRows(rows){
        const ok = (rows || []).filter((r) => !r.needsSeed && r.saldo_awal != null);
        if(!ok.length){
            // Kosong = tidak ada baris filter, bukan error "butuh seed".
            return { saldo_awal: null, cash_in: null, non_tunai: null, cash_out: null, setoran: null, arus_bersih: null, saldo_akhir: null, needsSeed: false };
        }
        const sum = (k) => ok.reduce((t, r) => t + Number(r[k] || 0), 0);
        return {
            saldo_awal: ok[0].saldo_awal,
            cash_in: sum("cash_in"),
            non_tunai: sum("non_tunai"),
            cash_out: sum("cash_out"),
            setoran: sum("setoran"),
            arus_bersih: sum("arus_bersih"),
            saldo_akhir: ok[ok.length - 1].saldo_akhir,
            needsSeed: false
        };
    },

    async fetchDailyMovements(cabangId, start, end){
        let q = db
            .from(this.TABLE_SOURCE)
            .select("tanggal,cash_payment,non_cash,cash_out")
            .eq("cabang_id", cabangId)
            .order("tanggal", { ascending: true });
        q = start === end ? q.eq("tanggal", start) : q.gte("tanggal", start).lte("tanggal", end);
        const { data, error } = await q;
        if(error) throw error;
        const map = {};
        (data || []).forEach((r) => {
            const t = String(r.tanggal || "").slice(0, 10);
            if(!t) return;
            if(!map[t]) map[t] = { cash_in: 0, non_tunai: 0, cash_out: 0 };
            map[t].cash_in += Number(r.cash_payment || 0);
            map[t].non_tunai += Number(r.non_cash || 0);
            map[t].cash_out += Number(r.cash_out || 0);
        });
        return { map, raw: data || [] };
    },

    async fetchSetoranByPeriodEnd(cabangId, start, end){
        const { data, error } = await db
            .from(this.TABLE_SETORAN)
            .select("period_start,period_end,setoran_cash_actual,status")
            .eq("cabang_id", cabangId)
            .not("setoran_cash_actual", "is", null)
            .lte("period_end", end)
            .gte("period_end", start);
        if(error) throw error;
        const map = {};
        const rawOk = [];
        (data || []).forEach((r) => {
            if(!this.SETORAN_STATUS_OK.includes(String(r.status || ""))) return;
            const d = String(r.period_end || "").slice(0, 10);
            const amt = Number(r.setoran_cash_actual);
            if(!d || !Number.isFinite(amt)) return;
            map[d] = (map[d] || 0) + amt;
            rawOk.push(r);
        });
        return { map, raw: rawOk };
    },

    async fetchSetoranForCarry(cabangId, walkStart, end){
        const result = await this.fetchSetoranByPeriodEnd(cabangId, walkStart, end);
        return result.map;
    },

    async load(){
        if(typeof db === "undefined"){
            this.showBanner("Koneksi database tidak tersedia.", "error");
            return;
        }

        const filter = this.getActiveFilter();
        this.syncHeaderContext(filter);
        if(!filter.cabangId){
            this.showBanner("Pilih cabang operasional terlebih dahulu.", "warn");
            this.renderEmpty();
            return;
        }

        this.persistFilters();
        this.setLoading(true);

        try{
            const seeds = this.seedsForCabang(filter.cabangId);
            // Jangan selalu mulai dari seed pertama. Jika filter.start lebih awal dari seed,
            // ledger & fetch mulai dari filter.start (running Rp0 sampai tanggal seed).
            // Mundur ke seed hanya jika seed < filter.start (carry saldo).
            const firstSeedDate = seeds.length ? seeds[0].tanggal_efektif : null;
            const walkStart = firstSeedDate && firstSeedDate < filter.start ? firstSeedDate : filter.start;
            const mov = await this.fetchDailyMovements(filter.cabangId, walkStart, filter.end);
            const setoranMap = await this.fetchSetoranForCarry(filter.cabangId, walkStart, filter.end);
            const displayMov = await this.fetchDailyMovements(filter.cabangId, filter.start, filter.end);
            const displaySetoran = await this.fetchSetoranByPeriodEnd(filter.cabangId, filter.start, filter.end);

            const built = this.buildDailyLedger({
                start: filter.start,
                end: filter.end,
                seeds,
                daily: mov.map,
                setoranByDate: setoranMap
            });

            this.dailyRows = built.rows;
            this.viewRows = filter.rekap === "bulanan" ? this.aggregateMonthly(built.rows) : built.rows;
            this.summary = this.summarizeRows(filter.rekap === "bulanan" ? this.viewRows : built.rows);

            const srcCashIn = Object.values(displayMov.map).reduce((t, r) => t + r.cash_in, 0);
            const srcNon = Object.values(displayMov.map).reduce((t, r) => t + r.non_tunai, 0);
            const srcOut = Object.values(displayMov.map).reduce((t, r) => t + r.cash_out, 0);
            const srcSet = Object.values(displaySetoran.map).reduce((t, r) => t + r, 0);

            const okRows = built.rows;
            const ledCashIn = okRows.reduce((t, r) => t + r.cash_in, 0);
            const ledNon = okRows.reduce((t, r) => t + r.non_tunai, 0);
            const ledOut = okRows.reduce((t, r) => t + r.cash_out, 0);
            const ledSet = okRows.reduce((t, r) => t + r.setoran, 0);

            const match = (a, b) => Math.abs(Number(a) - Number(b)) <= 1;
            this.lastCrossCheck = {
                ok: match(ledCashIn, srcCashIn)
                    && match(ledNon, srcNon)
                    && match(ledOut, srcOut)
                    && match(ledSet, srcSet),
                cash_in: { ledger: ledCashIn, source: srcCashIn },
                non_tunai: { ledger: ledNon, source: srcNon },
                cash_out: { ledger: ledOut, source: srcOut },
                setoran: { ledger: ledSet, source: srcSet },
                activeSeed: built.activeSeed
            };

            if(!this.lastCrossCheck.ok){
                this.showBanner("Cross-check MISMATCH — periksa console ArusKas.lastCrossCheck.", "error");
                console.warn("ArusKas cross-check FAIL", this.lastCrossCheck);
            }else if(!seeds.length){
                this.showBanner("Saldo awal belum diisi. Transaksi tetap berjalan otomatis dengan Saldo Awal Rp0.", "warn");
            }else{
                this.showBanner("");
            }

            this.render(filter);
        }catch(err){
            console.error("ArusKas.load:", err);
            this.showBanner(err?.message || "Gagal memuat Arus Kas.", "error");
            this.dailyRows = [];
            this.viewRows = [];
            this.summary = this.summarizeRows([]);
            this.render(filter);
        }finally{
            this.setLoading(false);
        }
    },

    renderEmpty(){
        this.dailyRows = [];
        this.viewRows = [];
        this.summary = this.summarizeRows([]);
        this.render(this.getActiveFilter());
    },

    render(filter){
        const s = this.summary || this.summarizeRows([]);
        const setKpi = (id, val) => {
            const el = document.getElementById(id);
            if(!el) return;
            el.textContent = val;
            el.classList.remove("is-counting");
            void el.offsetWidth;
            el.classList.add("is-counting");
        };
        const set = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.textContent = val;
        };

        setKpi("arusKasSumAwal", this.formatRupiah(s.saldo_awal));
        setKpi("arusKasSumCashIn", this.formatRupiah(s.cash_in));
        setKpi("arusKasSumNonTunai", this.formatRupiah(s.non_tunai));
        setKpi("arusKasSumCashOut", this.formatRupiah(s.cash_out));
        setKpi("arusKasSumSetoran", this.formatRupiah(s.setoran));
        setKpi("arusKasSumBersih", this.formatRupiah(s.arus_bersih));
        setKpi("arusKasSumAkhir", this.formatRupiah(s.saldo_akhir));

        set("arusKasMetaCabang", "Cabang: " + this.shortCabangName(filter.cabang?.nama_cabang || "—"));
        set("arusKasMetaPeriode", "Periode: " + this.formatHeaderPeriode(filter));
        const seeds = this.seedsForCabang(filter.cabangId);
        const seedInfo = seeds.length ? `Seed aktif sejak ${this.formatTanggal(seeds[0].tanggal_efektif)} (${seeds.length} seed)` : "Belum ada seed";
        set("arusKasMetaSeed", "Seed: " + seedInfo);
        this.syncHeaderContext(filter);

        const col = document.getElementById("arusKasColTanggal");
        if(col) col.textContent = filter.rekap === "bulanan" ? "Bulan" : "Tanggal";

        set("arusKasFootAwal", this.formatRupiah(s.saldo_awal));
        set("arusKasFootCashIn", this.formatRupiah(s.cash_in));
        set("arusKasFootNonTunai", this.formatRupiah(s.non_tunai));
        set("arusKasFootCashOut", this.formatRupiah(s.cash_out));
        set("arusKasFootSetoran", this.formatRupiah(s.setoran));
        set("arusKasFootBersih", this.formatRupiah(s.arus_bersih));
        set("arusKasFootAkhir", this.formatRupiah(s.saldo_akhir));

        const table = document.getElementById("arusKasTable");
        const empty = document.getElementById("arusKasEmpty");
        const tbody = document.getElementById("arusKasTbody");
        if(!tbody) return;

        if(!this.viewRows.length){
            if(table) table.hidden = true;
            if(empty){
                empty.hidden = false;
                empty.textContent = "Tidak ada baris ledger pada filter aktif.";
            }
            return;
        }

        if(empty) empty.hidden = true;
        if(table) table.hidden = false;
        tbody.innerHTML = this.viewRows.map((r) => {
            if(r.needsSeed){
                return `<tr class="is-gap"><td>${this.escapeHtml(this.formatTanggal(r.tanggal))}</td><td class="num" colspan="7">Butuh seed Saldo Awal Owner (sebelum tanggal efektif)</td></tr>`;
            }
            const label = r.isMonth ? this.formatMonth(r.tanggal) : this.formatTanggal(r.tanggal);
            return `<tr>
                <td>${this.escapeHtml(label)}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(r.saldo_awal))}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(r.cash_in))}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(r.non_tunai))}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(r.cash_out))}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(r.setoran))}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(r.arus_bersih))}</td>
                <td class="num">${this.escapeHtml(this.formatRupiah(r.saldo_akhir))}</td>
            </tr>`;
        }).join("");
    },

    printPdf(){
        const filter = this.getActiveFilter();
        if(!this.viewRows.length){
            this.toast("Tidak ada data Arus Kas untuk dicetak pada filter aktif.", "warn");
            return;
        }
        const cabang = this.shortCabangName(filter.cabang?.nama_cabang || "—");
        const periode = this.periodeLabel(filter);
        const rekap = filter.rekap === "bulanan" ? "Rekap Bulanan" : "Rekap Harian";
        const s = this.summary || {};
        const stamp = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false
        }).format(new Date()) + " WIB";

        const bodyRows = this.viewRows.map((r) => {
            if(r.needsSeed) return `<tr><td>${this.escapeHtml(this.formatTanggal(r.tanggal))}</td><td colspan="7">Butuh seed Saldo Awal</td></tr>`;
            const label = r.isMonth ? this.formatMonth(r.tanggal) : this.formatTanggal(r.tanggal);
            return `<tr>
                <td>${this.escapeHtml(label)}</td>
                <td>${this.escapeHtml(this.formatRupiah(r.saldo_awal))}</td>
                <td>${this.escapeHtml(this.formatRupiah(r.cash_in))}</td>
                <td>${this.escapeHtml(this.formatRupiah(r.non_tunai))}</td>
                <td>${this.escapeHtml(this.formatRupiah(r.cash_out))}</td>
                <td>${this.escapeHtml(this.formatRupiah(r.setoran))}</td>
                <td>${this.escapeHtml(this.formatRupiah(r.arus_bersih))}</td>
                <td>${this.escapeHtml(this.formatRupiah(r.saldo_akhir))}</td>
            </tr>`;
        }).join("");

        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Arus Kas VAX ERP</title>
<style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}.hdr{margin-bottom:10px}.hdr h1{font-size:18px;margin:0 0 4px}.hdr p{margin:0;color:#555}.cards{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin:10px 0}.card{border:1px solid #bbb;padding:7px;border-radius:6px}.card b{display:block;font-size:8px;color:#555;margin-bottom:3px}.card strong{font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:5px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#eee}.note{margin-top:8px;color:#555;font-size:9px}
</style></head><body>
<div class="hdr"><h1>TABEL ARUS KAS — VAX ERP</h1><p>${this.escapeHtml(cabang)} · ${this.escapeHtml(periode)} · ${this.escapeHtml(rekap)} · Cetak ${this.escapeHtml(stamp)}</p></div>
<div class="cards">
<div class="card"><b>Saldo Awal</b><strong>${this.escapeHtml(this.formatRupiah(s.saldo_awal))}</strong></div>
<div class="card"><b>Cash In</b><strong>${this.escapeHtml(this.formatRupiah(s.cash_in))}</strong></div>
<div class="card"><b>Non Tunai</b><strong>${this.escapeHtml(this.formatRupiah(s.non_tunai))}</strong></div>
<div class="card"><b>Cash Out</b><strong>${this.escapeHtml(this.formatRupiah(s.cash_out))}</strong></div>
<div class="card"><b>Setoran</b><strong>${this.escapeHtml(this.formatRupiah(s.setoran))}</strong></div>
<div class="card"><b>Arus Bersih</b><strong>${this.escapeHtml(this.formatRupiah(s.arus_bersih))}</strong></div>
<div class="card"><b>Saldo Akhir</b><strong>${this.escapeHtml(this.formatRupiah(s.saldo_akhir))}</strong></div>
</div>
<table><thead><tr><th>${filter.rekap === "bulanan" ? "Bulan" : "Tanggal"}</th><th>Saldo Awal</th><th>Cash In</th><th>Non Tunai</th><th>Cash Out</th><th>Setoran</th><th>Arus Bersih</th><th>Saldo Akhir</th></tr></thead><tbody>${bodyRows}</tbody></table>
<p class="note">Formula kas fisik: Saldo Akhir = Saldo Awal + Cash In − Cash Out − Setoran. Non Tunai tidak menambah kas. Setoran = transfer, bukan biaya.</p>
<script>window.onload=function(){window.print();};<\/script></body></html>`;

        const w = window.open("", "_blank");
        if(!w){ this.toast("Popup diblokir. Izinkan pop-up untuk Print/PDF.", "warn"); return; }
        w.document.open();
        w.document.write(html);
        w.document.close();
    }
};

window.ArusKas = ArusKas;

