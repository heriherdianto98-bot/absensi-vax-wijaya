# SVP ABSENSI + OWNER UI — PASS / LOCK
Date: 2026-09-28
Branch: feature/employee-profile-canonical-20260927

## LOCK scope
- SVP attendance from dashboard header.
- SVP flexible work hours.
- SVP GPS captured without branch geofence; accuracy ceiling 300 m.
- MASUK / PULANG flow and double-submit guard.
- SVP self attendance history (31 latest records).
- Owner read-only SVP attendance bridge.
- Owner Absensi: Status Karyawan Hari Ini, Aktivitas Absensi, and Matrix integration.
- Owner activity card UI including SVP/Floating label, MASUK/PULANG address + coordinates + GPS accuracy.
- Current compact Aktivitas Absensi layout and timestamp placement.

## Data separation
- Employee attendance engine remains public.absensi.
- SVP floating attendance remains public.svp_absensi_v1.
- Owner views merge SVP data through read-only presentation bridge.
- Do not migrate SVP writes into the locked employee attendance engine.

## Locked files / bridge
- ERP.NEW/js/modules/svp-attendance-header.js
- ERP.NEW/styles/svp-attendance-header.css
- ERP.NEW/js/modules/svp-attendance-owner-bridge.js
- ERP.NEW/styles/svp-attendance-owner-bridge.css
- Relevant SVP attendance migrations/RPCs under supabase/migrations.

## Important
Do not modify this locked flow/UI unless Owner explicitly authorizes a new change.
Do not change employee GPS/geofence/denda/attendance engine as part of SVP work.
