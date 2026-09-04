/*
=========================================================
VAX ERP — BRI MERCHANT DAILY CANONICAL STORE
=========================================================
Source of truth manual rekonsiliasi BRI Merchant per:
  tanggal + cabang_id

Dipakai oleh:
- Tabel Harian Semua Cabang (input Owner/SVP)
- Setoran 3 Harian (SUM periode 1-3 hari, read-only bridge)
=========================================================
*/
"use strict";

const BriMerchantDaily = {
    TABLE: "bri_merchant_daily",
    rows: [],
    map: new Map(),

    key(tanggal, cabangId){
        return `${String(tanggal || "").slice(0,10)}|${Number(cabangId)}`;
    },

    money(v){
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    },

    async loadRange({ start, end, cabangIds = null } = {}){
        if(typeof db === "undefined") throw new Error("Supabase client (db) tidak tersedia.");
        if(!start || !end) return [];

        let q = db.from(this.TABLE)
            .select("id,tanggal,cabang_id,bri_non_cash_actual,source,created_by,created_at,updated_by,updated_at")
            .gte("tanggal", start)
            .lte("tanggal", end)
            .order("tanggal", { ascending: true });

        const ids = Array.isArray(cabangIds)
            ? [...new Set(cabangIds.map(Number).filter(Number.isFinite))]
            : [];
        if(ids.length) q = q.in("cabang_id", ids);

        const { data, error } = await q;
        if(error) throw error;

        this.rows = data || [];
        this.map = new Map(this.rows.map((r) => [this.key(r.tanggal, r.cabang_id), r]));
        return this.rows;
    },

    get(tanggal, cabangId){
        return this.map.get(this.key(tanggal, cabangId)) || null;
    },

    sumBranch(cabangId, start, end){
        const id = Number(cabangId);
        let total = 0;
        let count = 0;
        for(const r of this.rows){
            const d = String(r.tanggal || "").slice(0,10);
            if(Number(r.cabang_id) !== id) continue;
            if(start && d < start) continue;
            if(end && d > end) continue;
            total += this.money(r.bri_non_cash_actual);
            count += 1;
        }
        return { total, count };
    },

    async save({ tanggal, cabangId, value, userId } = {}){
        if(typeof db === "undefined") throw new Error("Supabase client (db) tidak tersedia.");
        const d = String(tanggal || "").slice(0,10);
        const id = Number(cabangId);
        const amount = Number(value);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Tanggal BRI Merchant tidak valid.");
        if(!Number.isFinite(id)) throw new Error("Cabang BRI Merchant tidak valid.");
        if(!Number.isFinite(amount) || amount < 0) throw new Error("Nominal BRI Merchant harus 0 atau lebih.");

        const now = new Date().toISOString();
        const existing = this.get(d, id);
        const payload = {
            tanggal: d,
            cabang_id: id,
            bri_non_cash_actual: amount,
            source: "MANUAL_ERP",
            updated_by: userId || null,
            updated_at: now
        };
        if(!existing) payload.created_by = userId || null;

        const { data, error } = await db.from(this.TABLE)
            .upsert(payload, { onConflict: "tanggal,cabang_id" })
            .select("id,tanggal,cabang_id,bri_non_cash_actual,source,created_by,created_at,updated_by,updated_at")
            .single();
        if(error) throw error;

        this.map.set(this.key(d, id), data);
        const idx = this.rows.findIndex((r) => this.key(r.tanggal, r.cabang_id) === this.key(d,id));
        if(idx >= 0) this.rows[idx] = data;
        else this.rows.push(data);
        return data;
    }
};

window.BriMerchantDaily = BriMerchantDaily;
