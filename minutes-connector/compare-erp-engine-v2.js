import fs from "node:fs";
import vm from "node:vm";

// Minutes Audit Runner V2 adapter — READ ONLY.
// Menjalankan source DailyDataEngine canonical yang sama tanpa mengubah engine LOCK.
// Field uang yang memang diringkas langsung oleh DailyDataEngine dibaca dari summary.
// SetoranMoneyEngine tetap di-stub karena rumus LOCK tidak boleh didefinisikan ulang di audit.

export function loadDailyDataEngine(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sandbox = {
    console, Intl, Date, Number, String, Boolean, Array, Object,
    Map, Set, Error, RegExp, Math, JSON, window: {},
    SetoranMoneyEngine: {
      calculateBranchMoney(row = {}) {
        return {
          netRevenueErp: Number(row.nett_revenue || 0) + Number(row.product_cost || 0),
          nonCash: Number(row.non_cash || 0),
          cashReference: Number(row.cash_payment || 0)
        };
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(
    `${source}\n;globalThis.__ERP_DAILY_DATA_ENGINE__ = DailyDataEngine;`,
    sandbox,
    { filename: filePath }
  );

  const engine = sandbox.__ERP_DAILY_DATA_ENGINE__;
  if (!engine || typeof engine.normalizeRows !== "function" || typeof engine.summarizeRows !== "function") {
    throw new Error("DailyDataEngine ERP tidak berhasil dimuat untuk audit V2.");
  }
  return engine;
}

export function readErpCanonical(engine, sourceRow, branch) {
  if (!sourceRow) return { found: false };

  const normalized = engine.normalizeRows([sourceRow], [branch]);
  if (normalized.length !== 1) {
    throw new Error(`DailyDataEngine tidak menghasilkan tepat 1 row untuk ${sourceRow.tanggal}|${sourceRow.cabang_id}.`);
  }

  const row = normalized[0];
  const summary = engine.summarizeRows(normalized);

  return {
    found: true,
    transaction: Number(summary.transaction || 0),
    customer: Number(summary.customer || 0),
    services: Number(summary.services || 0),
    netServicesSales: Number(summary.grossService || 0),
    netProductsSales: Number(summary.product || 0),
    grossOmzet: Number(summary.omzet || 0),
    netRevenueMinutes: Number(summary.nettRevenueMinutes || 0),
    netRevenueErp: Number(summary.netRevenueErp || 0),
    productCost: Number(summary.productCost || 0),
    nonCash: Number(summary.nonCash || 0),
    cashPayment: Number(summary.cashPayment || 0),
    cashOut: Number(summary.cashOut || 0),
    cashReference: Number(summary.cashReference || 0),
    product: Number(summary.product || 0),
    shareProduct: Number(summary.shareProduct || 0),
    nettProduct: Number(summary.nettProduct || 0),
    sourceRow: {
      revenue: Number(row.revenue || 0),
      cashIn: Number(row.cash_in || 0),
      totalShare: Number(row.total_share || 0),
      thirdPartyCharges: Number(row.third_party_charges || 0)
    }
  };
}
