/* Payroll cashier Ultimate bonus consumer. No database writes or changes to locked engines. */
"use strict";
(() => {
  const engine = window.PayrollUnifiedEngine;
  const store = window.PayrollManualAdjustmentStore;
  const classifier = window.LaporanBulananPerformanceKpiBridge;
  if (!engine?.loadPeriod || !store?.save || !classifier?.isUltimatePackage || typeof db === "undefined") return;
  const originalLoad = engine.loadPeriod;
  const originalSave = store.save;
  const BONUS = 150000;
  let autoByEmployee = new Map();
  let activeMonth = "";
  const number = value => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  const format = value => "Rp " + Number(value || 0).toLocaleString("id-ID");
  const monthOf = date => String(date || "").slice(0, 7);
  const isCashier = row => String(row?.jabatan || "").trim().toLowerCase() === "kasir";

  async function salesTotal(branchId, start, end) {
    let total = 0;
    // Explicit pagination prevents Supabase's default 1,000-row limit silently lowering the realisation.
    for (let offset = 0; offset < 100000; offset += 1000) {
      const {data, error} = await db.from("kpi_ultimate_sales_source")
        .select("id,service_package,price_with_discount")
        .eq("cabang_id", branchId).gte("activity_date", start).lte("activity_date", end)
        .order("id", {ascending:true}).range(offset, offset + 999);
      if (error) throw error;
      const rows = data || [];
      for (const row of rows) {
        if (!classifier.isUltimatePackage(row.service_package)) continue;
        const value = number(row.price_with_discount);
        if (!Number.isFinite(value)) throw new Error("Nominal Ultimate tidak valid; Bonus KPI otomatis tidak dapat diverifikasi.");
        total += value;
      }
      if (rows.length < 1000) return total;
    }
    throw new Error("Data Ultimate melebihi batas pemeriksaan; Bonus KPI otomatis tidak diterapkan.");
  }

  engine.loadPeriod = async function(args = {}) {
    const result = await originalLoad.call(this, args);
    // Never change a verified historical snapshot or its explicitly saved correction overlay.
    if (result?.historicalLocked || window.__VAX_PAYROLL_HISTORICAL_LOCKED__?.locked) {
      activeMonth = "";
      autoByEmployee = new Map();
      return result;
    }
    const month = monthOf(args.start);
    const start = `${month}-01`;
    const last = Number(month.slice(5, 7));
    const year = Number(month.slice(0, 4));
    const end = `${month}-${String(new Date(Date.UTC(year, last, 0)).getUTCDate()).padStart(2, "0")}`;
    const cashiers = (result.payroll || []).filter(isCashier);
    const nextAuto = new Map();
    if (cashiers.length) {
      const branchIds = [...new Set(cashiers.map(row => Number(row.homeCabangId)).filter(id => Number.isSafeInteger(id) && id > 0))];
      if (branchIds.length) {
        const {data, error} = await db.from("kpi_ultimate_monthly_target")
          .select("cabang_id,target_amount")
          .eq("year", year).eq("month", last).eq("active", true).in("cabang_id", branchIds);
        if (error) throw error;
        const targets = new Map((data || []).map(row => [Number(row.cabang_id), number(row.target_amount)]));
        const qualified = new Map();
        await Promise.all(branchIds.filter(id => Number.isFinite(targets.get(id)) && targets.get(id) > 0)
          .map(async id => {
            const actual = await salesTotal(id, start, end);
            qualified.set(id, {actual, target:targets.get(id)});
          }));
        for (const row of cashiers) {
          const achieved = qualified.get(Number(row.homeCabangId));
          if (!achieved || achieved.actual < achieved.target) continue;
          const summary = row.summary;
          const manual = Number(summary.bonusKpi || 0);
          // Replace the effective KPI exactly once, never add to a previously entered manual bonus.
          summary.bonusKpi = BONUS;
          summary.gajiBersih = Number(summary.gajiBersih || 0) + BONUS - manual;
          summary.bonusKpiSource = "AUTO_ULTIMATE";
          summary.bonusKpiManual = manual;
          summary.ultimateTarget = achieved.target;
          summary.ultimateActual = achieved.actual;
          nextAuto.set(Number(row.employeeId), {month, manual});
        }
      }
    }
    // Publish only after all reads succeeded; stale eligibility must not survive a failed refresh.
    activeMonth = month;
    autoByEmployee = nextAuto;
    result.totals.bonusKpi = (result.payroll || []).reduce((sum, row) => sum + Number(row.summary.bonusKpi || 0), 0);
    result.totals.gajiBersih = (result.payroll || []).reduce((sum, row) => sum + Number(row.summary.gajiBersih || 0), 0);
    return result;
  };

  // The existing "Simpan Bonus" button saves both fields. Keep an existing manual KPI
  // untouched when only Bonus Insentif/note is saved while the automatic KPI is displayed.
  store.save = function(payload = {}) {
    const eligibility = autoByEmployee.get(Number(payload.employeeId));
    if (eligibility && monthOf(payload.periodMonth) === activeMonth) {
      return originalSave.call(this, {...payload, bonusKpi:eligibility.manual});
    }
    return originalSave.call(this, payload);
  };

  const list = document.getElementById("payrollList");
  if (list) {
    const style = document.createElement("style");
    style.textContent = '.payroll-automatic-kpi{display:block;margin-top:5px;color:#d8bc76;font-size:11px;line-height:1.4;font-weight:700}.payroll-manual .js-kpi:disabled{opacity:.75;cursor:not-allowed}';
    document.head.appendChild(style);
    const decorate = () => {
      list.querySelectorAll(".payroll-employee-card").forEach(card => {
        const item = autoByEmployee.get(Number(card.dataset.employeeId));
        if (!item || item.month !== activeMonth) return;
        const input = card.querySelector(".js-kpi");
        const label = card.querySelector(".is-kpi-card");
        if (input) {
          input.value = format(BONUS);
          input.disabled = true;
          input.title = "Bonus KPI otomatis Rp150.000; bonus manual tetap tersimpan, tidak dijumlahkan.";
        }
        if (label && !label.querySelector(".payroll-automatic-kpi")) {
          const note = document.createElement("small");
          note.className = "payroll-automatic-kpi";
          note.textContent = "Otomatis · Target Ultimate tercapai";
          label.appendChild(note);
        }
      });
    };
    new MutationObserver(decorate).observe(list, {childList:true});
    decorate();
  }
  window.PayrollCashierUltimateBonusBridge = {bonus:BONUS, isAuto: (id, month) => autoByEmployee.get(Number(id))?.month === month};
})();