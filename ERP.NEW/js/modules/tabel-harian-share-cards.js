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
        this.ensureStyles();
        this.ensureCards();
        this.syncNominalTypography();
        this.patchPresenter();
        this.refresh();
    },

    ensureStyles(){
        if(document.getElementById("thcShareCardStyles")) return;
        const style = document.createElement("style");
        style.id = "thcShareCardStyles";
        style.textContent = `
            #thcTotals .thc-tot-item.is-share-produk{
                border-color:rgba(236,72,153,.55);
                box-shadow:inset 3px 0 0 #ec4899, 0 0 20px rgba(236,72,153,.08);
            }
            #thcTotals .thc-tot-item.is-share-produk span,
            #thcTotals .thc-tot-item.is-share-produk strong{ color:#f472b6; }

            #thcTotals .thc-tot-item.is-share-cukur{
                border-color:rgba(34,211,238,.55);
                box-shadow:inset 3px 0 0 #22d3ee, 0 0 20px rgba(34,211,238,.08);
            }
            #thcTotals .thc-tot-item.is-share-cukur span,
            #thcTotals .thc-tot-item.is-share-cukur strong{ color:#67e8f9; }

            #thcTotals .thc-tot-item.is-proteksi{
                border-color:rgba(249,115,22,.58);
                box-shadow:inset 3px 0 0 #f97316, 0 0 20px rgba(249,115,22,.08);
            }
            #thcTotals .thc-tot-item.is-proteksi span,
            #thcTotals .thc-tot-item.is-proteksi strong{ color:#fb923c; }

            #thcTotals .thc-tot-item .thc-share-desc{
                display:block;
                margin-top:4px;
                color:#aeb8c7;
                font-size:11px;
                line-height:1.25;
                font-style:normal;
                font-weight:500;
                letter-spacing:0;
                text-transform:none;
            }
        `;
        document.head.appendChild(style);
    },

    ensureCards(){
        const grid = document.querySelector("#thcTotals .thc-totals-grid");
        if(!grid) return;

        const defs = [
            [
                "thcTotShareProduk",
                "Share Produk",
                "is-share-produk",
                "Total share provider dari penjualan produk pada periode aktif"
            ],
            [
                "thcTotShareCukur",
                "Share Cukur",
                "is-share-cukur",
                "Total share provider dari jasa/service pada periode aktif"
            ],
            [
                "thcTotProteksi",
                "Proteksi Capster",
                "is-proteksi",
                "Akumulasi cash out item PROTEK / PROTEKSI pada periode aktif"
            ]
        ];

        for(const [id, label, cls, desc] of defs){
            let card = document.getElementById(id)?.closest(".thc-tot-item") || null;
            if(!card){
                card = document.createElement("div");
                card.className = `thc-tot-item ${cls}`;
                card.innerHTML = `<span>${label}</span><strong id="${id}">—</strong><em class="thc-share-desc">${desc}</em>`;
                grid.appendChild(card);
            }else{
                card.classList.add(cls);
                let descEl = card.querySelector(".thc-share-desc");
                if(!descEl){
                    descEl = document.createElement("em");
                    descEl.className = "thc-share-desc";
                    card.appendChild(descEl);
                }
                descEl.textContent = desc;
            }
            card.title = desc;
        }

        this.syncNominalTypography();
    },

    syncNominalTypography(){
        const ref = document.getElementById("thcTotNett");
        if(!ref || typeof getComputedStyle !== "function") return;
        const css = getComputedStyle(ref);
        const values = document.querySelectorAll("#thcTotals .thc-tot-item strong");
        for(const el of values){
            el.style.fontSize = css.fontSize;
            el.style.fontWeight = css.fontWeight;
            el.style.lineHeight = css.lineHeight;
            el.style.letterSpacing = css.letterSpacing;
        }
    },

    patchPresenter(){
        if(this._patched) return;
        if(typeof TabelHarianCabang === "undefined") return;
        if(typeof TabelHarianCabang.renderTotals !== "function") return;

        const original = TabelHarianCabang.renderTotals.bind(TabelHarianCabang);
        TabelHarianCabang.renderTotals = (...args) => {
            const result = original(...args);
            this.ensureStyles();
            this.ensureCards();
            this.syncNominalTypography();
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
        this.syncNominalTypography();
    },

    async refresh(){
        this.ensureStyles();
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
