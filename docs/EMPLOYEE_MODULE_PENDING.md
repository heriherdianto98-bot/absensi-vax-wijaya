# ERP VAX — Employee Module PENDING

Status: **PENDING / DO NOT CONTINUE YET**

Owner decision: focus remains on Owner + SPV and monthly data freeze. Employee module and its internal screens must stay pending until Owner explicitly reopens this work.

## Audit findings to preserve

1. Employee payroll / attendance screens are not yet considered fully active/final.
2. `public.absensi` is currently the shared source for attendance fines (`denda`).
3. `karyawan_absensi_bulan_self(...)` only READS attendance/fine data; it does not calculate the fine.
4. `karyawan_gaji_capster_self(...)` currently reads:
   - Capster share from `provider_sales_daily_source.provider_share`
   - Fine from `public.absensi.denda`
   - Current self-service net calculation = share - fine
5. `izin_apply_jadwal_final(...)` can zero `denda` and `terlambat_menit` for approved izin/libur/sakit.
6. The active/final frontend source that performs Absen Masuk/Pulang and calculates/writes lateness/fine was **not found in the canonical repository during audit**. A legacy `BACKUP/absensi.js` exists in the older employee repo, but it is not the final active engine and must not be treated as canonical.
7. Before Employee Module is resumed, first locate/recover the actual active attendance frontend/deployment source and bring it under controlled canonical versioning before changing formulas or UI.
8. Do not modify LOCKed Owner/SPV engines to solve Employee Module gaps.

## Resume point when Owner reopens Employee Module

Start in this order:

1. Locate the real active Absensi frontend/runtime source (Masuk/Pulang + late/fine writer).
2. Audit write path into `public.absensi` and verify lateness rule + fine rule against Owner-approved rules.
3. Canonicalize that source without changing behavior.
4. Re-audit employee self-service payroll components against the Owner payroll source of truth.
5. Only after Owner PASS, continue Employee Module UI/function work.

**Do not continue this module until Owner explicitly says to resume.**
