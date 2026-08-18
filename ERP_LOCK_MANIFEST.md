# ERP VAX — HARD LOCK MANIFEST

Baseline lock dibuat setelah validasi KPI Ultimate 10/10 cabang terhadap Minutes pada 2026-08-18.

## HARD LOCK — KPI ULTIMATE

Status: FULL PASS / HARD LOCK

Business rule:
- Periode KPI = MTD, tanggal 1 bulan berjalan sampai hari ini WIB.
- Hanya 5 paket yang dihitung: MAX, RELAX, REGULER, PLUS, ENAKIN KEPALA.
- Formula KPI, classifier paket, target, progress, selisih, dan per-kasir tidak boleh diubah tanpa explicit owner unlock.
- Existing Service Sales Detail writer digunakan; tidak boleh diganti dengan engine baru.
- Scheduler tick tetap 1 menit dengan anti-overlap existing.
- KPI MTD refresh menggunakan DATE_FROM awal bulan WIB dan DATE_TO hari ini WIB.

Validasi Minutes 10/10 cabang: PASS
- Soklat/Barsel
- Pamanukan
- AR Hakim
- Cinangsi
- Mekarwangi
- Palabuan
- Parahyangan
- Rawa Badak
- SPBU Pagaden
- Kalijati

## LOCKED FILES FOR KPI ULTIMATE

Files below are baseline reference and MUST NOT be modified in stable baseline unless owner explicitly unlocks the task:
- ERP.NEW/js/modules/kpi-ultimate.js
- minutes-connector/kpi-ultimate-sync.js
- minutes-connector/provider-sales-sync.js
- minutes-connector/scheduler.js

## HARD LOCK — CASH OUT

Status: FULL PASS / HARD LOCK

Verified period:
- 2026-08-01 through 2026-08-18

Validation:
- Cash Out verified exact match for 10/10 branches against verified Minutes/Supabase-derived data.

Official branch:
- locked/cash-out-2026-08-19

Official commit:
- bcb46969c76d9e0682f88085a1590ea55f48755c

Cash Out data path:
- Minutes
- minutes_daily.detail_cash_out
- daily_recap_source.cash_out
- daily_recap_source.keterangan_cash_out
- ERP Cash Out display

Cash Out recovery rule:
- Do not redesign the formula, parser, formatter, or sync path for a regression.
- Identify the exact branch/date mismatch first.
- Compare source/Supabase against ERP.
- Repair only the mismatched target through the existing data/sync path whenever possible.
- If source data is correct but ERP behavior regresses, compare against this HARD LOCK baseline and restore the affected code rather than rebuilding the module.

## LOCKED FILES FOR CASH OUT

Files below are the verified Cash Out baseline reference and MUST NOT be modified in the stable baseline unless owner explicitly unlocks the task:
- ERP.NEW/js/modules/cash-out.js
- ERP.NEW/pages/cash-out.html
- ERP.NEW/styles/cash-out.css
- ERP.NEW/components/cash-out-detail.html
- minutes-connector/sync.js

## CHANGE POLICY

- Stable baseline is reference-only.
- Future fixes/features must be developed outside the locked baseline, reviewed against this manifest, and merged only after owner validation.
- No formula change, classifier change, scheduler cadence change, anti-overlap change, freshness change, or DB schema change may be bundled into unrelated tasks.
- Regression restore must restore this verified behavior, not redesign it.

## SECURITY

Do not commit `.env`, passwords, tokens, service-role keys, cookies, session files, or other secrets into this repository.
