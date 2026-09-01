/*
=========================================================
VAX ERP — Tabel Harian Share / Proteksi Cards
=========================================================
READ ONLY presenter.
Sources:
- Share Produk   : daily_recap_source.share_produk
- Share Cukur    : provider_sales_daily_source.provider_share
- Proteksi       : daily_recap_source.keterangan_cash_out, SUM item yang mengandung PROTEK / PROTEKSI

Tidak mengubah source, formula core Tabel Harian, Cash Out, atau scheduler.
=========================================================
*/

const TabelHarianShareCards = {
    _seq: 0,
    _patched: false,

    boot(){
        this.ensureCards();
        this.patchPresenter();
        this.refresh();
    },

    ensureCards(){
        const grid = document.querySelector("#thcTotals .thc-totals-grid");
        if(!grid) return;

        const defs = [
            ["thcTotShareProduk", "Share Produk", "is-share-produk", "Total revenue share produk sesuai cabang & periode aktif"],
            ["thcTotShareCukur", "Share Cukur", "is-share-cukur", "Total provider service share sesuai cabang & periode aktif"],
            ["thcTotProteksi", "Proteksi Capster", "is-proteksi", "Total Cash Out dengan keterangan PROTEK / PROTEKSI"]
        ];

        for(const [id, label, cls, title] of defs){
            if(document.getElementById(id)) continue;
            const card = document.createElement("div");
            card.className = `thc-tot-item ${cls}`;
            card.title = title;
            card.innerHTML = `<span>${label}</span><strong id="${id}">—</strong>`;
            grid.appendChild(card);
        }
    },

    patchPresenter(){
        if(this._patched) return;
        if(typeof TabelHarianCabang === "undefined") return;
        if(typeof TabelHarianCabang.renderTotals !== "function") return;

        const original = TabelHarianCabang.renderTotals.bind(TabelHarianCabang);
        TabelHarianCabang.renderTotals = (...args) => {
            const result = original(...args);
            this.ensureCards();
            this.refresh();
            return result;
        };
        this._patched = true;
    },

    getFilter(){
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
            let q = db
                .from(table)
                .select(columns)
                .gte(dateColumn, filter.start)
                .lte(dateColumn, filter.end)
                .range(from, from + pageSize - 1);

            if(filter.cabangId != null){
                q = q.eq("cabang_id", filter.cabangId);
            }else if(Array.isArray(filter.opIds) && filter.opIds.length){
                q = q.in("cabang_id", filter.opIds);
            }else{
                return [];
            }

            const { data, error } = await q;
            if(error) throw error;
            const batch = data || [];
            out.push(...batch);
            if(batch.length < pageSize) break;
            from += pageSize;
        }

        return out;
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
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    },

    proteksiFromKeterangan(rawText){
        const raw = String(rawText || "").trim();
        if(!raw) return 0;

        let total = 0;
        const chunks = raw.split(/\s*;\s*/).map(v => v.trim()).filter(Boolean);
        for(const chunk of chunks){
            const body = chunk.replace(/\s*[-–]\s*Kasir:\s*.+$/i, "").trim();
            const m = body.match(/^(.*?)\s+Rp\s*([\d.,\s\u00a0\u202f\u2009]+)$/i);
            if(!m) continue;
            const nama = String(m[1] || "").trim();
            if(!/protek(?:si)?/i.test(nama)) continue;
            const nominal = this.parseRupiahToken(m[2]);
            if(nominal != null) total += nominal;
        }
        return total;
    },

    setLoading(){
        for(const id of ["thcTotShareProduk", "thcTotShareCukur", "thcTotProteksi"]){
            const el = document.getElementById(id);
            if(el) el.textContent = "Memuat…";
        }
    },

    setValues({ shareProduk = 0, shareCukur = 0, proteksi = 0 } = {}){
        const fmt = (n) => typeof TabelHarianCabang?.formatRupiah === "function"
            ? TabelHarianCabang.formatRupiah(n)
            : new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(Number(n || 0));
        const set = (id, value) => {
            const el = document.getElementById(id);
            if(el) el.textContent = fmt(value);
        };
        set("thcTotShareProduk", shareProduk);
        set("thcTotShareCukur", shareCukur);
        set("thcTotProteksi", proteksi);
    },

    async refresh(){
        this.ensureCards();
        if(typeof DashboardEngine === "undefined") return;

        const filter = this.getFilter();
        if(!filter.start || !filter.end){
            this.setValues();
            return;
        }

        const seq = ++this._seq;
        this.setLoading();

        try{
            const [produkRows, providerRows, cashRows] = await Promise.all([
                this.fetchAll(
                    "daily_recap_source",
                    "cabang_id,tanggal,share_produk",
                    "tanggal",
                    filter
                ),
                this.fetchAll(
                    "provider_sales_daily_source",
                    "cabang_id,activity_date,provider_share",
                    "activity_date",
                    filter
                ),
                this.fetchAll(
                    "daily_recap_source",
                    "cabang_id,tanggal,keterangan_cash_out",
                    "tanggal",
                    filter
                )
            ]);

            if(seq !== this._seq) return;

            const shareProduk = produkRows.reduce((sum, row) => sum + Number(row.share_produk || 0), 0);
            const shareCukur = providerRows.reduce((sum, row) => sum + Number(row.provider_share || 0), 0);
            const proteksi = cashRows.reduce((sum, row) => sum + this.proteksiFromKeterangan(row.keterangan_cash_out), 0);

            this.setValues({ shareProduk, shareCukur, proteksi });
        }catch(error){
            if(seq !== this._seq) return;
            console.error("[TabelHarianShareCards] gagal memuat:", error);
            for(const id of ["thcTotShareProduk", "thcTotShareCukur", "thcTotProteksi"]){
                const el = document.getElementById(id);
                if(el) el.textContent = "—";
            }
        }
    }
};

window.TabelHarianShareCards = TabelHarianShareCards;
