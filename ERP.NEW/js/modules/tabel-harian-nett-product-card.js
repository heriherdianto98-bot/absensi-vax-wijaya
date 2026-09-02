/*
=========================================================
VAX ERP — Tabel Harian Nett Produk Card
=========================================================
READ ONLY presenter.
Formula canonical: Nett Produk = Produk - Share Produk.
Source: daily_recap_source.
=========================================================
*/

const TabelHarianNettProductCard = {
    _seq: 0,
    _patched: false,

    boot(){
        this.ensureStyle();
        this.ensureCard();
        this.patchShareCardsRefresh();
        this.refresh();
    },

    ensureStyle(){
        if(document.getElementById("thcNettProductCardStyle")) return;
        const style = document.createElement("style");
        style.id = "thcNettProductCardStyle";
        style.textContent = `
            #thcTotals .thc-tot-item.is-nett-product{
                border-color:rgba(45,212,191,.60);
                box-shadow:inset 3px 0 0 #2dd4bf, 0 0 20px rgba(45,212,191,.08);
            }
            #thcTotals .thc-tot-item.is-nett-product > span,
            #thcTotals .thc-tot-item.is-nett-product > strong{ color:#5eead4; }
        `;
        document.head.appendChild(style);
    },

    ensureCard(){
        const grid = document.querySelector("#thcTotals .thc-totals-grid");
        if(!grid) return;
        let card = document.getElementById("thcTotNettProduk")?.closest(".thc-tot-item") || null;
        if(card) return;
        card = document.createElement("div");
        card.className = "thc-tot-item is-nett-product";
        card.innerHTML = `<span>Nett Produk</span><strong id="thcTotNettProduk">—</strong><em class="thc-share-desc">Produk bersih setelah dikurangi share produk</em>`;

        const productCard = document.getElementById("thcTotProduk")?.closest(".thc-tot-item") || null;
        if(productCard?.parentElement === grid){
            productCard.insertAdjacentElement("afterend", card);
        }else{
            grid.appendChild(card);
        }
        if(typeof TabelHarianShareCards?.syncNominalTypography === "function"){
            TabelHarianShareCards.syncNominalTypography();
        }
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

    async fetchRows(filter){
        if(typeof db === "undefined") throw new Error("Supabase client tidak tersedia");
        if(!filter?.start || !filter?.end) return [];
        const pageSize = 1000;
        const out = [];
        let from = 0;
        while(true){
            let q = db.from("daily_recap_source")
                .select("cabang_id,tanggal,produk,share_produk")
                .gte("tanggal", filter.start)
                .lte("tanggal", filter.end)
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

    formatRupiah(value){
        if(typeof TabelHarianCabang?.formatRupiah === "function") return TabelHarianCabang.formatRupiah(Number(value || 0));
        return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", minimumFractionDigits:0, maximumFractionDigits:0 }).format(Number(value || 0));
    },

    setValue(value){
        const el = document.getElementById("thcTotNettProduk");
        if(el) el.textContent = this.formatRupiah(value);
        if(typeof TabelHarianShareCards?.syncNominalTypography === "function"){
            TabelHarianShareCards.syncNominalTypography();
        }
    },

    async refresh(){
        this.ensureStyle();
        this.ensureCard();
        const filter = this.getFilter();
        if(!filter?.start || !filter?.end){
            this.setValue(0);
            return;
        }
        const seq = ++this._seq;
        const el = document.getElementById("thcTotNettProduk");
        if(el) el.textContent = "Memuat…";
        try{
            const rows = await this.fetchRows(filter);
            if(seq !== this._seq) return;
            const total = rows.reduce((sum,row) => {
                const produk = Number(row?.produk || 0);
                const share = Number(row?.share_produk || 0);
                return sum + (produk - share);
            }, 0);
            this.setValue(total);
        }catch(error){
            if(seq !== this._seq) return;
            console.error("[TabelHarianNettProductCard] gagal memuat:", error);
            if(el) el.textContent = "—";
        }
    },

    patchShareCardsRefresh(){
        if(this._patched) return;
        if(typeof TabelHarianShareCards === "undefined" || typeof TabelHarianShareCards.refresh !== "function") return;
        const original = TabelHarianShareCards.refresh.bind(TabelHarianShareCards);
        TabelHarianShareCards.refresh = async (...args) => {
            const result = await original(...args);
            this.refresh();
            return result;
        };
        this._patched = true;
    }
};

window.TabelHarianNettProductCard = TabelHarianNettProductCard;
