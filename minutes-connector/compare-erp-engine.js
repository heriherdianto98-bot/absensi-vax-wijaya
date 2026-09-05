import fs from "node:fs";
import vm from "node:vm";

// Adapter audit READ-ONLY untuk menjalankan source DailyDataEngine ERP yang sama
// di Node/VPS tanpa menyentuh browser ERP atau rumus uang yang sudah LOCK.
// Fokus V1: canonical count KPI TRANSACTION / CUSTOMER / SERVICES.

export function loadDailyDataEngine(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  const sandbox = {
    console,
    Intl,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    Error,
    RegExp,
    Math,
    JSON,
    window: {},
    // DailyDataEngine.normalizeRows() selalu membentuk canonical_money.
    // Untuk audit count KPI, nilai uang tidak dipakai. Stub ini hanya menjaga
    // engine dapat dieksekusi apa adanya tanpa mengubah SetoranMoneyEngine LOCK.
    SetoranMoneyEngine: {
      calculateBranchMoney() {
        return {
          netRevenueErp: 0,
          nonCash: 0,
          cashReference: 0
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
    throw new Error("DailyDataEngine ERP tidak berhasil dimuat untuk audit.");
  }

  return engine;
}

export function readErpCanonicalKpi(engine, sourceRow, branch) {
  if (!sourceRow) {
    return {
      found: false,
      transaction: 0,
      customer: 0,
      services: 0
    };
  }

  const normalized = engine.normalizeRows([sourceRow], [branch]);
  if (normalized.length !== 1) {
    throw new Error(
      `DailyDataEngine tidak menghasilkan tepat 1 row untuk ${sourceRow.tanggal}|${sourceRow.cabang_id}.`
    );
  }

  const summary = engine.summarizeRows(normalized);

  return {
    found: true,
    transaction: Number(summary.transaction || 0),
    customer: Number(summary.customer || 0),
    services: Number(summary.services || 0)
  };
}
