/*
=========================================================
VAX ERP — Tabel Harian Share Columns
=========================================================
READ ONLY presenter.
Sources:
- Share Produk : daily_recap_source.share_produk
- Share Cukur  : provider_sales_daily_source.provider_share

Tidak mengubah formula core, cash, Nett Revenue, Cash Out, atau scheduler.
Hanya menambahkan 2 kolom harian pada tabel.
=========================================================
*/

const TabelHarianShareColumns = {
    _seq: 0,
    _patched: false,

    boot(){
        this.patchFreshnessBeforeOpen();
        this.ensureStyles();
        this.ensureHeader();
        this.patchPresenter();
        this.refreshRows();
    },

    patchFreshnessBeforeOpen(){
        if(typeof ErpFreshness === "undefined" || ErpFreshness.__vaxOpeningGuardPatched) return;
        if(typeof ErpFreshness.evaluate !== "function") return;

        const originalEvaluate = ErpFreshness.evaluate.bind(ErpFreshness);
        ErpFreshness.evaluate = (snapshot, nowMs = Date.now()) => {
            const state = originalEvaluate(snapshot, nowMs);
            const parts = typeof ErpFreshness.jakartaParts === "function"
                ? ErpFreshness.jakartaParts(nowMs)
                : null;
            const hour = Number(parts?.hour);
            const beforeOpen = Number.isFinite(hour) && hour >= 7 && hour < 10;
            if(!beforeOpen || !state) return state;

            const syncRow = state.syncRow || snapshot?.syncRow || null;
            const statusRaw = String(syncRow?.status || "").trim().toLowerCase();
            const syncFailed = ["gagal", "failed", "error"].includes(statusRaw)
                || (Number(syncRow?.gagal || 0) > 0 && Number(syncRow?.berhasil || 0) === 0);
            const vpsDown = typeof ErpFreshness.isVpsOnline === "function"
                ? !ErpFreshness.isVpsOnline(syncRow)
                : false;

            // Jangan sembunyikan error nyata. Guard ini hanya mencegah false alarm
            // provider/freshness sebelum barber buka pukul 10:00 WIB.
            if(vpsDown || syncFailed) return state;

            const lastHm = state.provider?.lastHm || "—";
            state.provider = {
                ...(state.provider || {}),
                key: "waiting",
                tone: "gold",
                label: "Menunggu jam buka",
                lines: ["Barber buka pukul 10:00 WIB"],
                valid: true,
                running: false,
                lastHm
            };
            state.global = {
                key: "waiting",
                tone: "gold",
                label: "MENUNGGU JAM OPERASIONAL",
                sub: "Barber belum buka. Monitoring freshness aktif mulai pukul 10:00 WIB."
            };
            state.header = {
                key: "waiting",
                css: "is-waiting",
                label: state.global.label,
                sub: state.global.sub
            };
            state.allowRed = false;
            if(state.ai){
                state.ai.providerValid = true;
                state.ai.providerUpdating = false;
                state.ai.holdProvider = false;
            }
            return state;
        };

        ErpFreshness.__vaxOpeningGuardPatched = true;
    },

    ensureStyles(){
        if(document.getElementById("thcShareColumnStyles")) return;
        const style = document.createElement("style");
        style.id = "thcShareColumnStyles";
        style.textContent = `
            #thcTable th.thc-col-share-produk,
            #thcTable td.thc-col-share-produk{ color:#fb7185; }
            #thcTable th.thc-col-share-cukur,
            #thcTable td.thc-col-share-cukur{ color:#2dd4bf; }
            #thcTable td.thc-col-share-produk,
            #thcTable td.thc-col-share-cukur{
                font-variant-numeric:tabular-nums;
                white-space:nowrap;
                text-align:right;
                font-weight:700;
            }
        `;
        document.head.appendChild(style);
    },

    ensureHeader(){
        const row = document.querySelector("#thcTable thead tr");
        if(!row) return;
        if(row.querySelector("th.thc-col-share-produk") && row.querySelector("th.thc-col-share-cukur")) return;
        const cells = [...row.children].filter(el => el.tagName === "TH");
        if(cells.length < 4) return;
        const nett = cells.find(th => String(th.textContent || "").trim().toLowerCase() === "nett revenue") || cells[3];
        const produk = document.createElement("th");
        produk.className = "thc-col-share-produk";
        produk.scope = "col";
        produk.textContent = "Share Produk";
        const cukur = document.createElement("th");
        cukur.className = "thc-col-share-cukur";
        cukur.scope = "col";
        cukur.textContent = "Share Cukur";
        row.insertBefore(produk, nett);
        row.insertBefore(cukur, nett);
    },

    patchPresenter(){
        if(this._patched) return;
        if(typeof TabelHarianCabang === "undefined") return;
        if(typeof TabelHarianCabang.renderTable !== "function") return;
        const original = TabelHarianCabang.renderTable.bind(TabelHarianCabang);
        TabelHarianCabang.renderTable = (...args) => {
            const result = original(...args);
            this.ensureHeader();
            this.paintLoadingCells();
            this.refreshRows();
            return result;
        };
        this._patched = true;
    },

    getFilter(){
        if(typeof DashboardEngine === "undefined") return null;
        const start = DashboardEngine?.lastRange?.start || null;
        const end = DashboardEngine?.lastRange?.end || start;
        const cabangId = typeof DashboardEngine?.resolveCabangId === "function"
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;
        const opIds = cabangId == null && typeof DashboardEngine?.getOperationalCabangIds === "function"
            ? DashboardEngine.getOperationalCabangIds().map(Number).filter(Number.isFinite)
            : null;
        return { start, end, cabangId: cabangId == null ? null : Number(cabangId), opIds };
    },

    async fetchAll(table, columns, dateColumn, filter){
        if(typeof db === "undefined") throw new Error("Supabase client tidak tersedia");
        if(!filter?.start || !filter?.end) return [];
        const pageSize = 1000;
        const out = [];
        let from = 0;
        while(true){
            let q = db.from(table).select(columns)
                .gte(dateColumn, filter.start)
                .lte(dateColumn, filter.end)
                .range(from, from + pageSize - 1);
            if(filter.cabangId != null) q = q.eq("cabang_id", filter.cabangId);
            else if(Array.isArray(filter.opIds) && filter.opIds.length) q = q.in("cabang_id", filter.opIds);
            else return [];
            const { data, error } = await q;
            if(error) throw error;
            const batch = data || [];
            out.push(...batch);
            if(batch.length < pageSize) break;
            from += pageSize;
        }
        return out;
    },

    rowKey(tanggal, cabangId){
        return `${String(tanggal || "").slice(0,10)}|${Number(cabangId)}`;
    },

    aggregate(rows, dateField, valueField){
        const map = new Map();
        for(const row of rows || []){
            const key = this.rowKey(row?.[dateField], row?.cabang_id);
            if(!/^\d{4}-\d{2}-\d{2}\|\d+$/.test(key)) continue;
            map.set(key, (map.get(key) || 0) + Number(row?.[valueField] || 0));
        }
        return map;
    },

    formatRupiah(value){
        if(typeof TabelHarianCabang?.formatRupiah === "function") return TabelHarianCabang.formatRupiah(Number(value || 0));
        return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", minimumFractionDigits:0, maximumFractionDigits:0 }).format(Number(value || 0));
    },

    ensureCells(tr){
        if(!tr) return null;
        let produk = tr.querySelector("td.thc-col-share-produk");
        let cukur = tr.querySelector("td.thc-col-share-cukur");
        if(produk && cukur) return { produk, cukur };
        const cells = [...tr.children].filter(el => el.tagName === "TD");
        if(cells.length < 4) return null;
        const nettCell = cells[3];
        if(!produk){
            produk = document.createElement("td");
            produk.className = "thc-col-share-produk";
            tr.insertBefore(produk, nettCell);
        }
        if(!cukur){
            cukur = document.createElement("td");
            cukur.className = "thc-col-share-cukur";
            tr.insertBefore(cukur, nettCell);
        }
        return { produk, cukur };
    },

    paintLoadingCells(){
        const domRows = [...document.querySelectorAll("#thcTbody tr[data-tanggal]")];
        for(const tr of domRows){
            const cells = this.ensureCells(tr);
            if(!cells) continue;
            cells.produk.textContent = "…";
            cells.cukur.textContent = "…";
        }
    },

    paintValues(produkMap, cukurMap){
        const domRows = [...document.querySelectorAll("#thcTbody tr[data-tanggal]")];
        const dataRows = Array.isArray(TabelHarianCabang?.rows) ? TabelHarianCabang.rows : [];
        domRows.forEach((tr, index) => {
            const data = dataRows[index];
            if(!data) return;
            const key = this.rowKey(data.tanggal, data.cabang_id);
            const cells = this.ensureCells(tr);
            if(!cells) return;
            cells.produk.textContent = this.formatRupiah(produkMap.get(key) || 0);
            cells.cukur.textContent = this.formatRupiah(cukurMap.get(key) || 0);
        });
    },

    async refreshRows(){
        this.ensureStyles();
        this.ensureHeader();
        if(typeof TabelHarianCabang === "undefined" || typeof DashboardEngine === "undefined") return;
        const filter = this.getFilter();
        if(!filter?.start || !filter?.end) return;
        const seq = ++this._seq;
        this.paintLoadingCells();
        try{
            const [produkRows, providerRows] = await Promise.all([
                this.fetchAll("daily_recap_source", "cabang_id,tanggal,share_produk", "tanggal", filter),
                this.fetchAll("provider_sales_daily_source", "cabang_id,activity_date,provider_share", "activity_date", filter)
            ]);
            if(seq !== this._seq) return;
            const produkMap = this.aggregate(produkRows, "tanggal", "share_produk");
            const cukurMap = this.aggregate(providerRows, "activity_date", "provider_share");
            this.paintValues(produkMap, cukurMap);
        }catch(error){
            if(seq !== this._seq) return;
            console.error("[TabelHarianShareColumns] gagal memuat:", error);
            for(const tr of document.querySelectorAll("#thcTbody tr[data-tanggal]")){
                const cells = this.ensureCells(tr);
                if(!cells) continue;
                cells.produk.textContent = "—";
                cells.cukur.textContent = "—";
            }
        }
    }
};

window.TabelHarianShareColumns = TabelHarianShareColumns;
