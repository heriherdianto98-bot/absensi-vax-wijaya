/*
=========================================================
VAX ERP — PROTEKSI ENGINE (CANONICAL)
=========================================================
Source of truth:
Minutes Cash Out -> daily_recap_source.keterangan_cash_out -> ProteksiEngine

Rule Owner:
- Proteksi berasal dari Cash Out canonical, bukan input manual.
- Match variasi kata: protek, proteksi, protect.
- Nilai diambil dari nominal item Cash Out yang match keyword.
- Bisa dihitung per tanggal, rentang tanggal, atau satu bulan penuh.
- Read-only: engine tidak mengubah data Cash Out / Daily Recap.
=========================================================
*/

"use strict";

const ProteksiEngine = {
    KEYWORD_RE: /\b(?:protek(?:si)?|protect)\b/i,
    MONEY_RE: /Rp\s*([\d.]+)/i,

    isProteksiText(value){
        return this.KEYWORD_RE.test(String(value || ""));
    },

    parseMoney(value){
        const text = String(value || "");
        const match = text.match(this.MONEY_RE);
        if(!match) return 0;
        const n = Number(String(match[1] || "").replace(/\./g, ""));
        return Number.isFinite(n) ? n : 0;
    },

    parseCashOutDetail(value){
        const text = String(value || "").trim();
        if(!text) return [];

        return text
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => ({
                raw: part,
                isProteksi: this.isProteksiText(part),
                nominal: this.parseMoney(part)
            }));
    },

    extractRow(row){
        const details = this.parseCashOutDetail(row?.keterangan_cash_out);
        const matched = details.filter((item) => item.isProteksi && item.nominal > 0);
        const total = matched.reduce((sum, item) => sum + item.nominal, 0);

        return {
            tanggal: String(row?.tanggal || "").slice(0, 10),
            cabang_id: Number(row?.cabang_id || 0) || null,
            nama_cabang: row?.nama_cabang || row?.cabang || "",
            total,
            items: matched
        };
    },

    summarizeRows(rows){
        const list = Array.isArray(rows) ? rows : [];
        const byDate = new Map();
        const byBranch = new Map();
        const details = [];
        let total = 0;

        for(const row of list){
            const result = this.extractRow(row);
            if(result.total <= 0) continue;

            total += result.total;
            details.push(result);

            if(result.tanggal){
                byDate.set(
                    result.tanggal,
                    (byDate.get(result.tanggal) || 0) + result.total
                );
            }

            if(result.cabang_id !== null){
                byBranch.set(
                    result.cabang_id,
                    (byBranch.get(result.cabang_id) || 0) + result.total
                );
            }
        }

        return {
            total,
            byDate: Object.fromEntries([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))),
            byBranch: Object.fromEntries(byBranch.entries()),
            details
        };
    },

    async load({ client, start, end, cabangId = null } = {}){
        if(typeof DailyDataEngine === "undefined" || typeof DailyDataEngine.load !== "function"){
            throw new Error("DailyDataEngine tidak tersedia.");
        }

        const dataset = await DailyDataEngine.load({ client, start, end, cabangId });
        const summary = this.summarizeRows(dataset.rows);

        return {
            source: "daily_recap_source.keterangan_cash_out",
            start: dataset.start,
            end: dataset.end,
            branches: dataset.branches,
            rows: dataset.rows,
            ...summary
        };
    },

    async loadMonth({ client, year, month, cabangId = null } = {}){
        const y = Number(year);
        const m = Number(month);
        if(!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12){
            throw new Error("Bulan Proteksi tidak valid.");
        }

        const mm = String(m).padStart(2, "0");
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return this.load({
            client,
            start: `${y}-${mm}-01`,
            end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
            cabangId
        });
    }
};

if(typeof window !== "undefined"){
    window.ProteksiEngine = ProteksiEngine;
}
