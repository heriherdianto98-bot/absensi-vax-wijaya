/*
=========================================================
VAX ERP ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Absensi Owner (card-first + matriks secondary)
READ ONLY dari public.absensi + public.jadwal_libur + public.karyawan + public.cabang
Tidak mengubah monitoring harian / engine LOCK / flow absensi.
=========================================================
*/

const AbsensiLaporanBulanan = {

    _bound: false,
    _periodBound: false,
    _booted: false,
    _embed: false,
    _visible: false,
    _matrixOpen: false,
    _activeFilter: "",
    _cardLocked: false,
    _cabangList: [],
    _karyawanAll: [],
    _karyawanRaw: [],
    _absensiRows: [],
    _jadwalRows: [],
    _rows: [],
    _meta: null,
    _loadToken: 0,
    _periodDraftYear: 0,
    _periodDraftMonth: 0,
    _dayMode: false,
    _dailyDate: "",
    _dailyAuditHomes: null,

    MONTH_NAMES: [
        "Januari","Februari","Maret","April","Mei","Juni",
        "Juli","Agustus","September","Oktober","November","Desember"
    ],

    FILTER_LABEL: {
        H: "HADIR",
        T: "TERLAMBAT",
        A: "BELUM ABSEN / ALFA",
        L: "LIBUR",
        I: "IZIN",
        S: "SAKIT",
        D: "DENDA"
    },

    DAY_STATUS_LABEL: {
        H: "HADIR",
        T: "TERLAMBAT",
        L: "LIBUR",
        I: "IZIN",
        S: "SAKIT",
        A: "ALFA"
    },

    INACTIVE_RE: /\b(off|resign|resigned|nonaktif|non-aktif|tidak aktif|keluar|berhenti)\b/i,

    GO_LIVE_DATE: "2026-08-15",
    _pengaturan: null,

    todayJakarta(){
        return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    },

    escapeHtml(v){
        return String(v ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    },

    pad2(n){
        return String(n).padStart(2, "0");
    },

    isoDay(year, month, day){
        return `${year}-${this.pad2(month)}-${this.pad2(day)}`;
    },

    fmtDate(iso){
        const s = this.isoDate(iso);
        if(!s) return "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
        const [y, m, d] = s.split("-").map(Number);
        const mon = this.MONTH_NAMES[(m || 1) - 1] || "";
        return `${d} ${mon} ${y}`;
    },

    isoDate(v){
        if(v == null || v === "") return "";
        if(typeof v === "object" && !(v instanceof Date)){
            return this.isoDate(v.tanggal ?? v.date ?? v.value ?? v.start ?? "");
        }
        if(v instanceof Date && !Number.isNaN(v.getTime())){
            return v.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        }
        const s = String(v).trim();
        let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if(m) return `${m[1]}-${this.pad2(Number(m[2]))}-${this.pad2(Number(m[3]))}`;
        m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
        if(m) return `${m[3]}-${this.pad2(Number(m[2]))}-${this.pad2(Number(m[1]))}`;
        const t = Date.parse(s);
        if(!Number.isNaN(t)){
            return new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        }
        return "";
    },

    normId(v){
        if(v == null || v === "") return "";
        if(typeof v === "object"){
            return this.normId(v.id ?? v.karyawan_id ?? "");
        }
        const s = String(v).trim();
        if(/^\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10));
        return s;
    },

    findJadwal(karyawanId, iso){
        const kid = this.normId(karyawanId);
        if(!iso) return null;
        return (this._jadwalRows || []).find((row) => {
            const tgl = this.isoDate(row.tanggal);
            if(tgl !== iso) return false;
            if(kid && this.normId(row.karyawan_id) === kid) return true;
            return row.karyawan_id == karyawanId;
        }) || null;
    },

    daysInMonth(year, month){
        return new Date(year, month, 0).getDate();
    },

    isFloatingCabang(nama){
        return String(nama || "").toLowerCase().includes("floating");
    },

    formatRp(n){
        return "Rp" + Number(n || 0).toLocaleString("id-ID");
    },

    formatJam(v){
        const s = String(v || "").trim();
        if(!s || s === "-" || s === "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â") return "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
        return s.length >= 5 ? s.slice(0, 5) : s;
    },

    isActiveKaryawan(k){
        if(!k) return false;
        if(k.aktif === false || k.aktif === 0) return false;

        const aktifRaw = String(k.aktif ?? "").trim().toLowerCase();
        if(["false", "0", "f", "nonaktif", "off", "resign", "resigned"].includes(aktifRaw)) return false;

        const blob = [
            k.status,
            k.status_karyawan,
            k.keterangan,
            k.catatan,
            k.jabatan
        ].map((v) => String(v || "").trim()).join(" ");

        if(this.INACTIVE_RE.test(blob)) return false;

        if(k.aktif === true || k.aktif === 1 || aktifRaw === "true" || aktifRaw === "aktif") return true;

        const status = String(k.status || k.status_karyawan || "").trim().toLowerCase();
        if(status && status !== "aktif") return false;
        return aktifRaw === "" ? true : !this.INACTIVE_RE.test(aktifRaw);
    },

    cabangNameOf(k){
        if(!k) return "-";
        if(k.cabang && typeof k.cabang === "object"){
            return k.cabang.nama_cabang || "-";
        }
        const hit = this._cabangList.find((c) => String(c.id) === String(k.cabang_id));
        return hit?.nama_cabang || "-";
    },

    selectedYear(){
        return Number(document.getElementById("ablFilterTahun")?.value || 0);
    },

    selectedMonth(){
        return Number(document.getElementById("ablFilterBulan")?.value || 0);
    },

    selectedCabangId(){
        return String(document.getElementById("ablFilterCabang")?.value || "").trim();
    },

    searchQuery(){
        return String(document.getElementById("ablFilterCari")?.value || "").trim().toLowerCase();
    },

    parseGlobalSearch(){
        const raw = this.searchQuery();
        const STATUS_TOKEN = {
            hadir: "H",
            terlambat: "T",
            telat: "T",
            alfa: "A",
            alpha: "A",
            libur: "L",
            off: "L",
            izin: "I",
            sakit: "S",
            denda: "D"
        };
        let statusFromSearch = "";
        let rest = raw;
        if(/\bbelum\s*absen\b/.test(rest)){
            statusFromSearch = "A";
            rest = rest.replace(/\bbelum\s*absen\b/g, " ");
        }
        const tokens = rest.split(/\s+/).filter(Boolean);
        const textTokens = [];
        tokens.forEach((tok) => {
            const code = STATUS_TOKEN[tok];
            if(code) statusFromSearch = code;
            else textTokens.push(tok);
        });
        return {
            raw,
            text: textTokens.join(" ").trim(),
            statusFromSearch
        };
    },

    activeQuery(){
        const parsed = this.parseGlobalSearch();
        return {
            text: parsed.text,
            status: parsed.statusFromSearch || this._activeFilter || "",
            raw: parsed.raw,
            statusFromSearch: parsed.statusFromSearch
        };
    },

    periodBounds(){
        const year = this.selectedYear();
        const month = this.selectedMonth();
        const days = this.daysInMonth(year, month);
        const start = year && month ? this.isoDay(year, month, 1) : "";
        const end = year && month ? this.isoDay(year, month, days) : "";
        return {
            year,
            month,
            days,
            start,
            end,
            label: start && end ? `${this.fmtDate(start)} s.d. ${this.fmtDate(end)}` : "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"
        };
    },

    matchesText(row, text){
        if(!text) return true;
        const nama = String(row.nama || "").toLowerCase();
        const cabang = String(row.cabang || "").toLowerCase();
        const jabatan = String(row.jabatan || "").toLowerCase();
        return nama.includes(text) || cabang.includes(text) || jabatan.includes(text);
    },

    rowHasStatus(row, status){
        if(!status) return true;
        if(status === "H") return row.masuk > 0;
        if(status === "T") return row.terlambat > 0;
        if(status === "L") return row.libur > 0;
        if(status === "I") return row.izin > 0;
        if(status === "S") return row.sakit > 0;
        if(status === "A") return row.missing > 0;
        if(status === "D") return (row.dendaRecords || []).length > 0;
        return true;
    },

    eventRows(){
        const { text, status } = this.activeQuery();
        const out = [];
        const period = this.effectivePeriodBounds();
        (this._rows || []).forEach((r) => {
            if(!this.matchesText(r, text)) return;
            if(status === "D"){
                (r.dendaRecords || []).forEach((rec) => {
                    out.push({
                        nama: r.nama,
                        cabang: r.cabang,
                        jabatan: r.jabatan,
                        iso: rec.iso || this.isoDay(this.selectedYear(), this.selectedMonth(), rec.day),
                        code: "D",
                        label: "DENDA"
                    });
                });
                return;
            }
            (r.days || []).forEach((d) => {
                const code = this.matrixDisplayCode(d);
                if(d.future || !code || code === "-") return;
                if(period.start && d.iso < period.start) return;
                if(period.end && d.iso > period.end) return;
                if(status && code !== status) return;
                out.push({
                    nama: r.nama,
                    cabang: r.cabang,
                    jabatan: r.jabatan,
                    iso: d.iso,
                    code,
                    label: this.dayStatusLabel(code)
                });
            });
        });
        out.sort((a, b) => {
            const t = String(a.iso).localeCompare(String(b.iso));
            if(t) return t;
            const c = String(a.cabang).localeCompare(String(b.cabang), "id");
            if(c) return c;
            return String(a.nama).localeCompare(String(b.nama), "id");
        });
        return out;
    },

    filterLabelText(){
        const { text, status, raw } = this.activeQuery();
        const bits = [];
        if(status) bits.push(this.FILTER_LABEL[status] || this.DAY_STATUS_LABEL[status] || status);
        if(text) bits.push(text);
        else if(raw && !status) bits.push(raw);
        return bits.join(" Ãƒâ€šÃ‚Â· ") || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
    },

    cleanPrintText(value){
        let s = String(value ?? "");
        const pairs = [
            ["ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â", "—"],
            ["ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“", "–"],
            ["ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦", "…"],
            ["Ãƒâ€šÃ‚Â·", " · "],
            ["Ã¢â‚¬â€", "—"],
            ["Ã¢â‚¬â€œ", "–"],
            ["Ã¢â‚¬Â¦", "…"],
            ["â€”", "—"],
            ["â€“", "–"],
            ["â€¦", "…"],
            ["Ã‚Â·", " · "],
            ["Â·", " · "]
        ];
        for(const [bad, good] of pairs){
            if(bad && s.includes(bad)) s = s.split(bad).join(good);
        }
        s = s.replace(/\uFFFD/g, "").replace(/[ \t]{2,}/g, " ").trim();
        return s;
    },

    printFilterLabel(){
        const { text, status, raw } = this.activeQuery();
        const bits = [];
        if(status) bits.push(this.FILTER_LABEL[status] || this.DAY_STATUS_LABEL[status] || status);
        const cabangSel = this._dayMode
            ? document.getElementById("absensiFilterCabang")
            : document.getElementById("ablFilterCabang");
        const cabangVal = String(cabangSel?.value || "").trim();
        const cabangLabel = String(cabangSel?.selectedOptions?.[0]?.textContent || "").trim();
        if(cabangVal && cabangLabel && !/^semua(\s+cabang)?$/i.test(cabangLabel)){
            bits.push(cabangLabel);
        }
        if(text) bits.push(text);
        else if(raw && !status) bits.push(raw);
        const label = bits.filter(Boolean).join(" · ") || "Semua";
        return this.cleanPrintText(label);
    },

    elapsedLastDay(year, month, days){
        const today = this.todayJakarta();
        const [ty, tm, td] = today.split("-").map(Number);
        if(year > ty || (year === ty && month > tm)) return 0;
        if(year < ty || (year === ty && month < tm)) return days;
        return Math.min(days, td);
    },

    statusCode(row, iso, todayIso){
        if(!iso || iso > todayIso) return "-";
        if(!row) return "-";

        const sa = String(row.status_absensi || "").trim().toUpperCase();
        const st = String(row.status || "").trim().toLowerCase();
        const lateMin = Number(row.terlambat_menit || 0);
        const isLate = lateMin > 0
            || sa === "T"
            || st === "terlambat"
            || st.includes("terlambat");

        if(sa === "L" || st === "libur") return "L";
        if(sa === "S" || st === "sakit") return "S";
        if(sa === "I" || st === "izin") return "I";
        if(sa === "O" || st === "off" || st === "o") return "L";
        if(sa === "A" || st === "alfa" || st === "alpha" || st === "a") return "-";
        if(isLate) return "T";
        if(sa === "H" || st === "hadir" || st === "masuk") return "H";
        return "-";
    },

    jadwalCode(row){
        if(!row) return "";
        const sc = String(row.status_canonical || "").trim().toUpperCase();
        const st = String(row.status || "").trim().toUpperCase();
        if(sc === "I" || st === "I" || st === "IZIN" || st.includes("IZIN")) return "I";
        if(sc === "S" || st === "S" || st === "SAKIT" || st.includes("SAKIT")) return "S";
        if(sc === "L" || st === "L" || st === "LIBUR" || st.includes("LIBUR")) return "L";
        if(sc === "O" || st === "O" || st === "OFF") return "L";
        return "";
    },

    dayCode(rec, jadwal, iso, todayIso){
        if(!iso) return "-";

        const jc = this.jadwalCode(jadwal);
        if(jc === "I" || jc === "S" || jc === "L") return jc;

        if(iso > todayIso) return "-";

        const absCode = this.statusCode(rec, iso, todayIso);
        if(absCode === "H" || absCode === "T") return absCode;
        if(absCode === "I" || absCode === "S" || absCode === "L") return absCode;
        if(iso >= this.GO_LIVE_DATE && iso < todayIso) return "A";
        return "-";
    },

    markClass(code){
        if(code === "H") return "is-h";
        if(code === "L") return "is-l";
        if(code === "S") return "is-s";
        if(code === "I") return "is-i";
        if(code === "T") return "is-t";
        if(code === "A") return "is-a";
        return "is-n";
    },

    dayStatusLabel(code){
        if(code === "D") return "DENDA";
        return this.DAY_STATUS_LABEL[code] || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
    },

    matrixDisplayCode(day){
        if(!day) return "-";

        if(day.future && !["L","I","S"].includes(day.code)){
            return "-";
        }

        if(day.code === "A") return "A";
        if(!day.code || day.code === "-") return "-";
        return day.code;
    },

    parseHm(v){
        const s = String(v || "").trim();
        const m = s.match(/^(\d{1,2}):(\d{2})/);
        if(!m) return null;
        return (Number(m[1]) * 60) + Number(m[2]);
    },

    lateThresholdMinutes(){
        const jam = this._pengaturan?.jam_masuk || "10:00";
        const tol = Number(this._pengaturan?.toleransi_menit);
        const base = this.parseHm(jam);
        if(base == null) return this.parseHm("10:15");
        return base + (Number.isFinite(tol) ? tol : 15);
    },

    lateMinutesOf(rec){
        if(!rec) return 0;
        const clock = this.parseHm(rec.jam_masuk);
        if(clock == null) return Math.max(0, Number(rec.terlambat_menit || 0));
        return Math.max(0, clock - this.lateThresholdMinutes());
    },

    dendaSementaraOf(rec){
        const menit = this.lateMinutesOf(rec);
        if(menit <= 0) return 0;
        const tarif = Number(this._pengaturan?.tarif_denda);
        const rate = Number.isFinite(tarif) && tarif > 0 ? tarif : 1000;
        const max = Number(this._pengaturan?.max_denda || 0);
        const amt = menit * rate;
        return max > 0 ? Math.min(amt, max) : amt;
    },

    dendaDecision(rec){
        const s = String(rec?.status_denda || "").trim().toLowerCase();
        if(/batal|cancel|void|dibatalkan/.test(s)) return "cancelled";
        if(s && (/lunas|dibayar|paid|potong|payroll/.test(s)) && !/belum|berlaku/.test(s)) return "final";
        return "pending";
    },

    dendaStatusLabel(decision){
        if(decision === "final") return "Final";
        if(decision === "cancelled") return "Dibatalkan";
        return "Menunggu Review";
    },

    dendaBucket(raw){
        const s = String(raw || "").trim().toLowerCase();
        if(!s) return "belum";
        if(/potong|payroll/.test(s)) return "potong";
        if((/lunas|dibayar|paid|bayar/.test(s)) && !/belum/.test(s)) return "lunas";
        if(/berlaku|belum|unpaid|outstanding/.test(s)) return "belum";
        return "belum";
    },

    dendaBucketLabel(bucket){
        if(bucket === "lunas") return "Lunas";
        if(bucket === "potong") return "Potong Payroll";
        return "Belum Bayar";
    },

    async boot(opts = {}){
        this._embed = Boolean(opts.embed);
        await this.ensureMarkup();
        this.fillYearOptions();
        this.setDefaultPeriod();
        this.bindUi();
        this.syncModeButtons("bulan");

        if(this._embed){
            const mode = new URLSearchParams(window.location.search).get("mode");
            const hashMonthly = String(window.location.hash || "") === "#laporan-bulanan";
            if(hashMonthly || mode === "bulan"){
                await this.showMonthly();
                return;
            }
            await this.showDailyAudit();
            return;
        }

        this.applyQueryPrefill();
        this._visible = true;
        await this.loadAndRender();
    },

    async ensureMarkup(){
        const existing = document.getElementById("ablPage");
        if(existing) return;

        const host = document.getElementById("absensiMonthlyHost")
            || document.getElementById("absensiLaporanRoot");
        if(!host) return;

        const res = await fetch("../components/absensi-laporan-bulanan.html?v=20260816p15");
        if(!res.ok) throw new Error("Gagal memuat komponen laporan absensi");
        host.innerHTML = await res.text();
    },

    fillYearOptions(){
        const sel = document.getElementById("ablFilterTahun");
        if(!sel || sel.options.length) return;
        const nowY = Number(this.todayJakarta().slice(0, 4));
        for(let y = nowY + 1; y >= nowY - 4; y--){
            const opt = document.createElement("option");
            opt.value = String(y);
            opt.textContent = String(y);
            sel.appendChild(opt);
        }
    },

    setDefaultPeriod(){
        const today = this.todayJakarta();
        const [y, m] = today.split("-");
        const bulan = document.getElementById("ablFilterBulan");
        const tahun = document.getElementById("ablFilterTahun");
        if(bulan) bulan.value = String(Number(m));
        if(tahun) tahun.value = y;
        this.syncPeriodLabel();
    },

    applyQueryPrefill(){
        const params = new URLSearchParams(window.location.search);
        const nama = params.get("nama") || "";
        let storedNama = "";
        try{
            storedNama = sessionStorage.getItem("erp_absensi_karyawan_nama") || "";
        }catch(_e){ /* ignore */ }
        const cari = document.getElementById("ablFilterCari");
        if(cari && !cari.value){
            cari.value = nama || storedNama || "";
        }
        const filter = String(params.get("filter") || "").toLowerCase();
        if(filter.includes("denda")) this._activeFilter = "D";
    },

    applyEmployeeFocus(){
        const params = new URLSearchParams(window.location.search);
        let id = params.get("karyawan") || "";
        try{
            if(!id) id = sessionStorage.getItem("erp_absensi_karyawan_id") || "";
        }catch(_e){ /* ignore */ }
        if(!id) return;
        const emp = this._karyawanAll.find((k) => String(k.id) === String(id));
        const cari = document.getElementById("ablFilterCari");
        if(emp && cari && !this.searchQuery()){
            cari.value = emp.nama_karyawan || "";
        }
    },

    bindUi(){
        if(this._bound) return;
        this._bound = true;

        const reload = () => this.loadAndRender();
        document.getElementById("ablFilterCabang")?.addEventListener("change", reload);
        document.getElementById("ablFilterBulan")?.addEventListener("change", reload);
        document.getElementById("ablFilterTahun")?.addEventListener("change", reload);
        this.bindPeriodUi();
        document.getElementById("ablBtnRefresh")?.addEventListener("click", reload);
        document.getElementById("ablFilterCari")?.addEventListener("input", () => {
            const parsed = this.parseGlobalSearch();
            if(parsed.statusFromSearch) this._activeFilter = parsed.statusFromSearch;
            else if(!this._cardLocked) this._activeFilter = "";
            this.renderSummary(this._meta);
            this.renderDetail();
            if(this._matrixOpen) this.renderTable();
        });

        document.getElementById("ablBtnReset")?.addEventListener("click", () => this.resetFilter());
        document.getElementById("ablBtnMatrix")?.addEventListener("click", () => this.toggleMatrix());
        document.getElementById("ablBtnPrint")?.addEventListener("click", () => this.printReport());
        document.getElementById("ablBtnPrintDetail")?.addEventListener("click", () => this.printReport());

        document.addEventListener("click", (e) => {
            const modeBtn = e.target.closest("[data-absensi-mode]");
            if(modeBtn){
                e.preventDefault();
                this.setMode(modeBtn.getAttribute("data-absensi-mode") || "bulan");
                return;
            }
            const card = e.target.closest("[data-abl-filter]");
            if(card && this._visible){
                e.preventDefault();
                this.selectFilter(card.getAttribute("data-abl-filter") || "");
            }
        });
    },

    syncModeButtons(mode){
        document.querySelectorAll("[data-absensi-mode]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.getAttribute("data-absensi-mode") === mode);
        });
    },

    async setMode(mode){
        const next = mode === "hari" ? "hari" : "bulan";
        this.syncModeButtons(next);
        if(next === "hari"){
            if(this._embed) await this.showDailyAudit();
            else window.location.href = "./absensi.html?mode=hari";
            return;
        }
        await this.showMonthly();
    },

    captureAuditHomes(){
        if(this._dailyAuditHomes) return;
        const detail = document.getElementById("ablDetailBox");
        const matrixCard = document.getElementById("ablMatrixCard");
        const matrixSec = matrixCard?.closest(".abl-matrix-sec") || matrixCard;
        const makeHome = (el) => el ? { el, parent: el.parentNode, next: el.nextSibling } : null;
        this._dailyAuditHomes = {
            detail: makeHome(detail),
            matrix: makeHome(matrixSec)
        };
    },

    restoreMonthlyAudit(){
        const homes = this._dailyAuditHomes;
        if(!homes) return;
        [homes.detail, homes.matrix].forEach((home) => {
            if(!home?.el || !home.parent) return;
            if(home.next && home.next.parentNode === home.parent) home.parent.insertBefore(home.el, home.next);
            else home.parent.appendChild(home.el);
        });
    },

    mountDailyAudit(){
        const bridge = document.getElementById("absensiDailyAuditBridge");
        if(!bridge) return;
        this.captureAuditHomes();
        const detail = this._dailyAuditHomes?.detail?.el;
        const matrix = this._dailyAuditHomes?.matrix?.el;
        if(detail && detail.parentNode !== bridge) bridge.appendChild(detail);
        if(matrix && matrix.parentNode !== bridge) bridge.appendChild(matrix);
        bridge.hidden = false;
    },

    async showMonthly(){
        this._dayMode = false;
        this.restoreMonthlyAudit();
        const daily = document.getElementById("absensiDailyView");
        const host = document.getElementById("absensiMonthlyHost");
        const root = document.getElementById("absensiRoot");
        if(daily) daily.hidden = true;
        if(host) host.hidden = false;
        if(root) root.classList.add("is-abl-open");
        this._visible = true;
        this.syncModeButtons("bulan");
        try{
            const u = new URL(window.location.href);
            u.hash = "laporan-bulanan";
            history.replaceState(null, "", u.pathname + u.search + u.hash);
        }catch(_e){ /* ignore */ }
        this.syncHeader("DASHBOARD ABSENSI", "Ringkasan kehadiran Owner");
        if(!this._rows.length) await this.loadAndRender();
        else{
            this.syncHeaderContext();
            this.enhanceSelects();
            this.renderSummary(this._meta);
            this.renderDetail();
            if(this._matrixOpen) this.renderTable();
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    },

    async showDailyAudit(){
        this._dayMode = true;
        this._dailyDate = (typeof AbsensiOwner !== "undefined" && AbsensiOwner.selectedDate)
            ? AbsensiOwner.selectedDate()
            : (this._dailyDate || this.todayJakarta());

        const [y, m] = String(this._dailyDate || this.todayJakarta()).split("-");
        const bulan = document.getElementById("ablFilterBulan");
        const tahun = document.getElementById("ablFilterTahun");
        if(bulan) bulan.value = String(Number(m));
        if(tahun) tahun.value = String(y);

        const daily = document.getElementById("absensiDailyView");
        const host = document.getElementById("absensiMonthlyHost");
        const root = document.getElementById("absensiRoot");
        if(host) host.hidden = true;
        if(daily) daily.hidden = false;
        if(root) root.classList.remove("is-abl-open");
        this._visible = true;
        this.syncModeButtons("hari");
        try{
            if(window.location.hash === "#laporan-bulanan"){
                history.replaceState(null, "", window.location.pathname + window.location.search);
            }
        }catch(_e){ /* ignore */ }

        await this.loadAndRender();
        this.mountDailyAudit();
        this._matrixOpen = true;
        const matrixCard = document.getElementById("ablMatrixCard");
        if(matrixCard) matrixCard.hidden = false;
        const matrixBtn = document.getElementById("ablBtnMatrix");
        if(matrixBtn) matrixBtn.textContent = "Sembunyikan Matriks";
        this.renderDetail();
        this.renderTable();
        this.syncHeader("DASHBOARD ABSENSI", "Kehadiran & status karyawan");
        if(typeof AbsensiOwner !== "undefined" && AbsensiOwner.syncHeaderContext){
            AbsensiOwner.syncHeaderContext();
        }
    },

    hideMonthly(){
        return this.showDailyAudit();
    },

    effectivePeriodBounds(){
        if(this._dayMode){
            const iso = this.isoDate(this._dailyDate || (typeof AbsensiOwner !== "undefined" && AbsensiOwner.selectedDate ? AbsensiOwner.selectedDate() : this.todayJakarta()));
            return {
                year: Number(iso.slice(0, 4)),
                month: Number(iso.slice(5, 7)),
                days: 1,
                start: iso,
                end: iso,
                label: this.fmtDate(iso)
            };
        }
        return this.periodBounds();
    },

    async setDailyDate(iso){
        if(!this._dayMode) return;
        const next = this.isoDate(iso);
        if(!next) return;
        this._dailyDate = next;
        const [y, m] = next.split("-");
        const bulan = document.getElementById("ablFilterBulan");
        const tahun = document.getElementById("ablFilterTahun");
        const monthChanged = String(bulan?.value || "") !== String(Number(m)) || String(tahun?.value || "") !== String(y);
        if(bulan) bulan.value = String(Number(m));
        if(tahun) tahun.value = String(y);
        if(monthChanged) await this.loadAndRender();
        else{
            this.renderDetail();
            if(this._matrixOpen) this.renderTable();
        }
    },

    setDailySearch(value){
        if(!this._dayMode) return;
        const el = document.getElementById("ablFilterCari");
        if(el) el.value = String(value || "");
        const parsed = this.parseGlobalSearch();
        if(parsed.statusFromSearch) this._activeFilter = parsed.statusFromSearch;
        else if(!this._cardLocked) this._activeFilter = "";
        this.renderDetail();
        if(this._matrixOpen) this.renderTable();
    },

    async setDailyCabangName(name){
        if(!this._dayMode) return;
        const target = String(name || "").trim().toLowerCase();
        const sel = document.getElementById("ablFilterCabang");
        if(!sel) return;
        let value = "";
        if(target){
            const hit = this._cabangList.find((c) => String(c.nama_cabang || "").trim().toLowerCase() === target);
            value = hit ? String(hit.id) : "";
        }
        if(sel.value === value) return;
        sel.value = value;
        await this.loadAndRender();
    },

    setDailyStatusFilter(key){
        if(!this._dayMode) return;
        const map = {
            "": "",
            ALL: "",
            MASUK: "H",
            HADIR: "H",
            TERLAMBAT: "T",
            "BELUM ABSEN": "A",
            ALFA: "A",
            LIBUR: "L",
            IZIN: "I",
            SAKIT: "S",
            DENDA: "D",
            DENDA_BULAN: "D"
        };
        this._activeFilter = map[String(key || "").toUpperCase()] ?? "";
        this._cardLocked = Boolean(this._activeFilter);
        this.renderDetail();
        if(this._matrixOpen) this.renderTable();
    },

    syncHeader(title, sub){
        const t = document.getElementById("erpHeaderTitle");
        const s = document.getElementById("erpHeaderSub");
        if(t && title) t.textContent = title;
        if(s && sub) s.textContent = sub;
    },

    syncHeaderContext(){
        const cabangEl = document.getElementById("erpHeaderCabang");
        const periodeEl = document.getElementById("erpHeaderPeriode");
        const cabangSel = document.getElementById("ablFilterCabang");
        if(cabangEl){
            const opt = cabangSel?.selectedOptions?.[0];
            cabangEl.textContent = (opt && opt.value) ? opt.textContent.trim() : "Semua Cabang";
        }
        if(periodeEl){
            periodeEl.textContent = this.periodBounds().label;
        }
        if(typeof syncSidebarRoleMeta === "function") syncSidebarRoleMeta();
        this.syncPeriodLabel();
    },

    setBanner(text, isError){
        const box = document.getElementById("ablBanner");
        const label = document.getElementById("ablBannerText");
        if(!box) return;
        if(!text){
            box.hidden = true;
            return;
        }
        box.hidden = false;
        box.classList.toggle("is-error", Boolean(isError));
        if(label) label.textContent = text;
    },

    enhanceSelects(){
        if(typeof ErpCustomSelect === "undefined") return;
        const sel = document.getElementById("ablFilterCabang");
        if(!sel) return;
        sel.dataset.cselectReady = "";
        const wrap = sel.closest(".erp-cselect");
        if(wrap && wrap.parentNode){
            wrap.parentNode.insertBefore(sel, wrap);
            wrap.remove();
        }
        ErpCustomSelect.enhance(sel);
        ErpCustomSelect.bindNavKeys();
    },

    syncPeriodLabel(){
        const label = document.getElementById("ablPeriodLabel");
        const month = this.selectedMonth();
        const year = this.selectedYear();
        if(!label) return;
        if(month >= 1 && month <= 12 && year){
            label.textContent = `${this.MONTH_NAMES[month - 1]} ${year}`;
            return;
        }
        label.textContent = "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
    },

    periodYearBounds(){
        const sel = document.getElementById("ablFilterTahun");
        const years = [...(sel?.options || [])].map((o) => Number(o.value)).filter((y) => y >= 2000);
        if(!years.length){
            const nowY = Number(this.todayJakarta().slice(0, 4));
            return { min: nowY - 4, max: nowY + 1 };
        }
        return { min: Math.min(...years), max: Math.max(...years) };
    },

    bindPeriodUi(){
        if(this._periodBound) return;
        this._periodBound = true;

        document.getElementById("ablPeriodBtn")?.addEventListener("click", () => this.openPeriodModal());
        document.getElementById("ablPeriodApply")?.addEventListener("click", () => this.applyPeriodModal());
        document.getElementById("ablPeriodYearPrev")?.addEventListener("click", () => this.shiftPeriodYear(-1));
        document.getElementById("ablPeriodYearNext")?.addEventListener("click", () => this.shiftPeriodYear(1));
        document.getElementById("ablPeriodMonthGrid")?.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-abl-month]");
            if(!btn) return;
            this._periodDraftMonth = Number(btn.getAttribute("data-abl-month"));
            this.renderPeriodMonthGrid();
        });
        document.addEventListener("click", (e) => {
            if(e.target.closest("[data-abl-period-close]")){
                this.closePeriodModal();
            }
        });
        document.addEventListener("keydown", (e) => {
            if(e.key !== "Escape") return;
            const modal = document.getElementById("ablPeriodModal");
            if(!modal || modal.hidden) return;
            e.preventDefault();
            this.closePeriodModal();
        });
    },

    openPeriodModal(){
        const modal = document.getElementById("ablPeriodModal");
        if(!modal) return;
        this._periodDraftYear = this.selectedYear() || Number(this.todayJakarta().slice(0, 4));
        this._periodDraftMonth = this.selectedMonth() || Number(this.todayJakarta().slice(5, 7));
        modal.hidden = false;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("custom-cal-open");
        this.renderPeriodMonthGrid();
        document.getElementById("ablPeriodApply")?.focus({ preventScroll: true });
    },

    closePeriodModal(){
        const modal = document.getElementById("ablPeriodModal");
        if(modal){
            modal.hidden = true;
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
        }
        document.body.classList.remove("custom-cal-open");
        document.getElementById("ablPeriodBtn")?.focus({ preventScroll: true });
    },

    shiftPeriodYear(delta){
        const bounds = this.periodYearBounds();
        const next = Number(this._periodDraftYear || 0) + delta;
        this._periodDraftYear = Math.max(bounds.min, Math.min(bounds.max, next));
        this.renderPeriodMonthGrid();
    },

    renderPeriodMonthGrid(){
        const grid = document.getElementById("ablPeriodMonthGrid");
        const yearLabel = document.getElementById("ablPeriodYearLabel");
        const preview = document.getElementById("ablPeriodPreview");
        const applyBtn = document.getElementById("ablPeriodApply");
        const year = Number(this._periodDraftYear);
        const month = Number(this._periodDraftMonth);
        if(yearLabel) yearLabel.textContent = year ? String(year) : "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
        if(!grid) return;

        const today = this.todayJakarta();
        const curY = Number(today.slice(0, 4));
        const curM = Number(today.slice(5, 7));
        grid.innerHTML = this.MONTH_NAMES.map((name, idx) => {
            const m = idx + 1;
            const classes = ["cal-month-btn"];
            if(month === m) classes.push("is-selected");
            if(curY === year && curM === m) classes.push("is-current");
            return `<button type="button" class="${classes.join(" ")}" data-abl-month="${m}" role="option" aria-selected="${month === m ? "true" : "false"}">${name}</button>`;
        }).join("");

        const valid = year >= 2000 && month >= 1 && month <= 12;
        if(preview){
            preview.textContent = valid
                ? `${this.MONTH_NAMES[month - 1]} ${year}`
                : "Pilih bulan dan tahun";
        }
        if(applyBtn) applyBtn.disabled = !valid;
    },

    applyPeriodModal(){
        const month = Number(this._periodDraftMonth);
        const year = Number(this._periodDraftYear);
        if(!(month >= 1 && month <= 12) || !year) return;
        const bulan = document.getElementById("ablFilterBulan");
        const tahun = document.getElementById("ablFilterTahun");
        if(bulan) bulan.value = String(month);
        if(tahun) tahun.value = String(year);
        this.syncPeriodLabel();
        this.closePeriodModal();
        bulan?.dispatchEvent(new Event("change", { bubbles: true }));
    },

    async fetchAll(queryFactory){
        const pageSize = 1000;
        const all = [];
        let from = 0;
        for(;;){
            const q = queryFactory();
            const { data, error } = await q.range(from, from + pageSize - 1);
            if(error) throw error;
            const chunk = data || [];
            all.push(...chunk);
            if(chunk.length < pageSize) break;
            from += pageSize;
        }
        return all;
    },

    async loadCabang(){
        const { data, error } = await db.from("cabang").select("id,nama_cabang,aktif");
        if(error) throw error;
        this._cabangList = (data || [])
            .filter((c) => c && c.nama_cabang && !this.isFloatingCabang(c.nama_cabang))
            .sort((a, b) => String(a.nama_cabang).localeCompare(String(b.nama_cabang), "id"));

        const sel = document.getElementById("ablFilterCabang");
        if(!sel) return;
        const current = sel.value;
        sel.innerHTML = `<option value="">Semua Cabang</option>`;
        this._cabangList.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = String(c.id);
            opt.textContent = c.nama_cabang;
            sel.appendChild(opt);
        });
        if(current && [...sel.options].some((o) => o.value === current)){
            sel.value = current;
        }
    },

    async loadKaryawan(){
        const { data, error } = await db
            .from("karyawan")
            .select("id,nama_karyawan,jabatan,cabang_id,aktif,cabang(nama_cabang)")
            .order("nama_karyawan", { ascending: true });

        if(error){
            throw error;
        }

        const uniq = new Map();
        (data || []).forEach((k) => {
            if(!k || k.id == null) return;
            if(!uniq.has(String(k.id))) uniq.set(String(k.id), k);
        });

        this._karyawanRaw = [...uniq.values()];
        this._karyawanAll = this._karyawanRaw.filter((k) => this.isActiveKaryawan(k));
    },

    async loadAbsensi(year, month){
        const start = this.isoDay(year, month, 1);
        const end = this.isoDay(year, month, this.daysInMonth(year, month));
        const tries = [
            "karyawan_id,cabang_id,tanggal,jam_masuk,jam_pulang,status,status_absensi,terlambat_menit,denda,status_denda",
            "karyawan_id,cabang_id,tanggal,jam_masuk,jam_pulang,status,terlambat_menit,denda",
            "karyawan_id,cabang_id,tanggal,status,denda,terlambat_menit"
        ];
        let lastErr = null;
        for(const cols of tries){
            try{
                const rows = await this.fetchAll(() =>
                    db.from("absensi")
                        .select(cols)
                        .gte("tanggal", start)
                        .lte("tanggal", end)
                        .order("tanggal", { ascending: true })
                        .order("karyawan_id", { ascending: true })
                );
                this._absensiRows = rows;
                return;
            }catch(err){
                lastErr = err;
                if(!/column|status_absensi|status_denda/i.test(err.message || "")) break;
            }
        }
        if(lastErr) throw lastErr;
        this._absensiRows = [];
    },

    async loadPengaturan(){
        try{
            const { data, error } = await db
                .from("pengaturan_absensi")
                .select("jam_masuk,toleransi_menit,tarif_denda,max_denda,aktif")
                .limit(1);
            if(error){
                console.warn("pengaturan_absensi:", error);
                this._pengaturan = null;
                return;
            }
            this._pengaturan = (data || []).find((r) => r.aktif !== false) || data?.[0] || null;
        }catch(err){
            console.warn("pengaturan_absensi:", err);
            this._pengaturan = null;
        }
    },

    async loadJadwalLibur(year, month){
        const start = this.isoDay(year, month, 1);
        const end = this.isoDay(year, month, this.daysInMonth(year, month));
        const tries = [
            "karyawan_id, tanggal, status, status_canonical, keterangan",
            "karyawan_id, tanggal, status, keterangan",
            "karyawan_id, tanggal, status"
        ];

        let rows = [];
        let lastErr = null;
        for(const cols of tries){
            const { data, error } = await db
                .from("jadwal_libur")
                .select(cols)
                .gte("tanggal", start)
                .lte("tanggal", end);
            if(!error){
                rows = data || [];
                lastErr = null;
                break;
            }
            lastErr = error;
            const msg = String(error.message || "");
            if(!/column|schema cache|status_canonical|keterangan/i.test(msg)) break;
        }

        if(lastErr || !(rows || []).length){
            if(lastErr) console.warn("jadwal_libur range query error:", lastErr);
            const { data, error } = await db
                .from("jadwal_libur")
                .select("karyawan_id, tanggal, status");
            if(error){
                console.warn("jadwal_libur fallback error:", error);
            }else{
                const filtered = (data || []).filter((r) => {
                    const t = this.isoDate(r.tanggal);
                    return t >= start && t <= end;
                });
                if(filtered.length) rows = filtered;
            }
        }

        if((rows || []).length >= 1000){
            try{
                rows = await this.fetchAll(() =>
                    db.from("jadwal_libur")
                        .select("karyawan_id, tanggal, status")
                        .gte("tanggal", start)
                        .lte("tanggal", end)
                        .order("tanggal", { ascending: true })
                );
            }catch(err){
                console.warn("jadwal_libur paged query error:", err);
            }
        }

        const hasFauzi = (rows || []).some((r) =>
            String(r.karyawan_id) === "13" && this.isoDate(r.tanggal) === "2026-08-01"
        );
        if(!hasFauzi){
            const { data: probe, error: probeErr } = await db
                .from("jadwal_libur")
                .select("karyawan_id, tanggal, status")
                .eq("karyawan_id", 13)
                .eq("tanggal", "2026-08-01");
            if(probeErr) console.warn("jadwal_libur Fauzi probe error:", probeErr);
            else if(probe && probe.length) rows = (rows || []).concat(probe);
        }

        this._jadwalRows = rows || [];
        console.log("jadwal_libur loaded:", this._jadwalRows.length);
    },

    buildRows(){
        const year = this.selectedYear();
        const month = this.selectedMonth();
        const days = this.daysInMonth(year, month);
        const todayIso = this.todayJakarta();
        const elapsed = this.elapsedLastDay(year, month, days);
        const cabangId = this.selectedCabangId();

        const byEmpDay = new Map();
        (this._absensiRows || []).forEach((row) => {
            const kid = this.normId(row.karyawan_id);
            const tgl = this.isoDate(row.tanggal);
            if(!kid || !tgl) return;
            const key = `${kid}|${tgl}`;
            const prev = byEmpDay.get(key);
            if(!prev){
                byEmpDay.set(key, row);
                return;
            }
            const prevScore = Number(prev.denda || 0) + Number(prev.terlambat_menit || 0);
            const nextScore = Number(row.denda || 0) + Number(row.terlambat_menit || 0);
            if(nextScore >= prevScore) byEmpDay.set(key, row);
        });

        const byJadwal = new Map();
        (this._jadwalRows || []).forEach((row) => {
            const kid = this.normId(row.karyawan_id);
            const tgl = this.isoDate(row.tanggal);
            if(!kid || !tgl) return;
            const key = `${kid}|${tgl}`;
            const prev = byJadwal.get(key);
            if(!prev || (!this.jadwalCode(prev) && this.jadwalCode(row))){
                byJadwal.set(key, row);
            }
        });

        const jadwalIds = new Set(
            (this._jadwalRows || []).map((r) => this.normId(r.karyawan_id)).filter(Boolean)
        );
        const source = (this._karyawanRaw && this._karyawanRaw.length)
            ? this._karyawanRaw
            : this._karyawanAll;
        const employees = source.filter((k) => {
            const keep = this.isActiveKaryawan(k) || jadwalIds.has(this.normId(k.id));
            if(!keep) return false;
            if(cabangId){
                const cab = this._cabangList.find((c) => String(c.id) === String(cabangId));
                const nama = cab?.nama_cabang || "";
                const sameId = String(k.cabang_id) === String(cabangId);
                const sameName = nama && this.cabangNameOf(k) === nama;
                if(!sameId && !sameName) return false;
            }
            return true;
        }).sort((a, b) => {
            const ca = this.cabangNameOf(a).localeCompare(this.cabangNameOf(b), "id");
            if(ca !== 0) return ca;
            return String(a.nama_karyawan || "").localeCompare(String(b.nama_karyawan || ""), "id");
        });

        this._rows = employees.map((k) => {
            const daysMap = [];
            const hadirDates = [];
            const liburDates = [];
            const sakitDates = [];
            const izinDates = [];
            const alfaDates = [];
            const lateRecords = [];
            const dendaRecords = [];
            let masuk = 0, libur = 0, sakit = 0, izin = 0, terlambat = 0, missing = 0;
            let dendaSementara = 0, dendaFinal = 0;

            for(let d = 1; d <= days; d++){
                const iso = this.isoDay(year, month, d);
                const kid = this.normId(k.id);
                const rec = byEmpDay.get(`${kid}|${iso}`) || null;
                const jadwal = byJadwal.get(`${kid}|${iso}`) || this.findJadwal(k.id, iso);
                const future = iso > todayIso;
                const code = this.dayCode(rec, jadwal, iso, todayIso);
                if((kid === "13" || /fauzi/i.test(String(k.nama_karyawan || ""))) && iso === "2026-08-01"){
                    console.log("[ABL TEST] Fauzi 2026-08-01 final code:", code);
                    console.log("[ABL TEST] Fauzi 2026-08-01 inputs:", {
                        kid,
                        absensi: rec ? {
                            status: rec.status,
                            status_absensi: rec.status_absensi,
                            jam_masuk: rec.jam_masuk
                        } : null,
                        jadwal: jadwal ? {
                            status: jadwal.status,
                            status_canonical: jadwal.status_canonical
                        } : null
                    });
                }
                daysMap.push({ day: d, iso, code, future, rec });

                if(future) continue;

                if(rec){
                    const lateMin = this.lateMinutesOf(rec);
                    const sementara = this.dendaSementaraOf(rec);
                    const decision = this.dendaDecision(rec);
                    const finalAmt = decision === "cancelled"
                        ? 0
                        : (decision === "final" ? Number(rec.denda || sementara || 0) : null);
                    if(lateMin > 0 || sementara > 0 || Number(rec.denda || 0) > 0){
                        dendaSementara += sementara;
                        if(decision === "final") dendaFinal += Number(finalAmt || 0);
                        const dendaRec = {
                            day: d,
                            iso,
                            jam_masuk: rec.jam_masuk,
                            terlambat_menit: lateMin,
                            dendaSementara: sementara,
                            dendaFinal: finalAmt,
                            decision,
                            status_denda: rec.status_denda,
                            bucket: this.dendaBucket(rec.status_denda)
                        };
                        dendaRecords.push(dendaRec);
                        if(code === "T") lateRecords.push(dendaRec);
                    }else if(code === "T"){
                        lateRecords.push({
                            day: d,
                            iso,
                            jam_masuk: rec.jam_masuk,
                            terlambat_menit: lateMin,
                            dendaSementara: 0,
                            dendaFinal: null,
                            decision: "pending",
                            status_denda: rec.status_denda,
                            bucket: this.dendaBucket(rec.status_denda)
                        });
                    }
                }

                if(code === "H"){
                    masuk += 1;
                    hadirDates.push(d);
                }else if(code === "L"){
                    libur += 1;
                    liburDates.push(d);
                }else if(code === "S"){
                    sakit += 1;
                    sakitDates.push(d);
                }else if(code === "I"){
                    izin += 1;
                    izinDates.push(d);
                }else if(code === "T"){
                    terlambat += 1;
                    if(!lateRecords.some((x) => x.iso === iso)){
                        lateRecords.push({
                            day: d,
                            iso,
                            jam_masuk: rec?.jam_masuk,
                            terlambat_menit: rec ? this.lateMinutesOf(rec) : 0,
                            dendaSementara: rec ? this.dendaSementaraOf(rec) : 0,
                            dendaFinal: null,
                            decision: "pending",
                            status_denda: rec?.status_denda,
                            bucket: this.dendaBucket(rec?.status_denda)
                        });
                    }
                }else if(code === "A"){
                    missing += 1;
                    alfaDates.push(d);
                }
            }

            const liveElapsed = daysMap.filter((d) => !d.future && d.iso >= this.GO_LIVE_DATE).length;
            const denom = Math.max(0, liveElapsed - libur);
            const pct = denom === 0
                ? 0
                : Math.round(((masuk + terlambat) / denom) * 100);
            const full = liveElapsed > 0 && missing === 0 && sakit === 0 && izin === 0;

            return {
                id: k.id,
                nama: k.nama_karyawan || "-",
                cabang: this.cabangNameOf(k),
                jabatan: k.jabatan || "-",
                days: daysMap,
                masuk,
                libur,
                sakit,
                izin,
                terlambat,
                missing,
                denda: dendaSementara,
                dendaSementara,
                dendaFinal,
                dendaBelum: dendaSementara,
                dendaLunas: dendaFinal,
                dendaPotong: 0,
                hadirDates,
                liburDates,
                sakitDates,
                izinDates,
                alfaDates,
                lateRecords,
                dendaRecords,
                pct,
                bonus: full ? "FULL" : "BELUM FULL"
            };
        });

        const fauzi = this._rows.find((r) =>
            this.normId(r.id) === "13" || /fauzi/i.test(String(r.nama || ""))
        );
        const fauziDay = fauzi?.days?.find((d) => d.iso === "2026-08-01");
        if(!fauzi || !fauziDay){
            console.log("[ABL TEST] Fauzi 2026-08-01 final code:", "NOT IN ROWS", this._jadwalRows?.[0] || null);
        }

        const totals = this._rows.reduce((acc, r) => {
            acc.hadir += r.masuk;
            acc.izin += r.izin;
            acc.alfa += r.missing;
            acc.terlambat += r.terlambat;
            acc.libur += r.libur;
            acc.sakit += r.sakit;
            acc.dendaSementara += Number(r.dendaSementara || 0);
            acc.dendaFinal += Number(r.dendaFinal || 0);
            return acc;
        }, { hadir: 0, izin: 0, alfa: 0, terlambat: 0, libur: 0, sakit: 0, dendaSementara: 0, dendaFinal: 0 });
        console.log("[ABL TEST] totals:", totals);

        return { year, month, days, elapsed };
    },

    scopedRows(){
        const { text } = this.activeQuery();
        if(!text) return this._rows;
        return (this._rows || []).filter((r) => this.matchesText(r, text));
    },

    renderSummary(meta){
        const scoped = this.scopedRows();
        const countPeople = (pred) => scoped.filter(pred).length;
        const countDays = (pick) => scoped.reduce((n, r) => n + pick(r), 0);

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.textContent = val;
        };

        setText("ablSumKaryawan", String(scoped.length));
        setText("ablSumHadirPeople", `${countPeople((r) => r.masuk > 0)} Karyawan`);
        setText("ablSumHadirDays", `${countDays((r) => r.masuk)} Hari`);
        setText("ablSumTerlambatPeople", `${countPeople((r) => r.terlambat > 0)} Karyawan`);
        setText("ablSumTerlambatDays", `${countDays((r) => r.terlambat)} Hari`);
        setText("ablSumAlfaPeople", `${countPeople((r) => r.missing > 0)} Karyawan`);
        setText("ablSumAlfaDays", `${countDays((r) => r.missing)} Hari`);
        setText("ablSumLiburPeople", `${countPeople((r) => r.libur > 0)} Karyawan`);
        setText("ablSumLiburDays", `${countDays((r) => r.libur)} Hari`);
        setText("ablSumIzinPeople", `${countPeople((r) => r.izin > 0)} Karyawan`);
        setText("ablSumIzinDays", `${countDays((r) => r.izin)} Hari`);
        setText("ablSumSakitPeople", `${countPeople((r) => r.sakit > 0)} Karyawan`);
        setText("ablSumSakitDays", `${countDays((r) => r.sakit)} Hari`);

        const dendaPeople = countPeople((r) => Number(r.dendaSementara || 0) > 0 || Number(r.dendaFinal || 0) > 0 || (r.dendaRecords || []).length > 0);
        const dendaTotal = scoped.reduce((n, r) => n + Number(r.dendaSementara || 0), 0);
        setText("ablSumDenda", this.formatRp(dendaTotal));
        setText("ablSumDendaPeople", `${dendaPeople} Karyawan`);

        const activeStatus = this.activeQuery().status;
        document.querySelectorAll("[data-abl-filter]").forEach((card) => {
            card.classList.toggle("is-active", card.getAttribute("data-abl-filter") === activeStatus);
        });

        const cabangSel = document.getElementById("ablFilterCabang");
        const cabangLabel = cabangSel?.selectedOptions?.[0]?.textContent?.trim() || "Semua Cabang";
        const period = this.periodBounds();
        const elapsedLabel = `ALFA otomatis mulai ${this.GO_LIVE_DATE} Ãƒâ€šÃ‚Â· tanggal kosong sebelumnya tidak dihitung`;
        const setMeta = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.textContent = val;
        };
        setMeta("ablMetaPeriode", `Periode: ${period.label}`);
        setMeta("ablMetaCabang", `Cabang: ${cabangLabel}`);
        setMeta("ablMetaElapsed", `Hari dihitung: ${elapsedLabel}`);
    },

    selectFilter(key){
        const status = String(key || "").toUpperCase();
        if(this._cardLocked && this._activeFilter === status){
            this._activeFilter = "";
            this._cardLocked = false;
        }else{
            this._activeFilter = status;
            this._cardLocked = true;
        }
        this.renderSummary(this._meta);
        this.renderDetail();
        if(this._matrixOpen) this.renderTable();
        document.getElementById("ablDetailBox")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    },

    resetFilter(){
        this._activeFilter = "";
        this._cardLocked = false;
        const cari = document.getElementById("ablFilterCari");
        if(cari) cari.value = "";
        this.renderSummary(this._meta);
        this.renderDetail();
        if(this._matrixOpen) this.renderTable();
    },

    viewRows(statusOverride){
        const { text, status } = this.activeQuery();
        const st = String(statusOverride || status || "").trim().toUpperCase();
        return (this._rows || []).filter((r) => {
            if(!this.matchesText(r, text)) return false;
            return this.rowHasStatus(r, st);
        });
    },

    renderDetail(){
        const title = document.getElementById("ablDetailTitle");
        const sub = document.getElementById("ablDetailSub");
        const eyebrow = document.getElementById("ablDetailEyebrow");
        const empty = document.getElementById("ablDetailEmpty");
        const table = document.getElementById("ablDetailTable");
        const thead = document.getElementById("ablDetailThead");
        const tbody = document.getElementById("ablDetailTbody");
        const countEl = document.getElementById("ablDetailCount");
        if(!table || !thead || !tbody) return;

        const period = this.effectivePeriodBounds();
        const { status } = this.activeQuery();
        if(eyebrow) eyebrow.textContent = "RINCIAN";

        const rows = this.eventRows();
        const filterTxt = this.filterLabelText();
        if(title) title.textContent = status
            ? `RINCIAN ${this.FILTER_LABEL[status] || this.DAY_STATUS_LABEL[status] || status}`
            : "Hasil rincian";
        if(sub) sub.textContent = `Periode ${period.label} Ãƒâ€šÃ‚Â· Filter: ${filterTxt}`;

        if(countEl){
            countEl.textContent = rows.length
                ? `Menampilkan ${rows.length} kejadian pada periode aktif`
                : `Tidak ada kejadian sesuai filter pada ${period.label}`;
        }
        if(!rows.length){
            table.hidden = true;
            if(empty){
                empty.hidden = false;
                empty.innerHTML = `<strong>Tidak ada data</strong><span>Ubah pencarian, card status, cabang, atau periode.</span>`;
            }
            return;
        }

        if(empty) empty.hidden = true;
        table.hidden = false;
        table.className = "abl-detail-table is-day";
        thead.innerHTML = `<tr><th>Nama</th><th>Cabang</th><th>Jabatan</th><th>Tanggal</th><th>Status</th></tr>`;
        tbody.innerHTML = rows.map((r) => `
            <tr>
                <td class="is-name">${this.escapeHtml(r.nama)}</td>
                <td>${this.escapeHtml(r.cabang)}</td>
                <td>${this.escapeHtml(r.jabatan)}</td>
                <td>${this.escapeHtml(this.fmtDate(r.iso))}</td>
                <td><span class="abl-st ${this.markClass(r.code)}">${this.escapeHtml(r.label)}</span></td>
            </tr>
        `).join("");
    },

    matrixRows(){
        const { text, status } = this.activeQuery();
        if(!this._dayMode) return this.viewRows(status === "D" ? "" : status);
        const iso = this.effectivePeriodBounds().start;
        return (this._rows || []).filter((r) => {
            if(!this.matchesText(r, text)) return false;
            if(!status || status === "D") return true;
            const day = (r.days || []).find((d) => d.iso === iso);
            return this.matrixDisplayCode(day) === status;
        });
    },

    fillViewCabang(){},

    fillMatrixCabang(){},

    enhanceViewSelects(){},

    enhanceMatrixSelects(){},

    resetMatrixFilters(){
        this.resetFilter();
    },

    getPrintClock(){
        const now = new Date();
        const dateLabel = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric"
        }).format(now);
        const timeLabel = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false
        }).format(now) + " WIB";
        return { dateLabel, timeLabel };
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
            }catch(_e){ /* try next */ }
        }
        return "";
    },

    getAbsensiPrintCss(){
        return `
  :root{
    --navy:#243b55; --ink:#2a3544; --muted:#6b7a8c; --line:#d5dde8;
    --gold:#b8922f; --gold-line:#c9a84a; --soft:#f6f8fb;
  }
  *{ box-sizing:border-box; }
  @page{ size:A4 portrait; margin:10mm 10mm 13mm 10mm; }
  html,body{
    margin:0; padding:0; background:#fff; color:var(--ink);
    font-family:Arial,"Segoe UI",Helvetica,sans-serif;
    font-size:9pt; line-height:1.28;
    height:auto; min-height:0;
  }
  body{ padding:0 0 10mm; }
  .sheet{ width:100%; max-width:190mm; margin:0 auto; min-height:0; }
  .no-print{ margin-top:14px; }
  .no-print button{
    border:1px solid var(--gold); background:#f4ead0; color:var(--navy);
    font-weight:700; padding:9px 14px; border-radius:6px; cursor:pointer;
  }
  .head{ display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .brand{ display:flex; align-items:center; gap:10px; min-width:0; }
  .brand img{ width:44px; height:44px; object-fit:contain; display:block; }
  .brand .copy h1{
    margin:0; font-size:13.5pt; font-weight:800; letter-spacing:.04em;
    color:var(--navy); text-transform:uppercase;
  }
  .brand .copy .doc{ margin:2px 0 0; font-size:9.5pt; font-weight:700; color:var(--ink); letter-spacing:.08em; text-transform:uppercase; }
  .brand .copy .sys{ margin:1px 0 0; font-size:7.5pt; font-weight:600; letter-spacing:.1em; color:var(--muted); text-transform:uppercase; }
  .head-right{ text-align:right; flex:0 0 auto; }
  .head-right .mark{ font-size:8pt; font-weight:800; letter-spacing:.12em; color:var(--navy); text-transform:uppercase; }
  .head-right .mark em{ display:block; margin-top:2px; font-style:normal; color:var(--gold); }
  .rule{ height:2px; margin:6px 0 7px; background:linear-gradient(90deg,var(--gold-line),#e7d7a4 55%,transparent); }
  .title-wrap{ margin:0 0 7px; }
  .title-wrap .t1{ margin:0; font-size:14pt; line-height:1.2; font-weight:800; color:var(--navy); letter-spacing:.04em; }
  .title-wrap .sub{ margin:4px 0 0; font-size:8.5pt; color:var(--muted); }
  .meta{
    display:grid; grid-template-columns:1fr 1fr; gap:2px 24px;
    padding:6px 8px; margin:0 0 7px;
    border:1px solid var(--line); border-left:3px solid var(--gold-line);
    background:var(--soft);
  }
  .meta .item{ padding:3px 0; }
  .meta .lbl{ display:block; font-size:7pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
  .meta .val{ display:block; margin-top:1px; font-size:9.5pt; font-weight:700; color:var(--ink); }
  table.rpt{ width:100%; border-collapse:collapse; table-layout:fixed; }
  table.rpt thead{ display:table-header-group; }
  table.rpt th{
    background:#2f4a68; color:#f8fafc; font-size:7.5pt; font-weight:800;
    letter-spacing:.05em; text-transform:uppercase; text-align:left;
    padding:5px 5px; border:1px solid #2f4a68; border-bottom:2px solid var(--gold-line); vertical-align:middle;
  }
  table.rpt td{
    padding:5px 5px; border:1px solid #e2e8f0; vertical-align:top;
    font-size:8.2pt; color:var(--ink);
    overflow-wrap:break-word; word-break:normal;
  }
  table.rpt tbody tr:nth-child(even) td{ background:#f8fafc; }
  table.rpt .col-nama{ width:24%; }
  table.rpt .col-cabang{ width:18%; }
  table.rpt .col-jabatan{ width:16%; }
  table.rpt .col-tgl{ width:22%; }
  table.rpt .col-status{ width:20%; }
  tr{ page-break-inside:avoid; break-inside:avoid; }
  .sign{
    page-break-inside:avoid; break-inside:avoid;
    page-break-before:auto; break-before:auto;
  }
  .audit-note{
    margin:5px 0 5px; padding:5px 7px;
    border:1px solid #e6ebf0; background:#fafbfc;
    font-size:7.5pt; color:var(--muted); line-height:1.45;
  }
  .sign.keep{
    margin:3px 0 0; display:grid; grid-template-columns:1fr 1fr; gap:28px;
  }
  .sign .box{ text-align:center; }
  .sign .who{ font-size:9pt; font-weight:700; color:var(--ink); }
  .sign .role{ margin-top:2px; font-size:7.5pt; font-weight:800; letter-spacing:.12em; color:var(--muted); text-transform:uppercase; }
  .sign .space{ height:18px; }
  .sign .name{ font-size:9.5pt; font-weight:800; color:var(--navy); }
  .sign .line{ margin:4px auto 0; width:68%; border-top:1px solid #8e9aab; }
  .foot{
    position:fixed; left:0; right:0; bottom:0;
    padding:3px 10mm 0; border-top:1.5px solid var(--gold-line);
    display:grid; grid-template-columns:1.1fr 1.2fr 1fr; gap:8px; align-items:end;
    font-size:7pt; color:var(--muted); background:#fff;
  }
  .foot b{ display:block; color:var(--navy); font-size:7.5pt; }
  .foot .c{ text-align:center; }
  .foot .r{ text-align:right; }
  @media print{
    .no-print{ display:none !important; }
    body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
  @media screen{
    body{ padding:16px 16px 28px; background:#e9eef3; }
    .sheet{ background:#fff; padding:16px 16px 18px; box-shadow:0 8px 28px rgba(13,27,42,.12); }
  }`;
    },

    async printReport(){
        const period = this.effectivePeriodBounds();
        const cabangSel = this._dayMode
            ? document.getElementById("absensiFilterCabang")
            : document.getElementById("ablFilterCabang");
        const cabangLabel = this.cleanPrintText(cabangSel?.selectedOptions?.[0]?.textContent?.trim() || "Semua Cabang");
        const filterTxt = this.printFilterLabel();
        const rows = this.eventRows();
        if(!rows.length){
            window.alert("Tidak ada data sesuai filter aktif untuk dicetak.");
            return;
        }
        const clock = this.getPrintClock();
        const logoSrc = await this.resolvePrintLogoSrc();
        const body = rows.map((r) => `
            <tr>
                <td class="col-nama">${this.escapeHtml(this.cleanPrintText(r.nama))}</td>
                <td class="col-cabang">${this.escapeHtml(this.cleanPrintText(r.cabang))}</td>
                <td class="col-jabatan">${this.escapeHtml(this.cleanPrintText(r.jabatan))}</td>
                <td class="col-tgl">${this.escapeHtml(this.cleanPrintText(this.fmtDate(r.iso)))}</td>
                <td class="col-status">${this.escapeHtml(this.cleanPrintText(r.label))}</td>
            </tr>
        `).join("");
        const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Absensi — ERP VAX WIJAYA</title>
<style>${this.getAbsensiPrintCss()}</style></head><body>
  <footer class="foot" aria-hidden="true">
    <div><b>ERP VAX WIJAYA</b>ABSENSI</div>
    <div class="c">INTERNAL / CONFIDENTIAL<br>Generated automatically</div>
    <div class="r">${this.escapeHtml(this.cleanPrintText(clock.dateLabel))}<br>${this.escapeHtml(this.cleanPrintText(clock.timeLabel))}</div>
  </footer>
  <div class="sheet">
    <header class="head">
      <div class="brand">
        ${logoSrc ? `<img src="${logoSrc}" alt="ERP VAX WIJAYA" />` : ""}
        <div class="copy">
          <h1>ERP VAX WIJAYA</h1>
          <div class="doc">Absensi</div>
          <div class="sys">Enterprise Management System</div>
        </div>
      </div>
      <div class="head-right">
        <div class="mark">Dokumen Operasional<em>Internal</em></div>
      </div>
    </header>
    <div class="rule"></div>
    <div class="title-wrap">
      <div class="t1">LAPORAN ABSENSI</div>
      <p class="sub">Rekap kehadiran sesuai filter aktif.</p>
    </div>
    <section class="meta">
      <div>
        <div class="item"><span class="lbl">Cabang</span><span class="val">${this.escapeHtml(cabangLabel)}</span></div>
        <div class="item"><span class="lbl">Periode</span><span class="val">${this.escapeHtml(this.cleanPrintText(period.label))}</span></div>
        <div class="item"><span class="lbl">Filter</span><span class="val">${this.escapeHtml(filterTxt)}</span></div>
      </div>
      <div>
        <div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${this.escapeHtml(this.cleanPrintText(clock.dateLabel))}</span></div>
        <div class="item"><span class="lbl">Waktu Cetak</span><span class="val">${this.escapeHtml(this.cleanPrintText(clock.timeLabel))}</span></div>
      </div>
    </section>
    <table class="rpt">
      <thead>
        <tr>
          <th class="col-nama">Nama</th>
          <th class="col-cabang">Cabang</th>
          <th class="col-jabatan">Jabatan</th>
          <th class="col-tgl">Tanggal</th>
          <th class="col-status">Status</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <p class="audit-note">Status mengikuti tanggal kejadian, bukan tanggal approval. Dicetak dari ERP VAX Absensi.</p>
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
  <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 220); };<\/script>
</body></html>`;
        const w = window.open("", "_blank");
        if(!w){
            window.alert("Popup diblokir. Izinkan popup untuk mencetak.");
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
    },

    toggleMatrix(){
        this._matrixOpen = !this._matrixOpen;
        const card = document.getElementById("ablMatrixCard");
        const btn = document.getElementById("ablBtnMatrix");
        if(card) card.hidden = !this._matrixOpen;
        if(btn) btn.textContent = this._matrixOpen
            ? "Sembunyikan Matriks"
            : "Lihat Matriks Absensi Lengkap";
        if(this._matrixOpen){
            this.fillMatrixCabang();
            this.enhanceMatrixSelects();
            this.renderTable();
            card?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    },

    renderTable(){
        const thead = document.getElementById("ablThead");
        const tbody = document.getElementById("ablTbody");
        const table = document.getElementById("ablTable");
        const empty = document.getElementById("ablEmpty");
        const loading = document.getElementById("ablLoading");
        const countEl = document.getElementById("ablMatrixCount");
        if(!thead || !tbody || !table) return;
        if(loading) loading.hidden = true;

        const rows = this.matrixRows();
        const total = (this._rows || []).length;
        if(countEl){
            countEl.textContent = rows.length
                ? `Menampilkan ${rows.length} dari ${total} karyawan`
                : `Tidak ada karyawan sesuai filter Ãƒâ€šÃ‚Â· ${total} karyawan di periode ini`;
        }
        if(!rows.length){
            table.hidden = true;
            if(empty) empty.hidden = false;
            return;
        }

        if(empty) empty.hidden = true;
        table.hidden = false;

        const sampleDays = rows[0]?.days || [];
        const dayHeads = sampleDays.map((d) =>
            `<th class="abl-th-day${d.future ? " is-future" : ""}">${d.day}</th>`
        ).join("");

        thead.innerHTML = `
            <tr>
                <th class="abl-th-id abl-th-no abl-sticky">No</th>
                <th class="abl-th-id abl-th-nama abl-sticky">Nama</th>
                <th class="abl-th-id abl-th-cabang abl-sticky">Cabang</th>
                <th class="abl-th-id abl-th-jabatan abl-sticky">Jabatan</th>
                ${dayHeads}
                <th class="abl-th-sum">Masuk</th>
                <th class="abl-th-sum">Libur</th>
                <th class="abl-th-sum">Sakit</th>
                <th class="abl-th-sum">Izin</th>
                <th class="abl-th-sum">Terlambat</th>
                <th class="abl-th-denda">Denda</th>
                <th class="abl-th-pct">% Kehadiran</th>
                <th class="abl-th-bonus">Bonus Absensi</th>
            </tr>
        `;

        tbody.innerHTML = rows.map((r, idx) => {
            const dayCells = r.days.map((d) => {
                const show = this.matrixDisplayCode(d);
                const cls = this.markClass(show);
                return `<td class="abl-td-day${d.future ? " is-future" : ""}"><span class="abl-mark ${cls}">${show}</span></td>`;
            }).join("");
            const bonusCls = r.bonus === "FULL" ? "is-full" : "is-belum";
            return `
                <tr>
                    <td class="abl-td-id abl-td-no abl-sticky">${idx + 1}</td>
                    <td class="abl-td-id abl-td-nama abl-sticky">${this.escapeHtml(r.nama)}</td>
                    <td class="abl-td-id abl-td-cabang abl-sticky">${this.escapeHtml(r.cabang)}</td>
                    <td class="abl-td-id abl-td-jabatan abl-sticky">${this.escapeHtml(r.jabatan)}</td>
                    ${dayCells}
                    <td class="abl-td-sum">${r.masuk}</td>
                    <td class="abl-td-sum">${r.libur}</td>
                    <td class="abl-td-sum">${r.sakit}</td>
                    <td class="abl-td-sum">${r.izin}</td>
                    <td class="abl-td-sum">${r.terlambat}</td>
                    <td class="abl-td-denda">${this.formatRp(r.denda)}</td>
                    <td class="abl-td-pct">${r.pct}%</td>
                    <td><span class="abl-bonus ${bonusCls}">${r.bonus}</span></td>
                </tr>
            `;
        }).join("");
    },

    async loadAndRender(){
        const token = ++this._loadToken;
        this.setBanner("Memuat ringkasan absensiÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");

        const year = this.selectedYear();
        const month = this.selectedMonth();
        if(!year || !month) return;

        try{
            await this.loadCabang();
            if(token !== this._loadToken) return;
            await this.loadKaryawan();
            if(token !== this._loadToken) return;
            this.applyEmployeeFocus();
            await this.loadAbsensi(year, month);
            if(token !== this._loadToken) return;
            await this.loadPengaturan();
            if(token !== this._loadToken) return;
            try{
                await this.loadJadwalLibur(year, month);
            }catch(jadwalErr){
                console.warn("jadwal_libur load failed:", jadwalErr);
                this._jadwalRows = [];
                console.log("jadwal_libur loaded:", 0);
            }
            if(token !== this._loadToken) return;

            this._meta = this.buildRows();
            this.setBanner("");
            this.renderSummary(this._meta);
            this.renderDetail();
            if(this._matrixOpen) this.renderTable();
            this.enhanceSelects();
            this.syncHeaderContext();
        }catch(err){
            console.error(err);
            this.setBanner(err?.message || "Gagal memuat laporan absensi.", true);
        }
    }
};

window.AbsensiLaporanBulanan = AbsensiLaporanBulanan;
console.log("[ABL] jadwal_libur pipeline active");

/* =========================================================
   VAX-20260817-SEARCH-TARGET-FUTURE-DETAIL
   - Enter search -> scroll ke nama target
   - highlight target
   - future LIBUR / IZIN / SAKIT final tetap dianggap valid di detail
   ========================================================= */
(function installAbsensiSearchTarget(){

    if(window.__vaxAbsensiSearchTargetInstalled) return;
    window.__vaxAbsensiSearchTargetInstalled = true;

    function norm(v){
        return String(v || "")
            .normalize("NFKC")
            .trim()
            .toLowerCase();
    }

    function clearTarget(){
        document
            .querySelectorAll(".vax-search-target")
            .forEach(el => el.classList.remove("vax-search-target"));
    }

    function findTargetRow(query){
        const q = norm(query);
        if(!q) return null;

        // Prioritas hasil rincian
        const detailRows = [
            ...document.querySelectorAll(
                "#ablDetailBox tbody tr, #ablDetailBox .abl-detail-table tbody tr"
            )
        ];

        let hit = detailRows.find(row => {
            const first =
                row.querySelector("td:first-child")?.textContent ||
                row.textContent ||
                "";
            return norm(first).includes(q);
        });

        if(hit) return hit;

        // Fallback ke Matrix
        const matrixRows = [
            ...document.querySelectorAll("#ablTbody tr")
        ];

        hit = matrixRows.find(row => {
            const nama =
                row.querySelector(".abl-td-nama")?.textContent ||
                row.querySelector("td:nth-child(2)")?.textContent ||
                row.textContent ||
                "";
            return norm(nama).includes(q);
        });

        return hit || null;
    }

    function goToTarget(input){
        const q = String(input?.value || "").trim();
        if(!q) return;

        clearTarget();

        // Tunggu render hasil input selesai
        setTimeout(() => {
            const target = findTargetRow(q);

            if(!target){
                return;
            }

            target.classList.add("vax-search-target");

            target.scrollIntoView({
                behavior:"smooth",
                block:"start"
            });

            setTimeout(() => {
                window.scrollBy({
                    top:-190,
                    behavior:"smooth"
                });
            },180);

            setTimeout(() => {
                target.classList.remove("vax-search-target");
            },2200);

        },80);
    }

    function bindInput(id){
        const el = document.getElementById(id);
        if(!el || el.dataset.vaxEnterBound === "1") return;

        el.dataset.vaxEnterBound = "1";

        el.addEventListener("keydown",e => {
            if(e.key !== "Enter") return;

            e.preventDefault();
            goToTarget(el);
        });
    }

    function bindAll(){
        bindInput("ablFilterCari");
        bindInput("ablDetailCari");
        bindInput("ablMatrixCari");
        bindInput("cariNama");
    }

    const observer = new MutationObserver(() => bindAll());

    observer.observe(document.documentElement,{
        childList:true,
        subtree:true
    });

    if(document.readyState === "loading"){
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(bindAll,250),
            {once:true}
        );
    }else{
        setTimeout(bindAll,250);
    }

})();

/* =========================================================
   VAX-20260817-EMPLOYEE-DETAIL-FROM-MATRIX

   FINAL RULE:
   MATRIX = source of truth visual status harian.
   Saat search menghasilkan tepat 1 karyawan:
   - tampilkan ringkasan karyawan
   - Rincian 1-31 mengikuti r.days yang sama dengan Matrix
   ========================================================= */
(function installEmployeeDetailFromMatrix(){

    if(
        typeof AbsensiLaporanBulanan === "undefined" ||
        AbsensiLaporanBulanan.__vaxEmployeeTruthInstalled
    ) return;

    AbsensiLaporanBulanan.__vaxEmployeeTruthInstalled = true;

    const originalRenderDetail =
        AbsensiLaporanBulanan.renderDetail.bind(AbsensiLaporanBulanan);

    function norm(v){
        return String(v || "")
            .normalize("NFKC")
            .trim()
            .toLowerCase();
    }

    function activeSearch(){
        const ids = [
            "ablFilterCari",
            "ablDetailCari",
            "ablMatrixCari"
        ];

        for(const id of ids){
            const el = document.getElementById(id);
            const value = String(el?.value || "").trim();

            if(value) return value;
        }

        return "";
    }

    function labelOf(code, day){
        if(code === "H") return "HADIR";
        if(code === "T") return "TERLAMBAT";
        if(code === "L") return "LIBUR";
        if(code === "I") return "IZIN";
        if(code === "S") return "SAKIT";
        if(code === "A") return "ALFA";

        const iso = String(day?.iso || "").slice(0,10);
        const today = new Date();
        const todayIso =
            `${today.getFullYear()}-` +
            `${String(today.getMonth()+1).padStart(2,"0")}-` +
            `${String(today.getDate()).padStart(2,"0")}`;

        if(iso && iso < "2026-08-15"){
            return "TIDAK DIHITUNG";
        }

        if(iso && iso > todayIso){
            return "BELUM / MASA DEPAN";
        }

        return "BELUM / MASA DEPAN";
    }

    function countStatuses(ctx,row){
        const result = {
            H:0,
            T:0,
            L:0,
            I:0,
            S:0,
            A:0
        };

        (row.days || []).forEach(day => {
            const code = ctx.matrixDisplayCode(day);

            if(Object.prototype.hasOwnProperty.call(result,code)){
                result[code]++;
            }
        });

        return result;
    }

    function ensureQuickSummary(table){
        let box =
            document.getElementById("vaxEmployeeQuickSummary");

        if(box) return box;

        box = document.createElement("section");
        box.id = "vaxEmployeeQuickSummary";
        box.className = "vax-employee-quick-summary";

        table.parentNode.insertBefore(box,table);

        return box;
    }

    function hideQuickSummary(){
        const box =
            document.getElementById("vaxEmployeeQuickSummary");

        if(box) box.hidden = true;
    }

    AbsensiLaporanBulanan.renderDetail = function(){

        const table = document.getElementById("ablDetailTable");
        const thead = document.getElementById("ablDetailThead");
        const tbody = document.getElementById("ablDetailTbody");
        const title = document.getElementById("ablDetailTitle");
        const sub = document.getElementById("ablDetailSub");
        const eyebrow = document.getElementById("ablDetailEyebrow");
        const empty = document.getElementById("ablDetailEmpty");
        const countEl = document.getElementById("ablDetailCount");

        if(!table || !thead || !tbody){
            return originalRenderDetail();
        }

        const q = norm(activeSearch());

        const matches = q
            ? (this._rows || []).filter(row =>
                norm(row.nama).includes(q)
              )
            : [];

        // Jika bukan tepat satu karyawan,
        // behavior existing tetap dipakai.
        if(matches.length !== 1){
            hideQuickSummary();
            return originalRenderDetail();
        }

        const row = matches[0];

        if(eyebrow) eyebrow.textContent = "RINCIAN KARYAWAN";
        if(title) title.textContent = row.nama;

        const period =
            typeof this.periodBounds === "function"
                ? this.periodBounds()
                : null;

        if(sub){
            sub.textContent =
                `${row.cabang} Â· ${row.jabatan}` +
                (period?.label ? ` Â· ${period.label}` : "");
        }

        const counts = countStatuses(this,row);
        const quick = ensureQuickSummary(table);

        quick.hidden = false;

        quick.innerHTML = `
            <div class="vax-employee-head">
                <div>
                    <span>RINGKASAN KARYAWAN</span>
                    <strong>${this.escapeHtml(row.nama)}</strong>
                    <small>
                        ${this.escapeHtml(row.cabang)}
                        Â·
                        ${this.escapeHtml(row.jabatan)}
                    </small>
                </div>

                <div class="vax-employee-main-answer">
                    <span>LIBUR BULAN INI</span>
                    <strong>${counts.L} Hari</strong>
                </div>
            </div>

            <div class="vax-employee-stat-grid">
                <div class="is-h">
                    <span>Hadir</span>
                    <strong>${counts.H}</strong>
                    <em>Hari</em>
                </div>

                <div class="is-t">
                    <span>Terlambat</span>
                    <strong>${counts.T}</strong>
                    <em>Hari</em>
                </div>

                <div class="is-l">
                    <span>Libur</span>
                    <strong>${counts.L}</strong>
                    <em>Hari</em>
                </div>

                <div class="is-i">
                    <span>Izin</span>
                    <strong>${counts.I}</strong>
                    <em>Hari</em>
                </div>

                <div class="is-s">
                    <span>Sakit</span>
                    <strong>${counts.S}</strong>
                    <em>Hari</em>
                </div>

                <div class="is-a">
                    <span>Alfa</span>
                    <strong>${counts.A}</strong>
                    <em>Hari</em>
                </div>
            </div>
        `;

        const dailyRows = (row.days || []).map(day => {
            const code = this.matrixDisplayCode(day);
            const label = labelOf(code, day);

            return `
                <tr>
                    <td class="is-name">
                        ${this.escapeHtml(row.nama)}
                    </td>

                    <td>
                        ${this.escapeHtml(row.cabang)}
                    </td>

                    <td>
                        ${this.escapeHtml(row.jabatan)}
                    </td>

                    <td>
                        ${this.escapeHtml(
                            typeof this.fmtDate === "function"
                                ? this.fmtDate(day.iso)
                                : day.iso
                        )}
                    </td>

                    <td>
                        <span class="abl-st ${this.markClass(code)}">
                            ${this.escapeHtml(label)}
                        </span>
                    </td>
                </tr>
            `;
        });

        if(empty) empty.hidden = true;

        table.hidden = false;
        table.className = "abl-detail-table is-day";

        thead.innerHTML = `
            <tr>
                <th>Nama</th>
                <th>Cabang</th>
                <th>Jabatan</th>
                <th>Tanggal</th>
                <th>Status</th>
            </tr>
        `;

        tbody.innerHTML = dailyRows.join("");

        if(countEl){
            countEl.textContent =
                `Status harian 1â€“${dailyRows.length} Â· sumber sama dengan Matrix`;
        }
    };

})();

/* =========================================================
   VAX-20260817-ENTER-GO-RINCIAN-FINAL
   Enter pencarian selalu menuju RINCIAN KARYAWAN.
   ========================================================= */
(function installEnterGoRincianFinal(){

    if(window.__vaxEnterGoRincianFinalInstalled) return;
    window.__vaxEnterGoRincianFinalInstalled = true;

    function goRincian(){
        setTimeout(() => {

            const target =
                document.getElementById("ablDetailBox") ||
                document.querySelector(".abl-detail-box") ||
                document.querySelector("[data-section='rincian-karyawan']");

            if(!target) return;

            const headerOffset = 175;

            const top =
                target.getBoundingClientRect().top +
                window.scrollY -
                headerOffset;

            window.scrollTo({
                top:Math.max(0,top),
                behavior:"smooth"
            });

            target.classList.add("vax-rincian-target");

            setTimeout(() => {
                target.classList.remove("vax-rincian-target");
            },1800);

        },180);
    }

    const ids = [
        "ablFilterCari",
        "ablDetailCari",
        "ablMatrixCari"
    ];

    function bind(){
        ids.forEach(id => {
            const input = document.getElementById(id);

            if(!input || input.dataset.vaxRincianEnter === "1"){
                return;
            }

            input.dataset.vaxRincianEnter = "1";

            input.addEventListener("keydown",e => {
                if(e.key !== "Enter") return;

                setTimeout(goRincian,40);
            });
        });
    }

    const observer = new MutationObserver(bind);

    observer.observe(document.documentElement,{
        childList:true,
        subtree:true
    });

    if(document.readyState === "loading"){
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(bind,200),
            {once:true}
        );
    }else{
        setTimeout(bind,200);
    }

})();

/* =========================================================
   VAX-20260817-ENTER-RINCIAN-OVERRIDE-V2
   FINAL:
   Enter pencarian -> hanya menuju RINCIAN KARYAWAN
   Menggunakan scrollIntoView agar mengikuti scroll container ERP.
   ========================================================= */
(function installEnterRincianOverrideV2(){

    if(window.__vaxEnterRincianOverrideV2) return;
    window.__vaxEnterRincianOverrideV2 = true;

    const SEARCH_IDS = new Set([
        "ablFilterCari",
        "ablDetailCari",
        "ablMatrixCari"
    ]);

    function findRincian(){
        return (
            document.getElementById("ablDetailBox") ||
            document.querySelector("#ablDetailTitle")?.closest("section") ||
            document.querySelector("#ablDetailTitle")?.parentElement?.parentElement ||
            null
        );
    }

    function scrollFinal(){
        const target = findRincian();
        if(!target) return;

        target.scrollIntoView({
            behavior:"smooth",
            block:"start",
            inline:"nearest"
        });

        target.classList.add("vax-rincian-target");

        setTimeout(() => {
            target.classList.remove("vax-rincian-target");
        },1800);
    }

    document.addEventListener(
        "keydown",
        function(e){

            const input = e.target;

            if(
                e.key !== "Enter" ||
                !input ||
                !SEARCH_IDS.has(input.id)
            ){
                return;
            }

            /*
             * Matikan listener Enter lama agar tidak rebutan scroll.
             * Render pencarian sudah terjadi saat user mengetik.
             */
            e.preventDefault();
            e.stopImmediatePropagation();

            /*
             * Tunggu Rincian selesai render,
             * lalu scroll ulang untuk memastikan posisi final.
             */
            setTimeout(scrollFinal,250);
            setTimeout(scrollFinal,650);

        },
        true
    );

})();
