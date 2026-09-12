/*
VAX ERP — Laporan Bulanan Manual Mapping Bridge
Consumer-only bridge. Allows historical manual employee-name snapshot
(employee_id null) to resolve provider mapping without touching Payroll/provider source.
*/
"use strict";

(() => {
  if(typeof LaporanBulananEngine === "undefined" || typeof LaporanBulananEngine.applyProviderMappings !== "function") return;

  const original = LaporanBulananEngine.applyProviderMappings.bind(LaporanBulananEngine);

  LaporanBulananEngine.applyProviderMappings = function({ pendingRows, mappings, reportCabangId } = {}){
    const reportId = Number(reportCabangId);
    const mapBySource = new Map((mappings || []).map((m) => [String(m?.source_provider_row_id || ""), m]));
    const relevant = (pendingRows || []).filter((row) => Number(row?.cabangId) === reportId);
    const resolved = [];
    const pending = [];

    for(const row of relevant){
      const sourceId = String(row?.sourceId || "").trim();
      const mapping = mapBySource.get(sourceId) || null;
      const amount = this.number(row?.providerShare);
      const snapshotName = String(mapping?.employee_name_snapshot || "").trim();
      const hasResolvedTarget = Boolean(mapping?.employee_id || snapshotName);

      if(hasResolvedTarget){
        resolved.push({
          sourceId,
          tanggal: row?.tanggal || "",
          sourceCabangId: Number(row?.cabangId || 0) || null,
          sourceCabang: row?.cabang || "—",
          provider: row?.providerMinutes || "Backup",
          service: this.number(row?.service),
          amount,
          employeeId: Number(mapping?.employee_id || 0) || null,
          employeeCabangId: Number(mapping?.employee_cabang_id || 0) || null,
          employeeName: snapshotName || "—",
          employeeBranch: mapping?.branch_name_snapshot || "—",
          source: mapping?.employee_id ? "MONTHLY_PROVIDER_MAPPING" : "MONTHLY_PROVIDER_MAPPING_MANUAL",
          manualHistorical: !mapping?.employee_id
        });
      }else{
        pending.push({
          sourceId,
          tanggal: row?.tanggal || "",
          sourceCabangId: Number(row?.cabangId || 0) || null,
          sourceCabang: row?.cabang || "—",
          provider: row?.providerMinutes || "Backup",
          service: this.number(row?.service),
          amount
        });
      }
    }

    return {
      resolved,
      pending,
      resolvedAmount: resolved.reduce((sum, row) => sum + this.number(row.amount), 0),
      pendingAmount: pending.reduce((sum, row) => sum + this.number(row.amount), 0)
    };
  };

  LaporanBulananEngine.applyProviderMappings.__manualHistoricalBridge = true;
  LaporanBulananEngine.applyProviderMappings.__original = original;
})();
