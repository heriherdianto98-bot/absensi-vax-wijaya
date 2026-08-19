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

## HARD LOCK — TABEL HARIAN

Status: FULL PASS / HARD LOCK

Verified period:
- 2026-08-01 through 2026-08-18

Validation:
- 10 branches × 18 days = 180/180 daily rows.
- Exact match against Supabase for 8 core metrics:
  - Omzet
  - Nett
  - Non Tunai
  - Cash Out
  - Cash Bersih
  - Customer
  - Transaksi
  - Services
- No missing date×branch rows, no duplicate tanggal+cabang_id rows, and no null on mapped core fields in the verified snapshot.

Official branch:
- locked/tabel-harian-2026-08-19

Official commit:
- 00008ad7d0f831ca14c4bbe57810f5fc97336707

Tabel Harian source / calculation path:
- daily_recap_source
- ERP.NEW/js/modules/dashboard-engine.js
- ERP.NEW/js/modules/setoran-money-engine.js
- ERP.NEW/js/modules/tabel-harian-cabang.js
- ERP.NEW/pages/tabel-harian-cabang.html

Business role:
- Tabel Harian is a critical operational data layer used as reference for downstream dashboard, owner analysis/decision support, setoran 3-harian, and monthly recap.
- Do not introduce separate formulas in downstream modules that silently diverge from this verified baseline.

Recovery rule:
- If a daily metric differs, identify exact branch/date/field first.
- Compare source/Supabase with ERP output.
- If source is correct but ERP regresses, compare affected files against this HARD LOCK baseline.
- Restore targeted behavior; do not redesign the module from zero.

## LOCKED FILES FOR TABEL HARIAN

Files below are the verified Tabel Harian baseline reference and MUST NOT be modified in the stable baseline unless owner explicitly unlocks the task:
- ERP.NEW/pages/tabel-harian-cabang.html
- ERP.NEW/js/modules/tabel-harian-cabang.js
- ERP.NEW/js/modules/dashboard-engine.js
- ERP.NEW/js/modules/setoran-money-engine.js

## HARD LOCK — SETORAN 3 HARIAN

Status: FULL PASS / HARD LOCK

Validation:
- Formula/business flow verified against the same money basis used by Tabel Harian.
- Nett = nett_revenue + product_cost.
- Cash Referensi = Nett - Non Tunai.
- Cash Out is display/context only and is NOT subtracted again.
- Owner may take setoran at any time, with maximum holding period 3 days.
- CLEAR before period_end is valid business behavior.
- Existing CLEAR / DONE / receipt / proof workflow remains unchanged.
- UI context distinguishes money already taken by Owner from later live data changes.

Official branch:
- locked/setoran-3-harian-2026-08-19

Official commit:
- 47e6148cef8c78aeff1d46798c61dd375c96e72d

Owner-taken interpretation:
- `setoran_cash_actual` is the amount taken/saved at Owner action.
- Current live Cash Referensi may later change if new transactions/data arrive.
- Such post-take change must be shown as informational `Perubahan setelah pengambilan`, not automatically as shortage.

## LOCKED FILES FOR SETORAN 3 HARIAN

Files below are the verified Setoran 3 Harian baseline reference and MUST NOT be modified in the stable baseline unless owner explicitly unlocks the task:
- ERP.NEW/pages/setoran-3-harian.html
- ERP.NEW/components/setoran-3-harian-table.html
- ERP.NEW/js/modules/setoran-3-harian.js
- ERP.NEW/js/modules/setoran-money-engine.js
- ERP.NEW/styles/setoran-3-harian.css

## CHANGE POLICY

- Stable baseline is reference-only.
- Future fixes/features must be developed outside the locked baseline, reviewed against this manifest, and merged only after owner validation.
- No formula change, classifier change, scheduler cadence change, anti-overlap change, freshness change, or DB schema change may be bundled into unrelated tasks.
- Regression restore must restore this verified behavior, not redesign it.

## SECURITY

Do not commit `.env`, passwords, tokens, service-role keys, cookies, session files, or other secrets into this repository.
