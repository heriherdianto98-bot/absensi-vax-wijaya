import fs from "node:fs";
import vm from "node:vm";

// Minutes Audit Runner V2 adapter — READ ONLY.
// Menjalankan source DailyDataEngine canonical yang sama tanpa mengubah engine LOCK.
// V2 tahap 1 menambah Gross Omzet selain KPI count V1.

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
    throw new Error("DailyDataEngine ERP tidak berhasil dimuat untuk audit V2.");
  }

  return engine;
}

export function readErpCanonical(engine, sourceRow, branch) {
  if (!sourceRow) {
    return {
      found: false,
      transaction: 0,
      customer: 0,
      services: 0,
      grossOmzet: 0
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
    services: Number(summary.services || 0),
    grossOmzet: Number(summary.omzet || 0)
  };
}
