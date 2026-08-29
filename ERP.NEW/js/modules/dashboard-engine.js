/*
=========================================================
VAX ERP
Dashboard Engine V2
=========================================================
Tanggung jawab:
- Mengambil data dari Supabase (cabang + daily_recap_source)
- Memfilter berdasarkan cabang_id dan periode tanggal
- Filter Cabang + Periode adalah satu-satunya sumber filter
  untuk KPI, grafik, ranking, payment, dan activity
- Menghitung seluruh KPI dari hasil query (bukan dummy)
- Menyiapkan summary, chartData, rankingData, lastSync
- Menyediakan refresh(), emit(), subscribe() untuk modul lain
=========================================================
*/

const DashboardEngine = {

    TABLE_SOURCE: "daily_recap_source",
    TABLE_CABANG: "cabang",
    /** Daily Provider Sales — Barber Aktif (dibaca modul barber-aktif.js; bukan KPI daily_recap) */
    TABLE_PROVIDER_DAILY: "provider_sales_daily_source",

    rawData: [],
    previousRawData: [],
    cabangList: [],
    summary: {},
    chartData: {
        aktif: { labels: [], data: [] }
    },
    rankingData: [],
    lastSync: null,
    /** Max synced_at global (abaikan filter) — badge Minutes / Last Sync UI */
    globalLastSync: null,
    previousSummary: null,
    previousRange: { start: null, end: null },
    previousRowCount: 0,
    hasPreviousData: false,
    trends: {},

    loading: false,
    error: null,

    lastCabangId: null,
    lastPeriode: "hariini",
    lastCustomStart: null,
    lastCustomEnd: null,
    /** 'range' | 'month' — hanya UI/label custom; query tetap start/end */
    lastCustomMode: "range",
    lastRange: { start: null, end: null },

    _listeners: [],
    _loadSeq: 0,

    /* ================= PUB / SUB ================= */

    subscribe(callback){
        if(typeof callback==="function"){
            this._listeners.push(callback);
        }

        return () => {
            this._listeners = this._listeners.filter(fn=>fn!==callback);
        };
    },

    emit(event, payload){
        this._listeners.forEach(fn=>{
            try{
                fn(event, payload);
            }catch(err){
                console.error("DashboardEngine listener error:", err);
            }
        });
    },

    setLoading(state){
        this.loading = Boolean(state);
        this.emit("loading", this.loading);
    },

    /* ================= TANGGAL WIB ================= */

    getJakartaToday(){
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
    },

    /* Geser kalender YYYY-MM-DD murni (UTC noon) — tidak ikut timezone browser. */
    shiftDate(tanggal, jumlahHari){
        const parts = String(tanggal || "").slice(0, 10).split("-").map(Number);
        const y = parts[0];
        const m = parts[1];
        const d = parts[2];

        if(!y || !m || !d){
            return this.getJakartaToday();
        }

        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        dt.setUTCDate(dt.getUTCDate() + Number(jumlahHari || 0));

        const tahun = dt.getUTCFullYear();
        const bulan = String(dt.getUTCMonth() + 1).padStart(2, "0");
        const hari = String(dt.getUTCDate()).padStart(2, "0");

        return `${tahun}-${bulan}-${hari}`;
    },

    normalizeTanggal(nilai){
        const s = String(nilai || "").trim();
        if(!s) return "";

        // Date-only kalender — jangan parse sebagai UTC midnight.
        if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
            return s;
        }

        // Timestamp/ISO → kalender Asia/Jakarta (hindari geser hari karena UTC).
        const parsed = new Date(s);
        if(!Number.isNaN(parsed.getTime())){
            return new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Jakarta",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).format(parsed);
        }

        if(/^\d{4}-\d{2}-\d{2}/.test(s)){
            return s.slice(0, 10);
        }

        return "";
    },

    normalizePeriode(periode){
        const key = String(periode || "hariini")
            .toLowerCase()
            .replace(/\s+/g,"");

        if(key === "custom" || key === "customdate" || key === "customtanggal"){
            return "customtanggal";
        }

        return key || "hariini";
    },

    getPeriodeRange(periode){
        const today = this.getJakartaToday();
        const key = this.normalizePeriode(periode);

        switch(key){
            case "kemarin": {
                const kemarin = this.shiftDate(today, -1);
                return { start: kemarin, end: kemarin };
            }

            case "7hari":
                return { start: this.shiftDate(today, -6), end: today };

            case "30hari":
                return { start: this.shiftDate(today, -29), end: today };

            case "bulanini":
                return { start: `${today.slice(0,8)}01`, end: today };

            case "tahunini":
                return { start: `${today.slice(0,4)}-01-01`, end: today };

            case "customtanggal": {
                const start = this.normalizeTanggal(this.lastCustomStart);
                const end = this.normalizeTanggal(this.lastCustomEnd);
                if(start && end && start <= end){
                    return { start, end };
                }
                return { start: today, end: today };
            }

            case "hariini":
            default:
                return { start: today, end: today };
        }
    },

    /** True jika start..end = 1 bulan kalender penuh (tgl 1 → hari terakhir). */
    isFullCalendarMonth(start, end){
        const s = this.normalizeTanggal(start);
        const e = this.normalizeTanggal(end);
        if(!s || !e || s > e) return false;
        if(s.slice(0, 7) !== e.slice(0, 7)) return false;
        if(s.slice(8, 10) !== "01") return false;
        const y = Number(s.slice(0, 4));
        const m = Number(s.slice(5, 7));
        if(!y || !m) return false;
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return Number(e.slice(8, 10)) === lastDay;
    },

    getPreviousFullCalendarMonth(start){
        const s = this.normalizeTanggal(start);
        if(!s){
            const today = this.getJakartaToday();
            return { start: today, end: today };
        }
        const y = Number(s.slice(0, 4));
        const m = Number(s.slice(5, 7));
        let pm = m - 1;
        let py = y;
        if(pm < 1){
            pm = 12;
            py -= 1;
        }
        const daysInPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
        const mm = String(pm).padStart(2, "0");
        const dd = String(daysInPrev).padStart(2, "0");
        return {
            start: `${py}-${mm}-01`,
            end: `${py}-${mm}-${dd}`
        };
    },

    /* Periode pembanding: panjang setara tepat sebelum current (kecuali bulanini /
       custom full-calendar-month → bulan kalender sebelumnya penuh). */
    getPreviousRange(start, end, periodeKey){
        const s = this.normalizeTanggal(start);
        const e = this.normalizeTanggal(end);
        const key = this.normalizePeriode(periodeKey);

        if(!s || !e || s > e){
            const today = this.getJakartaToday();
            return { start: today, end: today };
        }

        if(key === "bulanini"){
            const y = Number(s.slice(0, 4));
            const m = Number(s.slice(5, 7));
            const endDay = Number(e.slice(8, 10));
            let pm = m - 1;
            let py = y;
            if(pm < 1){
                pm = 12;
                py -= 1;
            }
            const daysInPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
            const prevEndDay = Math.min(endDay, daysInPrev);
            const mm = String(pm).padStart(2, "0");
            const dd = String(prevEndDay).padStart(2, "0");
            return {
                start: `${py}-${mm}-01`,
                end: `${py}-${mm}-${dd}`
            };
        }

        if(key === "tahunini"){
            const y = Number(s.slice(0, 4));
            const endMD = e.slice(5, 10); // MM-DD
            return {
                start: `${y - 1}-01-01`,
                end: `${y - 1}-${endMD}`
            };
        }

        // Custom Pilih Bulan / rentang = bulan kalender penuh → vs bulan sebelumnya penuh.
        if(key === "customtanggal" && this.isFullCalendarMonth(s, e)){
            return this.getPreviousFullCalendarMonth(s);
        }

        // Hari Ini / Kemarin / 7 Hari / 30 Hari / Custom rentang:
        // previous = jumlah hari identik, tepat sebelum currentStart (tanpa overlap).
        const days = this.enumerateDates(s, e).length || 1;
        const prevEnd = this.shiftDate(s, -1);
        const prevStart = this.shiftDate(prevEnd, -(days - 1));
        return { start: prevStart, end: prevEnd };
    },

    summarizeRows(rows){
        const list = Array.isArray(rows) ? rows : [];
        const sum = f => list.reduce((t, r) => t + Number(r[f] || 0), 0);

        const grossService = sum("service");
        const product = sum("produk");
        const transaction = sum("transaction_minutes");
        const customer = sum("customer_minutes");
        const service = sum("services_minutes");
        const nettRevenue = sum("nett_revenue");
        const cash = sum("cash_payment");
        const qris = sum("non_cash");
        const productCost = sum("product_cost");
        const cashOut = sum("cash_out");
        // OWNER LOCKED: NETT ERP = nett_revenue + product_cost (once).
        const nett = (typeof NettErp !== "undefined" && NettErp.fromParts)
            ? NettErp.fromParts(nettRevenue, productCost)
            : (nettRevenue + productCost);
        const omzet = grossService + product;
        const avgTicket = transaction > 0 ? Math.round(omzet / transaction) : 0;

        return {
            omzet,
            nett,
            nettRevenue,
            cash,
            qris,
            customer,
            transaction,
            service,
            grossService,
            product,
            productCost,
            avgTicket,
            cashOut
        };
    },

    summaryHasSignal(summary){
        const s = summary || {};
        return ["omzet", "nett", "cash", "qris", "customer", "service",
            "grossService", "transaction", "product", "cashOut"]
            .some((k) => Number(s[k] || 0) !== 0);
    },

    calcTrend(current, previous){
        const c = Number(current) || 0;
        const p = Number(previous) || 0;

        // previous = 0 → jangan "Baru"; tampilkan baseline kosong yang netral
        if(p === 0){
            return {
                pct: null,
                tone: "neutral",
                arrow: "●",
                text: "—",
                noBaseline: true
            };
        }

        const pct = Math.round(((c - p) / p) * 100);
        if(!Number.isFinite(pct)){
            return { pct: null, tone: "neutral", arrow: "●", text: "—", noBaseline: true };
        }
        if(pct > 0){
            return { pct, tone: "positive", arrow: "▲", text: `▲ +${pct}%`, noBaseline: false };
        }
        if(pct < 0){
            return { pct, tone: "negative", arrow: "▼", text: `▼ ${pct}%`, noBaseline: false };
        }
        return { pct: 0, tone: "neutral", arrow: "●", text: "0%", noBaseline: false };
    },

    buildTrends(currentSummary, previousSummary){
        const cur = currentSummary || this.emptySummary();
        const prev = previousSummary || this.emptySummary();
        const keys = [
            "omzet", "nett", "cash", "qris", "customer", "service",
            "grossService", "transaction", "product", "avgTicket", "cashOut"
        ];
        const trends = {};
        keys.forEach((k) => {
            trends[k] = this.calcTrend(cur[k], prev[k]);
        });
        return trends;
    },

    /* ================= RESOLVE CABANG ================= */

    normalizeNamaCabang(teks){
        return String(teks || "")
            .toLowerCase()
            .replace(/\bvax\b/g, "")
            .replace(/\bwijaya\b/g, "")
            .replace(/\bwijiaya\b/g, "")
            .replace(/\bspbu\b/g, "")
            .replace(/[^a-z0-9]/g, "");
    },

    resolveCabangId(cabangId){
        if(cabangId===null || cabangId===undefined){
            return null;
        }

        const nilai = String(cabangId).trim();

        if(nilai==="" || nilai==="0"){
            return null;
        }

        const nilaiLower = nilai.toLowerCase();

        if(nilaiLower==="semua cabang" || nilaiLower==="semua" || nilaiLower==="all"){
            return null;
        }

        if(!isNaN(Number(nilai))){
            return Number(nilai);
        }

        const cocok = this.cabangList.find(c=>
            String(c.nama_cabang||"").toLowerCase()===nilaiLower
        );

        if(cocok) return cocok.id;

        // Nama cabang di Supabase memakai prefix "Vax Wijaya" / typo "Wijiaya"
        // sedangkan filter toolbar hanya memakai nama singkat, jadi dicocokkan
        // secara ternormalisasi (tanpa prefix, spasi, dan simbol).
        const nilaiNormal = this.normalizeNamaCabang(nilai);

        if(!nilaiNormal){
            return null;
        }

        const cocokNormal = this.cabangList.find(c=>{
            const namaNormal = this.normalizeNamaCabang(c.nama_cabang);
            return namaNormal===nilaiNormal
                || namaNormal.includes(nilaiNormal)
                || nilaiNormal.includes(namaNormal);
        });

        return cocokNormal ? cocokNormal.id : null;
    },

    /* ================= LOAD ================= */

    async load(cabangId = null, periode = "hariini", customRange = null){

        const seq = ++this._loadSeq;

        this.setLoading(true);
        this.error = null;

        this.lastCabangId = cabangId;

        if(customRange && customRange.start && customRange.end){
            this.lastCustomStart = this.normalizeTanggal(customRange.start);
            this.lastCustomEnd = this.normalizeTanggal(customRange.end);
            this.lastPeriode = "customtanggal";
            if(customRange.mode === "month" || customRange.mode === "range"){
                this.lastCustomMode = customRange.mode;
            }else if(this.isFullCalendarMonth(this.lastCustomStart, this.lastCustomEnd)){
                this.lastCustomMode = "month";
            }else{
                this.lastCustomMode = "range";
            }
        }else{
            this.lastPeriode = this.normalizePeriode(periode);
            if(this.lastPeriode !== "customtanggal"){
                this.lastCustomStart = null;
                this.lastCustomEnd = null;
                this.lastCustomMode = "range";
            }
        }

        try{

            // nama_minutes/aktif dipakai untuk daftar cabang operasional (Semua Cabang).
            let cabang = null;
            let errCabang = null;
            ({ data: cabang, error: errCabang } = await db
                .from(this.TABLE_CABANG)
                .select("id,nama_cabang,nama_minutes,aktif"));

            if(errCabang && /nama_minutes|column/i.test(errCabang.message || "")){
                ({ data: cabang, error: errCabang } = await db
                    .from(this.TABLE_CABANG)
                    .select("id,nama_cabang,aktif"));
            }
            if(errCabang) throw errCabang;
            if(seq !== this._loadSeq) return;

            this.cabangList = cabang || [];

            const cabangIdNumeric = this.resolveCabangId(cabangId);
            const range = this.getPeriodeRange(this.lastPeriode);
            const start = range.start;
            const end = range.end;
            this.lastRange = { start, end };

            const prevRange = this.getPreviousRange(start, end, this.lastPeriode);
            this.previousRange = prevRange;

            // Selected branch: eq(cabang_id) — path yang sudah PASS, jangan diubah.
            // Semua Cabang: in(operational ids) + pagination agar 10 cabang terambil penuh.
            const [curRows, prevRowsRaw] = await Promise.all([
                this.fetchRecapRows(start, end, cabangIdNumeric),
                this.fetchRecapRows(prevRange.start, prevRange.end, cabangIdNumeric)
            ]);
            if(seq !== this._loadSeq) return;

            const mapRows = (rows) => (rows || []).map(r => ({
                ...r,
                tanggal: this.normalizeTanggal(r.tanggal) || r.tanggal,
                nama_cabang: this.cabangList.find(c => c.id == r.cabang_id)?.nama_cabang || "-"
            }));

            this.rawData = mapRows(curRows);
            const prevRows = mapRows(prevRowsRaw);
            this.previousRawData = prevRows;
            this.previousSummary = this.summarizeRows(prevRows);
            this.previousRowCount = prevRows.length;
            this.hasPreviousData = this.summaryHasSignal(this.previousSummary);

            // Freshness Minutes = sync VPS→Supabase terbaru (bukan scoped filter KPI).
            try{
                const { data: syncRow, error: syncErr } = await db
                    .from(this.TABLE_SOURCE)
                    .select("synced_at")
                    .not("synced_at", "is", null)
                    .order("synced_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if(!syncErr && syncRow?.synced_at){
                    this.globalLastSync = syncRow.synced_at;
                }else{
                    this.globalLastSync = null;
                }
            }catch(_e){
                this.globalLastSync = null;
            }
            if(seq !== this._loadSeq) return;

            this.calculate();

            this.emit("loaded", {
                cabangId: cabangIdNumeric,
                periode: this.lastPeriode,
                start,
                end,
                previousStart: prevRange.start,
                previousEnd: prevRange.end,
                previousRows: this.previousRowCount,
                total: this.rawData.length
            });

        }catch(err){
            if(seq !== this._loadSeq) return;

            console.error("DashboardEngine.load error:", err);

            this.error = err?.message || "Gagal memuat data dashboard.";
            this.rawData = [];
            this.previousRawData = [];
            this.summary = this.emptySummary();
            this.previousSummary = this.emptySummary();
            this.previousRange = { start: null, end: null };
            this.previousRowCount = 0;
            this.hasPreviousData = false;
            this.trends = {};
            this.chartData = this.emptyChartData();
            this.rankingData = [];
            this.lastSync = null;
            this.globalLastSync = null;

            this.emit("error", this.error);

        }finally{
            if(seq === this._loadSeq){
                this.setLoading(false);
            }
        }
    },

    async refresh(){
        const custom = (this.lastPeriode === "customtanggal"
            && this.lastCustomStart
            && this.lastCustomEnd)
            ? {
                start: this.lastCustomStart,
                end: this.lastCustomEnd,
                mode: this.lastCustomMode || "range"
            }
            : null;

        await this.load(this.lastCabangId, this.lastPeriode, custom);
    },

    /* ================= DEFAULT KOSONG ================= */

    emptySummary(){
        return {
            omzet: 0,
            nett: 0,
            nettRevenue: 0,
            cash: 0,
            qris: 0,
            customer: 0,
            transaction: 0,
            service: 0,
            grossService: 0,
            product: 0,
            productCost: 0,
            avgTicket: 0,
            cashOut: 0
        };
    },

    emptyChartData(){
        return {
            aktif: { labels: [], data: [] }
        };
    },

    /* Daftar tanggal inklusif dari start..end (YYYY-MM-DD). */
    enumerateDates(start, end){
        const list = [];
        if(!start || !end || start > end) return list;

        let cursor = start;
        while(cursor <= end){
            list.push(cursor);
            cursor = this.shiftDate(cursor, 1);
        }

        return list;
    },

    /* ================= KALKULASI ================= */

    calculate(){

        // Settlement Minutes tersimpan apa adanya; NETT KPI = NettErp (nett + product_cost).
        this.summary = this.summarizeRows(this.rawData);
        if(!this.previousSummary){
            this.previousSummary = this.emptySummary();
        }
        this.trends = this.buildTrends(this.summary, this.previousSummary);

        this.rankingData = this.buildRanking();
        this.chartData = this.buildChartData();
        this.lastSync = this.getLastSync();

        if(typeof renderRanking==="function") renderRanking();
        if(typeof renderChart==="function") renderChart("aktif");

        this.emit("calculated", this.summary);
    },

    buildRanking(){
        const map = new Map();

        // Ranking dari rawData yang sudah difilter Cabang + Periode.
        this.rawData.forEach(r=>{
            const key = r.cabang_id;
            const nama = r.nama_cabang || "-";
            const omzetBaris = Number(r.service||0) + Number(r.produk||0);

            if(!map.has(key)){
                map.set(key, { cabang_id: key, nama_cabang: nama, omzet: 0 });
            }

            map.get(key).omzet += omzetBaris;
        });

        return [...map.values()].sort((a,b)=>b.omzet-a.omzet);
    },

    /**
     * Minutes Gross Revenue per row daily_recap_source.
     * sync.js: settlement["Gross Revenue"] → service (produk=0).
     * Kolom gross_revenue dipakai jika ada; fallback = service+produk
     * (identik rumus omzet KPI / Gross kartu).
     */
    minutesGrossOf(row){
        if(!row || typeof row !== "object") return 0;
        let n;
        if(row.gross_revenue !== null && row.gross_revenue !== undefined && row.gross_revenue !== ""){
            n = Number(row.gross_revenue);
        }else{
            n = Number(row.service || 0) + Number(row.produk || 0);
        }
        return Number.isFinite(n) ? n : 0;
    },

    isFloatingCabangRow(row){
        return String(row?.nama_cabang || "").toLowerCase().includes("floating");
    },

    /**
     * Cabang operasional Dashboard (sama rule Setoran/QRIS/Cash Out):
     * aktif !== false, bukan Floating, punya nama_minutes bila kolom tersedia.
     */
    getOperationalCabangList(){
        const list = Array.isArray(this.cabangList) ? this.cabangList : [];
        const hasMinutesCol = list.some((c) => Object.prototype.hasOwnProperty.call(c || {}, "nama_minutes"));
        return list.filter((c) => {
            if(!c?.id || !c?.nama_cabang) return false;
            if(c.aktif === false) return false;
            if(String(c.nama_cabang).toLowerCase().includes("floating")) return false;
            if(hasMinutesCol){
                const minutesName = String(c.nama_minutes ?? "").trim();
                if(!minutesName) return false;
            }
            return true;
        });
    },

    getOperationalCabangIds(){
        return this.getOperationalCabangList()
            .map((c) => Number(c.id))
            .filter((id) => Number.isFinite(id));
    },

    /**
     * Ambil semua row daily_recap_source untuk range (paginated).
     * Selected branch → eq(cabang_id).
     * Semua Cabang → in(operational cabang ids), Floating excluded.
     */
    async fetchRecapRows(rangeStart, rangeEnd, cabangIdNumeric){
        const pageSize = 1000;
        const rows = [];
        let from = 0;
        const opIds = !cabangIdNumeric ? this.getOperationalCabangIds() : null;

        // Semua Cabang tanpa daftar operasional → jangan fetch “seluruh tabel” buta.
        if(!cabangIdNumeric && Array.isArray(opIds) && opIds.length === 0){
            return [];
        }

        for(;;){
            let q = db.from(this.TABLE_SOURCE).select("*");
            q = (rangeStart === rangeEnd)
                ? q.eq("tanggal", rangeStart)
                : q.gte("tanggal", rangeStart).lte("tanggal", rangeEnd);

            if(cabangIdNumeric){
                q = q.eq("cabang_id", cabangIdNumeric);
            }else{
                q = q.in("cabang_id", opIds);
            }

            q = q
                .order("tanggal", { ascending: true })
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

    /**
     * Series Grafik Omzet = Minutes Sales Summary:
     * X = tanggal, Y = gross_revenue harian.
     * Satu cabang → nilai cabang itu per tanggal (path PASS — jangan diubah).
     * Semua Cabang → 1 line TOTAL: SUM gross_revenue 10 cabang operasional / tanggal.
     * Dedup kunci tanggal+cabang_id agar tidak double count.
     */
    buildChartData(){
        const selectedCabangId = this.resolveCabangId(this.lastCabangId);
        const semuaCabang = selectedCabangId == null;
        const opIdSet = new Set(this.getOperationalCabangIds());
        const restrictOps = semuaCabang && opIdSet.size > 0;

        // Dedup: unique (tanggal + cabang_id) → satu nilai Minutes per cabang/hari.
        const unique = new Map();
        (this.rawData || []).forEach((r) => {
            const cabangId = Number(r.cabang_id);
            if(restrictOps){
                if(!Number.isFinite(cabangId) || !opIdSet.has(cabangId)) return;
            }else if(semuaCabang && this.isFloatingCabangRow(r)){
                return;
            }

            const tanggal = this.normalizeTanggal(r.tanggal);
            if(!tanggal) return;

            const key = `${tanggal}|${Number.isFinite(cabangId) ? cabangId : String(r.cabang_id ?? "")}`;
            // Jika duplikat, pakai nilai terakhir yang valid (schema intended unique).
            unique.set(key, { tanggal, gross: this.minutesGrossOf(r) });
        });

        const byDate = new Map();
        unique.forEach(({ tanggal, gross }) => {
            byDate.set(tanggal, (byDate.get(tanggal) || 0) + gross);
        });

        const start = this.lastRange?.start || this.getPeriodeRange(this.lastPeriode).start;
        const end = this.lastRange?.end || this.getPeriodeRange(this.lastPeriode).end;
        const tanggalUrut = this.enumerateDates(start, end);

        return {
            aktif: {
                labels: tanggalUrut.map((t) => this.formatLabelTanggal(t)),
                data: tanggalUrut.map((t) => byDate.get(t) || 0),
                dates: tanggalUrut.slice()
            }
        };
    },

    formatLabelTanggal(tanggal){
        const key = this.normalizeTanggal(tanggal);
        if(!key) return "-";

        const [y, m, d] = key.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

        return dt.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            timeZone: "UTC"
        });
    },

    getLastSync(){
        const dataDenganSync = this.rawData
            .filter(r=>r.synced_at)
            .sort((a,b)=>new Date(b.synced_at)-new Date(a.synced_at));

        return dataDenganSync[0]?.synced_at || null;
    },

    /* ================= BRANCH BREAKDOWN (KPI drilldown) =================
       Satu sumber kebenaran: rawData + summarizeRows (formula KPI tidak berubah).
       Growth memakai previousRawData hanya untuk % per cabang; TOTAL tetap
       dari trends aggregate yang sama dengan kartu dashboard.
    ===================================================================== */

    shortCabangName(nama){
        return String(nama || "")
            .replace(/\bVax\s+Wijiaya\b/gi, "")
            .replace(/\bVax\s+Wijaya\b/gi, "")
            .replace(/\s+/g, " ")
            .trim() || String(nama || "-");
    },

    buildBranchBreakdown(metricKey){
        const key = String(metricKey || "").trim();
        const rows = Array.isArray(this.rawData) ? this.rawData : [];
        const prevRows = Array.isArray(this.previousRawData) ? this.previousRawData : [];
        const summary = this.summary || this.emptySummary();
        const isGrowth = key === "growth" || key === "omzetGrowth";
        const valueKey = isGrowth ? "omzet" : key;

        const groupByCabang = (list) => {
            const map = new Map();
            list.forEach((r) => {
                const id = r.cabang_id;
                if(id === null || id === undefined) return;
                if(!map.has(id)){
                    map.set(id, {
                        cabang_id: id,
                        nama_cabang: r.nama_cabang || "-",
                        rows: []
                    });
                }
                map.get(id).rows.push(r);
            });
            return map;
        };

        const currentMap = groupByCabang(rows);
        const prevMap = groupByCabang(prevRows);
        // Summable/avg: hanya cabang di periode aktif (sum ≡ KPI).
        // Growth: cabang aktif + pembanding (untuk % per cabang).
        const ids = isGrowth
            ? new Set([...currentMap.keys(), ...prevMap.keys()])
            : new Set(currentMap.keys());

        const branches = [...ids].map((id) => {
            const cur = currentMap.get(id);
            const prev = prevMap.get(id);
            const nama = cur?.nama_cabang || prev?.nama_cabang || "-";
            const curSummary = this.summarizeRows(cur?.rows || []);
            const prevSummary = this.summarizeRows(prev?.rows || []);
            const value = Number(curSummary[valueKey] || 0);
            const prevValue = Number(prevSummary[valueKey] || 0);
            const trend = isGrowth ? this.calcTrend(value, prevValue) : null;

            return {
                cabang_id: id,
                nama_cabang: nama,
                nama_pendek: this.shortCabangName(nama),
                value: isGrowth ? (trend?.pct ?? null) : value,
                displayValue: isGrowth ? value : value,
                prevValue,
                trend,
                summary: curSummary
            };
        });

        // Ranking: nilai absolut (untuk growth = omzet aktif) agar bar konsisten
        branches.sort((a, b) => {
            const av = isGrowth ? Number(a.displayValue || 0) : Number(a.value || 0);
            const bv = isGrowth ? Number(b.displayValue || 0) : Number(b.value || 0);
            return bv - av;
        });

        let total;
        let aggregateMode = "sum";

        if(isGrowth){
            total = this.trends?.omzet || this.calcTrend(summary.omzet, this.previousSummary?.omzet);
            aggregateMode = "trend";
        }else if(key === "avgTicket"){
            total = Number(summary.avgTicket || 0);
            aggregateMode = "avg";
        }else{
            total = Number(summary[valueKey] || 0);
            // Verifikasi identitas: sum cabang === summary (summable metrics)
            const branchSum = branches.reduce((t, b) => t + Number(b.value || 0), 0);
            if(Math.round(branchSum) !== Math.round(total)){
                console.warn(
                    `[KPI Branch] total mismatch for ${valueKey}: summary=${total} sum=${branchSum}`
                );
            }
        }

        const maxAbs = Math.max(
            0,
            ...branches.map((b) => Math.abs(
                isGrowth ? Number(b.displayValue || 0) : Number(b.value || 0)
            ))
        );

        return {
            metricKey: isGrowth ? "growth" : valueKey,
            aggregateMode,
            total,
            branches,
            maxAbs,
            rowCount: rows.length,
            branchCount: branches.length
        };
    }

};
