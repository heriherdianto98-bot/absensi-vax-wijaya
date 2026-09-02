/*
=========================================================
VAX ERP — CANONICAL BRANCH MONEY ENGINE
Source of truth: Setoran 3 Harian (PASS live Palabuan / SPBU Pagaden)

JANGAN ubah rumus ini.

Dashboard / Laporan Harian / Kas Owner bukan konsumen di fase ini.

NET REVENUE ERP = nett_revenue Minutes + product_cost
  (product_cost null/0 → nett_revenue Minutes)

CASH REFERENSI = NET REVENUE ERP - non_cash

Cash Out TIDAK dikurangi lagi.
product_cost ditambah PERSIS SEKALI.
=========================================================
*/

"use strict";

const SetoranMoneyEngine = {

    calculateBranchMoney(row){
        const nettMinutes = Number(row?.nett_revenue || 0);
        const productCost = Number(row?.product_cost || 0);
        const nonCash = Number(row?.non_cash || row?.minutes_non_cash || 0);
        const netRevenueErp = nettMinutes + productCost;

        return {
            netRevenueErp,
            nonCash,
            cashReference: netRevenueErp - nonCash
        };
    },

    aggregateBranchMoney(rows){
        const list = Array.isArray(rows) ? rows : [];

        return list.reduce((acc, row) => {
            const money = this.calculateBranchMoney(row);
            acc.netRevenueErp += money.netRevenueErp;
            acc.nonCash += money.nonCash;
            acc.cashReference += money.cashReference;
            return acc;
        }, {
            netRevenueErp: 0,
            nonCash: 0,
            cashReference: 0
        });
    }
};

if(typeof window !== "undefined"){
    window.SetoranMoneyEngine = SetoranMoneyEngine;
}
