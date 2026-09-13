/*
VAX ERP — Laporan Bulanan Manual Mapping Bridge
Consumer-only bridge. Allows historical manual employee-name snapshot
(employee_id null) to resolve provider mapping without touching Payroll/provider source.

OWNER correction 14 Sep 2026:
- Provider AMBIGUOUS bernama generic "Capster" yang sudah dimapping manual
  adalah backup capster valid dan harus ikut biaya gaji bulanan.
- Ditandai sebagai "Backup Capster" pada detail hasil mapping agar consumer
  tidak membuangnya saat rekonsiliasi aktivitas provider.
*/
"use strict";

(() => {
  if(typeof LaporanBulananEngine === "undefined" || typeof LaporanBulananEngine.applyProviderMappings !== "function") return;

  const original = LaporanBulananEngine.applyProviderMappings.bind(LaporanBulananEngine);
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  const mappedProviderLabel = (row) => {
    const raw = String(row?.providerMinutes || row?.provider || "").trim();
    const norm = normalize(raw);
    if(norm === "capster") return "Backup Capster";
    return raw || "Backup";
  };

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
      const providerLabel = mappedProviderLabel(row);

      if(hasResolvedTarget){
        resolved.push({
          sourceId,
          tanggal: row?.tanggal || "",
          sourceCabangId: Number(row?.cabangId || 0) || null,
          sourceCabang: row?.cabang || "—",
          provider: providerLabel,
          service: this.number(row?.service),
          amount,
          employeeId: Number(mapping?.employee_id || 0) || null,
          employeeCabangId: Number(mapping?.employee_cabang_id || 0) || null,
          employeeName: snapshotName || "—",
          employeeBranch: mapping?.branch_name_snapshot || "—",
          source: mapping?.employee_id ? "MONTHLY_PROVIDER_MAPPING" : "MONTHLY_PROVIDER_MAPPING_MANUAL",
          manualHistorical: !mapping?.employee_id,
          mappedAmbiguous: true
        });
      }else{
        pending.push({
          sourceId,
          tanggal: row?.tanggal || "",
          sourceCabangId: Number(row?.cabangId || 0) || null,
          sourceCabang: row?.cabang || "—",
          provider: providerLabel,
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
