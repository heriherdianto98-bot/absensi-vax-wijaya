/*
============================================================
VAX ERP — FINANCE GUARD ENGINE
Read-only financial reconciliation guard.

Owner rules:
- ERP Finance is the financial source of truth.
- Rp1 difference = MISMATCH.
- Product Cost is only a Minutes cash-reference component.
- Product Fund = NET PRODUK after Share Produk.
- Negative branch setoran becomes Shortage, never negative setoran.
- Locked financial data must not be silently rewritten.

This module NEVER writes, updates, deletes, approves, or corrects data.
It only reads trusted finance sources and returns VALID / MISMATCH /
WAITING_DATA states at branch and global level.
============================================================
*/

(function () {
    "use strict";

    const ACTIVE_BRANCH_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const HISTORICAL_LOCK_END = "2026-08-12";
    const ZERO_TOLERANCE = 0;

    const STATUS = Object.freeze({
        VALID: "VALID",
        MISMATCH: "MISMATCH",
        WAITING_DATA: "WAITING_DATA",
        ERROR: "ERROR"
    });

    function n(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function roundRupiah(value) {
        return Math.round(n(value));
    }

    function sum(rows, selector) {
        return rows.reduce((total, row) => total + n(selector(row)), 0);
    }

    function absDiff(a, b) {
        return Math.abs(roundRupiah(a) - roundRupiah(b));
    }

    function sameRupiah(a, b) {
        return absDiff(a, b) <= ZERO_TOLERANCE;
    }

    function isoDate(value) {
        if (!value) return null;
        const text = String(value).slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
    }

    function ensureDateRange(startDate, endDate) {
        const start = isoDate(startDate);
        const end = isoDate(endDate);
        if (!start || !end) throw new Error("Periode Finance Guard tidak valid.");
        if (start > end) throw new Error("Tanggal awal Finance Guard melebihi tanggal akhir.");
        return { start, end };
    }

    function wantedBranches(branchId) {
        if (branchId === null || branchId === undefined || branchId === "") {
            return [...ACTIVE_BRANCH_IDS];
        }
        const id = Number(branchId);
        if (!ACTIVE_BRANCH_IDS.includes(id)) {
            throw new Error("Finance Guard hanya menerima cabang operasional aktif 1–10.");
        }
        return [id];
    }

    function branchNameMap(rows) {
        const map = new Map();
        rows.forEach((row) => map.set(Number(row.id), row.nama_cabang || `Cabang ${row.id}`));
        return map;
    }

    async function queryBranches() {
        const { data, error } = await db
            .from("cabang")
            .select("id,nama_cabang")
            .in("id", ACTIVE_BRANCH_IDS);
        if (error) throw error;
        return data || [];
    }

    async function queryHistorical(start, end, branches) {
        const { data, error } = await db
            .from("setoran_historical_backfill")
            .select("period_start,period_end,cabang_id,cash_reference,cash_actual,shortage,product_fund,non_cash_actual,status,manual_cash")
            .gte("period_start", start)
            .lte("period_end", end)
            .in("cabang_id", branches)
            .order("period_start", { ascending: true })
            .order("cabang_id", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function queryQris(start, end, branches) {
        const { data, error } = await db
            .from("qris_reconciliation")
            .select("period_start,period_end,cabang_id,minutes_non_cash,bri_qris,difference,status,ever_cleared,last_cleared_at")
            .gte("period_start", start)
            .lte("period_end", end)
            .in("cabang_id", branches)
            .order("period_start", { ascending: true })
            .order("cabang_id", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function queryProductFundLedger(start, end, branches) {
        const { data, error } = await db
            .from("product_fund_ledger")
            .select("transaction_date,period_start,period_end,cabang_id,flow,category,amount,source,reference_module,reference_id,reversed_entry_id")
            .gte("period_start", start)
            .lte("period_end", end)
            .in("cabang_id", branches)
            .order("period_start", { ascending: true })
            .order("cabang_id", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function querySetoranLive(start, end, branches) {
        const { data, error } = await db
            .from("setoran_3_harian")
            .select("id,period_start,period_end,cabang_id,minutes_cash,minutes_non_cash,minutes_cash_out,setoran_cash_actual,non_cash_to_spv,total_setoran,status,ever_cleared,last_cleared_at")
            .gte("period_start", start)
            .lte("period_end", end)
            .in("cabang_id", branches)
            .order("period_start", { ascending: true })
            .order("cabang_id", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function queryOwnerLedger(start, end) {
        const { data, error } = await db
            .from("arus_kas_ledger")
            .select("id,transaction_type,source_type,source_branch_id,destination_type,destination_branch_id,amount,category,transaction_date,reference_module,reference_id")
            .gte("transaction_date", start)
            .lte("transaction_date", end)
            .order("transaction_date", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function queryMinutesDaily(start, end, branches) {
        const { data, error } = await db
            .from("daily_recap_source")
            .select("tanggal,cabang_id,nett_revenue,product_cost,non_cash,real_cash,sync_status,synced_at")
            .gte("tanggal", start)
            .lte("tanggal", end)
            .in("cabang_id", branches)
            .order("tanggal", { ascending: true })
            .order("cabang_id", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    function ownerLedgerNet(rows) {
        return roundRupiah(rows.reduce((net, row) => {
            const amount = n(row.amount);
            const intoOwner = row.destination_type === "KAS_OWNER";
            const outOwner = row.source_type === "KAS_OWNER";
            if (intoOwner && !outOwner) return net + amount;
            if (outOwner && !intoOwner) return net - amount;
            return net;
        }, 0));
    }

    function ownerExpenseNet(rows) {
        return roundRupiah(rows.reduce((net, row) => {
            if (row.category !== "OWNER_EXPENSE" && row.transaction_type !== "OWNER_EXPENSE") return net;
            const amount = n(row.amount);
            if (row.source_type === "KAS_OWNER" && row.destination_type === "OWNER_USE") return net + amount;
            if (row.source_type === "OWNER_USE" && row.destination_type === "KAS_OWNER") return net - amount;
            return net;
        }, 0));
    }

    function productFundBalance(rows) {
        return roundRupiah(rows.reduce((total, row) => {
            return total + (row.flow === "OUT" ? -n(row.amount) : n(row.amount));
        }, 0));
    }

    function byBranch(rows, branchId) {
        return rows.filter((row) => Number(row.cabang_id) === Number(branchId));
    }

    function makeCheck(code, label, left, right, detail) {
        const difference = roundRupiah(n(left) - n(right));
        return {
            code,
            label,
            status: sameRupiah(left, right) ? STATUS.VALID : STATUS.MISMATCH,
            left: roundRupiah(left),
            right: roundRupiah(right),
            difference,
            detail: detail || null
        };
    }

    function waitingCheck(code, label, detail) {
        return {
            code,
            label,
            status: STATUS.WAITING_DATA,
            left: null,
            right: null,
            difference: null,
            detail: detail || null
        };
    }

    function summarizeChecks(checks) {
        if (checks.some((item) => item.status === STATUS.MISMATCH)) return STATUS.MISMATCH;
        if (checks.some((item) => item.status === STATUS.ERROR)) return STATUS.ERROR;
        if (checks.some((item) => item.status === STATUS.WAITING_DATA)) return STATUS.WAITING_DATA;
        return STATUS.VALID;
    }

    function historicalBranchGuard(branchId, name, histRows, qrisRows, pfRows) {
        const setoran = roundRupiah(sum(histRows, (r) => r.cash_actual));
        const shortage = roundRupiah(sum(histRows, (r) => r.shortage));
        const productFundSource = roundRupiah(sum(histRows, (r) => r.product_fund));
        const manualCash = roundRupiah(sum(histRows, (r) => r.manual_cash));
        const qris = roundRupiah(sum(qrisRows, (r) => r.bri_qris));
        const productFundLedger = productFundBalance(pfRows);

        const expectedSetoran = roundRupiah(sum(histRows, (r) => Math.max(n(r.manual_cash) - n(r.product_fund), 0)));
        const expectedShortage = roundRupiah(sum(histRows, (r) => Math.max(n(r.product_fund) - n(r.manual_cash), 0)));

        const checks = [
            makeCheck(
                "PRODUCT_FUND_SOURCE_VS_LEDGER",
                "Product Fund = NET PRODUK / ledger",
                productFundSource,
                productFundLedger,
                "Dana Produk historical harus sama dengan ledger Product Fund."
            ),
            makeCheck(
                "SETORAN_FORMULA",
                "Setoran DONE sesuai formula",
                setoran,
                expectedSetoran,
                "Setoran = max(Manual Cash - Product Fund, 0)."
            ),
            makeCheck(
                "SHORTAGE_FORMULA",
                "Shortage sesuai formula",
                shortage,
                expectedShortage,
                "Shortage = max(Product Fund - Manual Cash, 0)."
            )
        ];

        if (!qrisRows.length) {
            checks.push(waitingCheck("QRIS_BRI", "QRIS / Non Tunai BRI Merchant tersedia", "Belum ada qris_reconciliation pada periode ini."));
        }

        return {
            branchId,
            branchName: name,
            mode: "HISTORICAL_LOCKED",
            status: summarizeChecks(checks),
            totals: {
                manualCash,
                productFund: productFundSource,
                setoranDone: setoran,
                shortage,
                qrisNonTunai: qris
            },
            checks
        };
    }

    function liveBranchGuard(branchId, name, liveRows, qrisRows, pfRows, minutesRows) {
        const qris = roundRupiah(sum(qrisRows, (r) => r.bri_qris));
        const productFund = productFundBalance(pfRows);
        const setoran = roundRupiah(sum(liveRows, (r) => r.setoran_cash_actual));
        const minutesCash = roundRupiah(sum(liveRows, (r) => r.minutes_cash));
        const minutesNonCash = roundRupiah(sum(liveRows, (r) => r.minutes_non_cash));
        const minutesCashOut = roundRupiah(sum(liveRows, (r) => r.minutes_cash_out));
        const nettRevenuePlusCost = roundRupiah(sum(minutesRows, (r) => n(r.nett_revenue) + n(r.product_cost)));

        const checks = [];

        if (!liveRows.length) {
            checks.push(waitingCheck("SETORAN_LIVE", "Setoran 3 Harian tersedia", "Belum ada row setoran_3_harian untuk periode/cabang ini."));
        }

        if (!qrisRows.length) {
            checks.push(waitingCheck("QRIS_BRI", "BRI Merchant reconciliation tersedia", "Belum ada qris_reconciliation untuk periode/cabang ini."));
        }

        if (!pfRows.length) {
            checks.push(waitingCheck("PRODUCT_FUND", "Product Fund tersedia", "Belum ada ledger Dana Produk pada periode/cabang ini."));
        }

        if (!minutesRows.length) {
            checks.push(waitingCheck("MINUTES_DAILY", "Data Minutes tersedia", "Belum ada daily_recap_source pada periode/cabang ini."));
        }

        if (qrisRows.length && liveRows.length) {
            checks.push(makeCheck(
                "QRIS_BRI_VS_SETORAN_NONCASH",
                "QRIS BRI vs non-cash setoran",
                qris,
                minutesNonCash,
                "Rp1 beda = MISMATCH. BRI Merchant tetap sumber aktual non-tunai."
            ));
        }

        if (minutesRows.length && qrisRows.length && liveRows.length) {
            const cashReferenceFromCanonical = roundRupiah(nettRevenuePlusCost - qris - minutesCashOut);
            checks.push(makeCheck(
                "MINUTES_CASH_REFERENCE",
                "Cash Reference canonical",
                minutesCash,
                cashReferenceFromCanonical,
                "Minutes Cash dibandingkan Nett Revenue + Product Cost - BRI Non Tunai - Cash Out."
            ));
        }

        return {
            branchId,
            branchName: name,
            mode: "LIVE",
            status: summarizeChecks(checks),
            totals: {
                productFund,
                setoranDone: setoran,
                qrisNonTunai: qris,
                minutesCash,
                minutesNonCash,
                minutesCashOut,
                nettRevenuePlusProductCost: nettRevenuePlusCost
            },
            checks
        };
    }

    function globalHistoricalGuard(branchResults, ownerRows) {
        const totals = branchResults.reduce((acc, item) => {
            acc.productFund += n(item.totals.productFund);
            acc.setoranDone += n(item.totals.setoranDone);
            acc.shortage += n(item.totals.shortage);
            acc.qrisNonTunai += n(item.totals.qrisNonTunai);
            return acc;
        }, { productFund: 0, setoranDone: 0, shortage: 0, qrisNonTunai: 0 });

        Object.keys(totals).forEach((key) => { totals[key] = roundRupiah(totals[key]); });

        const expenseNet = ownerExpenseNet(ownerRows);
        const ledgerNet = ownerLedgerNet(ownerRows);
        const expectedOwnerCashLedger = roundRupiah(totals.setoranDone - totals.shortage - expenseNet);
        const expectedKasOwner = roundRupiah(expectedOwnerCashLedger + totals.qrisNonTunai);

        const checks = [
            makeCheck(
                "OWNER_CASH_LEDGER",
                "Kas Owner cash ledger",
                ledgerNet,
                expectedOwnerCashLedger,
                "Setoran DONE - Shortage - Owner Expense harus sama dengan net ledger Kas Owner cash."
            )
        ];

        return {
            status: summarizeChecks(checks.concat(branchResults.flatMap((item) => item.checks))),
            totals: {
                ...totals,
                ownerExpenseNet: expenseNet,
                ownerCashLedgerNet: ledgerNet,
                kasOwnerExpected: expectedKasOwner
            },
            checks
        };
    }

    function globalLiveGuard(branchResults, ownerRows) {
        const totals = branchResults.reduce((acc, item) => {
            acc.productFund += n(item.totals.productFund);
            acc.setoranDone += n(item.totals.setoranDone);
            acc.qrisNonTunai += n(item.totals.qrisNonTunai);
            return acc;
        }, { productFund: 0, setoranDone: 0, qrisNonTunai: 0 });

        Object.keys(totals).forEach((key) => { totals[key] = roundRupiah(totals[key]); });

        return {
            status: summarizeChecks(branchResults.flatMap((item) => item.checks)),
            totals: {
                ...totals,
                ownerExpenseNet: ownerExpenseNet(ownerRows),
                ownerLedgerNet: ownerLedgerNet(ownerRows)
            },
            checks: []
        };
    }

    async function run(options = {}) {
        if (typeof db === "undefined" || !db) {
            return {
                status: STATUS.ERROR,
                error: "Supabase connector (db) belum tersedia."
            };
        }

        try {
            const { start, end } = ensureDateRange(options.startDate, options.endDate);
            const branches = wantedBranches(options.branchId);
            const historicalMode = end <= HISTORICAL_LOCK_END;

            const [branchRows, qrisRows, pfRows, ownerRows] = await Promise.all([
                queryBranches(),
                queryQris(start, end, branches),
                queryProductFundLedger(start, end, branches),
                queryOwnerLedger(start, end)
            ]);

            const names = branchNameMap(branchRows);
            let branchResults = [];
            let global = null;

            if (historicalMode) {
                const histRows = await queryHistorical(start, end, branches);
                branchResults = branches.map((branchId) => historicalBranchGuard(
                    branchId,
                    names.get(branchId) || `Cabang ${branchId}`,
                    byBranch(histRows, branchId),
                    byBranch(qrisRows, branchId),
                    byBranch(pfRows, branchId)
                ));
                global = globalHistoricalGuard(branchResults, ownerRows);
            } else {
                const [liveRows, minutesRows] = await Promise.all([
                    querySetoranLive(start, end, branches),
                    queryMinutesDaily(start, end, branches)
                ]);
                branchResults = branches.map((branchId) => liveBranchGuard(
                    branchId,
                    names.get(branchId) || `Cabang ${branchId}`,
                    byBranch(liveRows, branchId),
                    byBranch(qrisRows, branchId),
                    byBranch(pfRows, branchId),
                    byBranch(minutesRows, branchId)
                ));
                global = globalLiveGuard(branchResults, ownerRows);
            }

            return {
                status: global.status,
                mode: historicalMode ? "HISTORICAL_LOCKED" : "LIVE",
                period: { start, end },
                zeroToleranceRupiah: ZERO_TOLERANCE,
                branches: branchResults,
                global,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error("[VAX Finance Guard]", error);
            return {
                status: STATUS.ERROR,
                error: error?.message || String(error),
                generatedAt: new Date().toISOString()
            };
        }
    }

    window.VaxFinanceGuard = Object.freeze({
        STATUS,
        ACTIVE_BRANCH_IDS,
        HISTORICAL_LOCK_END,
        run
    });
})();
