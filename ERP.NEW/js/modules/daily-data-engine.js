/*
=========================================================
VAX ERP — DAILY DATA ENGINE (CANONICAL)
=========================================================
Satu jalur baca data harian:

Minutes -> daily_recap_source -> DailyDataEngine
                               -> Tabel Harian Semua Cabang
                               -> Setoran 3 Harian

Tanggung jawab:
- read-only dari daily_recap_source
- filter tanggal dan cabang
- hanya cabang operasional; Floating dikeluarkan
- pagination Supabase
- normalisasi tanggal/nama cabang
- deduplikasi tanggal + cabang_id
- agregasi dataset canonical
- derivasi Nett Produk canonical = Produk - Share Produk

Rumus uang TIDAK didefinisikan ulang di sini.
Semua Nett ERP / Non Tunai / Cash Referensi wajib melalui
SetoranMoneyEngine (OWNER LOCKED).
=========================================================
*/

"use strict";

const DailyDataEngine = {

    TABLE_SOURCE: "daily_recap_source",
    TABLE_CABANG: "cabang",
    PAGE_SIZE: 1000,

    resolveClient(client){
        const resolved = client
            || (typeof db !== "undefined" ? db : null)
            || (typeof window !== "undefined" ? window.db : null);

        if(!resolved || typeof resolved.from !== "function"){
            throw new Error("Supabase client tidak tersedia.");
        }

        return resolved;
    },

    normalizeTanggal(value){
        const text = String(value || "").trim();
        if(!text) return "";

        if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
            return text;
        }

        const parsed = new Date(text);
        if(!Number.isNaN(parsed.getTime())){
            return new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Jakarta",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).format(parsed);
        }

        if(/^\d{4}-\d{2}-\d{2}/.test(text)){
            return text.slice(0, 10);
        }

        return "";
    },

    normalizeRange(start, end){
        const normalizedStart = this.normalizeTanggal(start);
        const normalizedEnd = this.normalizeTanggal(end || start);

        if(!normalizedStart || !normalizedEnd){
            throw new Error("Periode data harian tidak valid.");
        }
        if(normalizedStart > normalizedEnd){
            throw new Error("Tanggal awal tidak boleh melewati tanggal akhir.");
        }

        return {
            start: normalizedStart,
            end: normalizedEnd
        };
    },

    normalizeCabangId(value){
        if(value === null || value === undefined || value === "") return null;
        const id = Number(value);
        return Number.isFinite(id) ? id : null;
    },

    isFloatingCabang(cabang){
        return String(cabang?.nama_cabang || "")
            .toLowerCase()
            .includes("floating");
    },

    filterOperationalCabang(list){
        const rows = Array.isArray(list) ? list : [];
        const hasMinutesColumn = rows.some((c) =>
            Object.prototype.hasOwnProperty.call(c || {}, "nama_minutes")
        );

        return rows.filter((c) => {
            const id = this.normalizeCabangId(c?.id);
            if(id === null || !c?.nama_cabang) return false;
            if(c.aktif === false) return false;
            if(this.isFloatingCabang(c)) return false;

            if(hasMinutesColumn && !String(c.nama_minutes ?? "").trim()){
                return false;
            }

            return true;
        });
    },

    async fetchCabang(client){
        const supabase = this.resolveClient(client);

        let result = await supabase
            .from(this.TABLE_CABANG)
            .select("id,nama_cabang,nama_minutes,aktif");

        if(result.error && /nama_minutes|column/i.test(result.error.message || "")){
            result = await supabase
                .from(this.TABLE_CABANG)
                .select("id,nama_cabang,aktif");
        }

        if(result.error) throw result.error;
        return this.filterOperationalCabang(result.data || []);
    },

    async fetchSourceRows({ client, start, end, cabangIds }){
        const supabase = this.resolveClient(client);
        const range = this.normalizeRange(start, end);
        const ids = [...new Set(
            (Array.isArray(cabangIds) ? cabangIds : [cabangIds])
                .map((id) => this.normalizeCabangId(id))
                .filter((id) => id !== null)
        )];

        if(!ids.length) return [];

        const rows = [];
        let from = 0;

        for(;;){
            let query = supabase
                .from(this.TABLE_SOURCE)
                .select("*");

            query = range.start === range.end
                ? query.eq("tanggal", range.start)
                : query.gte("tanggal", range.start).lte("tanggal", range.end);

            query = ids.length === 1
                ? query.eq("cabang_id", ids[0])
                : query.in("cabang_id", ids);

            query = query
                .order("tanggal", { ascending: true })
                .order("cabang_id", { ascending: true })
                .range(from, from + this.PAGE_SIZE - 1);

            const { data, error } = await query;
            if(error) throw error;

            const chunk = data || [];
            rows.push(...chunk);

            if(chunk.length < this.PAGE_SIZE) break;
            from += this.PAGE_SIZE;
        }

        return rows;
    },

    moneyOf(row){
        if(
            typeof SetoranMoneyEngine === "undefined"
            || typeof SetoranMoneyEngine.calculateBranchMoney !== "function"
        ){
            throw new Error("SetoranMoneyEngine tidak tersedia.");
        }

        return SetoranMoneyEngine.calculateBranchMoney(row);
    },

    productOf(row){
        const product = Number(row?.produk || 0);
        const shareProduct = Number(row?.share_produk || 0);

        return {
            product,
            shareProduct,
            nettProduct: product - shareProduct
        };
    },

    normalizeRows(rows, cabangList){
        const branches = Array.isArray(cabangList) ? cabangList : [];
        const branchMap = new Map(
            branches.map((c, index) => [
                this.normalizeCabangId(c.id),
                { ...c, canonical_order: index }
            ])
        );
        const unique = new Map();

        (Array.isArray(rows) ? rows : []).forEach((raw) => {
            const tanggal = this.normalizeTanggal(raw?.tanggal);
            const cabangId = this.normalizeCabangId(raw?.cabang_id);
            if(!tanggal || cabangId === null || !branchMap.has(cabangId)) return;

            const cabang = branchMap.get(cabangId);
            const canonicalProduct = this.productOf(raw);
            const canonical = {
                ...raw,
                tanggal,
                cabang_id: cabangId,
                nama_cabang: cabang.nama_cabang,
                source_nett_produk: Number(raw?.nett_produk || 0),
                nett_produk: canonicalProduct.nettProduct,
                canonical_product: canonicalProduct,
                canonical_money: this.moneyOf(raw),
                canonical_order: cabang.canonical_order
            };

            unique.set(`${tanggal}|${cabangId}`, canonical);
        });

        return [...unique.values()].sort((a, b) => {
            if(a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
            if(a.canonical_order !== b.canonical_order){
                return a.canonical_order - b.canonical_order;
            }
            return a.cabang_id - b.cabang_id;
        });
    },

    summarizeRows(rows){
        const list = Array.isArray(rows) ? rows : [];
        const sum = (field) => list.reduce(
            (total, row) => total + Number(row?.[field] || 0),
            0
        );

        const money = list.reduce((total, row) => {
            const value = row?.canonical_money || this.moneyOf(row);
            total.netRevenueErp += Number(value.netRevenueErp || 0);
            total.nonCash += Number(value.nonCash || 0);
            total.cashReference += Number(value.cashReference || 0);
            return total;
        }, {
            netRevenueErp: 0,
            nonCash: 0,
            cashReference: 0
        });

        const productMoney = list.reduce((total, row) => {
            const value = row?.canonical_product || this.productOf(row);
            total.product += Number(value.product || 0);
            total.shareProduct += Number(value.shareProduct || 0);
            total.nettProduct += Number(value.nettProduct || 0);
            return total;
        }, {
            product: 0,
            shareProduct: 0,
            nettProduct: 0
        });

        const grossService = sum("service");
        const product = productMoney.product;
        const omzet = grossService + product;
        const transaction = sum("transaction_minutes");

        return {
            rowCount: list.length,
            branchCount: new Set(list.map((row) => row.cabang_id)).size,
            grossService,
            product,
            shareProduct: productMoney.shareProduct,
            nettProduct: productMoney.nettProduct,
            omzet,
            nettRevenueMinutes: sum("nett_revenue"),
            productCost: sum("product_cost"),
            netRevenueErp: money.netRevenueErp,
            nonCash: money.nonCash,
            cashPayment: sum("cash_payment"),
            cashOut: sum("cash_out"),
            cashReference: money.cashReference,
            customer: sum("customer_minutes"),
            transaction,
            services: sum("services_minutes"),
            avgTicket: transaction > 0 ? Math.round(omzet / transaction) : 0
        };
    },

    async load({ client, start, end, cabangId = null } = {}){
        const supabase = this.resolveClient(client);
        const range = this.normalizeRange(start, end);
        const branches = await this.fetchCabang(supabase);
        const selectedId = this.normalizeCabangId(cabangId);
        const selectedBranches = selectedId === null
            ? branches
            : branches.filter((c) => this.normalizeCabangId(c.id) === selectedId);

        const branchIds = selectedBranches.map((c) => this.normalizeCabangId(c.id));
        const sourceRows = await this.fetchSourceRows({
            client: supabase,
            start: range.start,
            end: range.end,
            cabangIds: branchIds
        });
        const rows = this.normalizeRows(sourceRows, selectedBranches);

        return {
            source: this.TABLE_SOURCE,
            start: range.start,
            end: range.end,
            branches: selectedBranches,
            rows,
            summary: this.summarizeRows(rows)
        };
    }
};

if(typeof window !== "undefined"){
    window.DailyDataEngine = DailyDataEngine;
}
