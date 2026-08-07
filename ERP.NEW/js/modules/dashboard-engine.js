/*
=========================================================
VAX ERP
Dashboard Engine V2
=========================================================
Tanggung jawab:
- Mengambil data dari Supabase (cabang + daily_recap_source)
- Memfilter berdasarkan cabang_id dan periode tanggal
- Menghitung seluruh KPI dari hasil query (bukan dummy)
- Menyiapkan summary, chartData, rankingData, lastSync
- Menyediakan refresh(), emit(), subscribe() untuk modul lain
=========================================================
*/

const DashboardEngine = {

    TABLE_SOURCE: "daily_recap_source",
    TABLE_CABANG: "cabang",

    rawData: [],
    cabangList: [],
    summary: {},
    chartData: {
        hari: { labels: [], data: [] },
        minggu: { labels: [], data: [] },
        bulan30: { labels: [], data: [] },
        bulan: { labels: [], data: [] }
    },
    rankingData: [],
    lastSync: null,

    loading: false,
    error: null,

    lastCabangId: null,
    lastPeriode: "hariini",

    _listeners: [],

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

    shiftDate(tanggal, jumlahHari){
        const d = new Date(`${tanggal}T00:00:00`);
        d.setDate(d.getDate() + jumlahHari);

        const tahun = d.getFullYear();
        const bulan = String(d.getMonth()+1).padStart(2,"0");
        const hari = String(d.getDate()).padStart(2,"0");

        return `${tahun}-${bulan}-${hari}`;
    },

    normalizePeriode(periode){
        return String(periode || "hariini")
            .toLowerCase()
            .replace(/\s+/g,"");
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

            case "hariini":
            default:
                return { start: today, end: today };
        }
    },

    /* ================= RESOLVE CABANG ================= */

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

        return cocok ? cocok.id : null;
    },

    /* ================= LOAD ================= */

    async load(cabangId = null, periode = "hariini"){

        this.setLoading(true);
        this.error = null;

        this.lastCabangId = cabangId;
        this.lastPeriode = periode;

        try{

            const { data: cabang, error: errCabang } = await db
                .from(this.TABLE_CABANG)
                .select("id,nama_cabang");

            if(errCabang) throw errCabang;

            this.cabangList = cabang || [];

            const cabangIdNumeric = this.resolveCabangId(cabangId);
            const { start, end } = this.getPeriodeRange(periode);

            let query = db.from(this.TABLE_SOURCE).select("*");

            query = (start===end)
                ? query.eq("tanggal", start)
                : query.gte("tanggal", start).lte("tanggal", end);

            if(cabangIdNumeric){
                query = query.eq("cabang_id", cabangIdNumeric);
            }

            const { data, error } = await query;

            if(error) throw error;

            this.rawData = (data || []).map(r=>({
                ...r,
                nama_cabang: this.cabangList.find(c=>c.id==r.cabang_id)?.nama_cabang || "-"
            }));

            this.calculate();

            this.emit("loaded", {
                cabangId: cabangIdNumeric,
                periode: this.normalizePeriode(periode),
                total: this.rawData.length
            });

        }catch(err){
            console.error("DashboardEngine.load error:", err);

            this.error = err?.message || "Gagal memuat data dashboard.";
            this.rawData = [];
            this.summary = this.emptySummary();
            this.chartData = this.emptyChartData();
            this.rankingData = [];
            this.lastSync = null;

            this.emit("error", this.error);

        }finally{
            this.setLoading(false);
        }
    },

    async refresh(){
        await this.load(this.lastCabangId, this.lastPeriode);
    },

    /* ================= DEFAULT KOSONG ================= */

    emptySummary(){
        return {
            omzet: 0,
            nett: 0,
            cash: 0,
            qris: 0,
            customer: 0,
            transaction: 0,
            service: 0,
            grossService: 0,
            product: 0,
            avgTicket: 0
        };
    },

    emptyChartData(){
        return {
            hari: { labels: [], data: [] },
            minggu: { labels: [], data: [] },
            bulan30: { labels: [], data: [] },
            bulan: { labels: [], data: [] }
        };
    },

    /* ================= KALKULASI ================= */

    calculate(){

        const sum = f => this.rawData.reduce((t,r)=>t+Number(r[f]||0),0);

        const grossService = sum("service");
        const product = sum("produk");
        const transaction = sum("transaction_minutes");
        const customer = sum("customer_minutes");
        const service = sum("services_minutes");
        const nett = sum("nett_revenue");
        const cash = sum("real_cash");
        const qris = sum("non_cash");
        const omzet = grossService + product;
        const avgTicket = transaction>0 ? Math.round(omzet/transaction) : 0;

        this.summary = {
            omzet,
            nett,
            cash,
            qris,
            customer,
            transaction,
            service,
            grossService,
            product,
            avgTicket
        };

        this.rankingData = this.buildRanking();
        this.chartData = this.buildChartData();
        this.lastSync = this.getLastSync();

        if(typeof renderRanking==="function") renderRanking();
        if(typeof renderChart==="function") renderChart("hari");

        this.emit("calculated", this.summary);
    },

    buildRanking(){
        const map = new Map();

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

    buildChartData(){
        const map = new Map();

        this.rawData.forEach(r=>{
            const tanggal = r.tanggal;
            if(!tanggal) return;

            const omzetBaris = Number(r.service||0) + Number(r.produk||0);
            map.set(tanggal, (map.get(tanggal)||0) + omzetBaris);
        });

        const tanggalUrut = [...map.keys()].sort();

        const buatSeri = list => ({
            labels: list.map(t=>this.formatLabelTanggal(t)),
            data: list.map(t=>map.get(t))
        });

        const bulanAktif = this.getJakartaToday().slice(0,7);
        const bulanIniList = tanggalUrut.filter(t=>t.slice(0,7)===bulanAktif);

        return {
            hari: buatSeri(tanggalUrut),
            minggu: buatSeri(tanggalUrut.slice(-7)),
            bulan30: buatSeri(tanggalUrut.slice(-30)),
            bulan: buatSeri(bulanIniList)
        };
    },

    formatLabelTanggal(tanggal){
        if(!tanggal) return "-";

        const d = new Date(`${tanggal}T00:00:00`);

        return d.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short"
        });
    },

    getLastSync(){
        const dataDenganSync = this.rawData
            .filter(r=>r.synced_at)
            .sort((a,b)=>new Date(b.synced_at)-new Date(a.synced_at));

        return dataDenganSync[0]?.synced_at || null;
    }

};
