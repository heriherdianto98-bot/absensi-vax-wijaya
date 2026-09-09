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

Files below are the verified Setoran 3 Harian baseline reference and MUST NOT be modified unless Owner explicitly unlocks this task:
- ERP.NEW/pages/setoran-3-harian.html
- ERP.NEW/components/setoran-3-harian-table.html
- ERP.NEW/js/modules/setoran-3-harian.js
- ERP.NEW/js/modules/setoran-money-engine.js
- ERP.NEW/styles/setoran-3-harian.css

## HARD LOCK — SHARE PROVIDER SOURCE

Status: FULL PASS / HARD LOCK

Verified on:
- 2026-09-02 WIB

Verified historical coverage:
- August 2026 = 31/31 days for all 10 operational branches in `provider_sales_daily_source`.

Validation:
- Source is Minutes Provider Sales per provider per day.
- Backfill gap for 2026-08-10, 2026-08-11, and 2026-08-12 was completed using the existing `provider-sales-sync.js` historical date argument; no redesign of the sync engine was performed.
- Rawabadak stale row `Fauzi` on 2026-08-31 with provider share Rp30.000 was removed after direct Minutes verification showed provider service share for that day only belonged to Wily Rp120.000 and Dori Rp137.000. The Fajar Rp35.000 value belongs to Provider Product Recap / Share Produk and must not be mixed into Share Provider.
- Final Rawabadak August Provider Share = Rp11.891.000, exact match to Minutes.
- September 1 automatic sync exists for 10/10 branches.
- Kalijati 2026-09-01 cross-check: Minutes Provider Share = Rp724.000 and Supabase = Rp724.000, exact match.

Verified August totals:
- Kalijati = Rp19.362.000
- Palabuan = Rp13.211.000
- Soklat = Rp11.320.000
- Rawabadak = Rp11.891.000
- AR Hakim = Rp14.995.000
- SPBU Pagaden = Rp6.783.000
- Pamanukan = Rp10.801.000
- Parahyangan = Rp13.627.000
- Cinangsi = Rp13.665.000
- Mekarwangi = Rp0

Automatic update path:
- `erp-vax-minutes-sync.service`
- `minutes-connector/scheduler.js`
- Daily Recap
- `sync-status-interval-fix.js`
- `provider-sales-sync.js`
- `provider_sales_daily_source`

Business role:
- Share Provider is the verified source for future Tabel Harian Share Provider display, payroll/gaji calculations, and employee/mobile provider earnings history.
- Downstream modules must read this verified source; do not create a parallel provider-share calculation.

Recovery rule:
- If totals differ, audit exact branch/date/provider first against Minutes Provider Service Recap / Provider Sales.
- Correct only the proven stale/missing target row or re-run the existing historical-date backfill path.
- Do not modify `sync.js`, scheduler cadence, anti-overlap behavior, or rebuild Provider Sales from scratch without explicit Owner unlock.

## LOCKED FILES FOR SHARE PROVIDER SOURCE

Files below are the verified Share Provider baseline and MUST NOT be modified unless Owner explicitly unlocks this task:
- minutes-connector/provider-sales-sync.js
- minutes-connector/scheduler.js

## HARD LOCK — UNIFIED PAYROLL BUSINESS FORMULA

Status: BUSINESS RULE LOCKED / IMPLEMENTATION UNDER OWNER VALIDATION

Locked formula:
- `Gaji Bersih = Gaji Pokok - Denda - Kasbon + Bonus Insentif + Bonus KPI + Bonus Produk`

Locked source ownership:
- Capster Gaji Pokok = `provider_sales_daily_source.provider_share` dari Minutes. Jangan dipindahkan ke fixed salary master.
- Non-Capster Gaji Pokok = `payroll_salary_master`, dengan histori periode efektif dan basis `MONTHLY` atau `DAILY` per karyawan.
- Denda = `absensi.denda` per karyawan/tanggal.
- Kasbon = source `employee_cash_advances`; payroll tidak membuat input Kasbon paralel.
- Bonus Produk = `product_sales_source.revenue_share` yang sudah matched ke `employee_id`, hanya detail harian `period_start = period_end` agar snapshot bulanan lama tidak double count.
- Bonus Insentif dan Bonus KPI = `payroll_manual_adjustments`.

Locked role behavior:
- Master Gaji adalah unified payroll untuk Capster, Kasir, Kasir Backup, Supervisor/SVP, Tim Floating, dan jabatan lain yang terdaftar di master karyawan.
- Setelah Cabang dipilih, pilihan Karyawan mengikuti master karyawan cabang tersebut.
- Service hanya merupakan komponen Capster dari Minutes; untuk non-Capster tampil `—`.
- Share/Bonus Produk mengikuti seller `employee_id`, sehingga dapat masuk ke Capster maupun Kasir.
- Generic Minutes `Backup` / `Capster` yang belum diketahui orangnya tetap Pending Mapping dan tidak boleh dipaksa ke payroll seseorang.
- Nominal fixed salary non-Capster tidak boleh di-hardcode berdasarkan jabatan karena tiap karyawan dapat berbeda.
- Perubahan gaji masa depan tidak boleh mengubah histori lama; gunakan `effective_from` / `effective_to` pada salary master.

Current implementation files (not file-level HARD LOCK until OWNER PASS):
- `ERP.NEW/js/modules/payroll-unified-engine.js`
- `ERP.NEW/js/modules/payroll-salary-master-store.js`
- `ERP.NEW/js/modules/payroll-manual-adjustment-store.js`
- `ERP.NEW/pages/payroll-capster.html`
- `ERP.NEW/js/modules/payroll-capster-ui.js`
- `ERP.NEW/js/modules/payroll-capster-print.js`
- `ERP.NEW/styles/payroll-unified.css`
- `ERP.NEW/migrations/20260903_payroll_salary_master_v1.sql`

Unlock rule:
- Formula atau source ownership di atas hanya boleh diubah setelah Owner secara eksplisit membuka LOCK.
- UI/presentation boleh diperbaiki selama tidak mengubah rumus atau source ownership.

## HARD LOCK — SVP INVOICE EMAIL + WHATSAPP PDF SHARE

Status: OWNER PASS / HARD LOCK

Verified on:
- 2026-09-10 WIB

Verified capabilities:
- Owner dapat membuat dan mengelola Invoice SVP dari Master Tagihan.
- Email invoice dapat dikirim dari ERP lokal melalui API online/VPS dengan autentikasi Owner.
- Email delivery menggunakan service invoice terpisah dan SMTP/Brevo yang sudah teruji.
- WhatsApp membuka nomor SVP yang sudah ditetapkan melalui `api.whatsapp.com` dengan pesan profesional.
- WhatsApp share membuat token acak 10 karakter untuk setiap invoice dan menghasilkan direct PDF link publik read-only.
- Format link PDF final: `https://erp.vaxwijaya.com/i/<token>.pdf`.
- Link lama `https://erp.vaxwijaya.com/i/<token>` tetap kompatibel.
- PDF share tidak memerlukan login SVP/Owner, hanya token share yang valid; token dapat direvoke melalui mekanisme share link.
- PDF share menampilkan header invoice, tanggal, jatuh tempo, item, nominal, total, catatan Owner, otorisasi/tanda tangan Owner, dan footer.
- Service share publik berjalan terpisah pada `erp-vax-svp-invoice-share.service` / port 8792 dan diproxy melalui Nginx `erp.vaxwijaya.com`.
- Perubahan UI tombol WhatsApp tidak mengubah logic email/share/token.

Locked behavior:
- Jangan ubah autentikasi Owner untuk endpoint email/share tanpa explicit Owner unlock.
- Jangan ubah nomor tujuan WhatsApp SVP tanpa explicit Owner instruction.
- Jangan mengganti token share dengan invoice number yang mudah ditebak.
- Jangan membuat PDF share membuka data invoice lain selain invoice yang terkait token.
- Jangan menggabungkan service invoice dengan engine Minutes, Finance, Cash Out, Arus Kas, atau scheduler.
- UI/presentation boleh diperbaiki selama tidak mengubah email delivery, auth, token, source invoice, atau share security behavior.

## LOCKED FILES FOR SVP INVOICE EMAIL + WHATSAPP PDF SHARE

Files below are the verified Invoice SVP baseline and MUST NOT be modified except for UI-only presentation changes explicitly requested by Owner:
- `ERP.NEW/js/modules/master-tagihan-svp-invoice.js`
- `ERP.NEW/js/modules/master-tagihan-svp-invoice-ui.js`
- `ERP.NEW/js/modules/master-tagihan-svp-invoice-share.js`
- `notification-service/svp-invoice-api.js`
- `notification-service/svp-invoice-share-api.js`

Presentation file allowed for UI-only adjustment without unlocking business logic:
- `ERP.NEW/styles/master-tagihan-svp-invoice.css`

Security / deployment notes:
- Do not commit `.env`, Supabase service-role key, SMTP credentials, WhatsApp session data, or browser access tokens.
- VPS runtime files under `/opt/erp-vax-notification` are deployment targets; canonical source remains this repository.

## CHANGE POLICY

- Stable baseline is reference-only.
- Future fixes/features must be developed outside the locked baseline, reviewed against this manifest, and merged only after owner validation.
- No formula change, classifier change, scheduler cadence change, anti-overlap change, freshness change, or DB schema change may be bundled into unrelated tasks.
- Regression restore must restore this verified behavior, not redesign it.

## SECURITY

Do not commit `.env`, passwords, tokens, service-role keys, cookies, session files, or other secrets into this repository.
