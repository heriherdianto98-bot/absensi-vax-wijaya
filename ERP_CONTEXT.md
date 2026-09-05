# ERP VAX — OFFICIAL CONTEXT

## 1. System Identity
- ERP VAX / VAX Wijaya
- Production sync uses systemd on VPS.
- GitHub lock repository: `heriherdianto98-bot/ERP-VAX`.

## 2. Hard Lock Policy
- Modules already PASS / HARD LOCK must not be redesigned casually.
- If a regression occurs, compare against and restore from the known-good GitHub baseline.
- HARD LOCK branches are official snapshots.
- Any new change must be verified before a new lock is created.

## 3. Official Hard Locks

### KPI Ultimate
Status: **HARD LOCK OFFICIAL**  
Verified: **10/10 branches against Minutes Service Sales**

Branch: `locked/kpi-ultimate-2026-08-18`  
Commit: `c9f78223876d324c2a6b4636f95d74f8e42b88c9`

Business rules:
- MTD month-to-date.
- Only: MAX, RELAX, REGULER, PLUS, ENAKIN KEPALA.
- Aliases / case must be normalized.
- All KPI values derive from the same filtered MTD dataset.
- Targets / progress formula must not be changed.
- bigint ID guard must remain.

### Cash Out
Status: **HARD LOCK OFFICIAL**  
Verified: **10/10 branches**  
Verified range: **2026-08-01 → 2026-08-18**

Branch: `locked/cash-out-2026-08-19`  
Commit: `bcb46969c76d9e0682f88085a1590ea55f48755c`

Official locked files:
- `ERP.NEW/js/modules/cash-out.js`
- `ERP.NEW/pages/cash-out.html`
- `ERP.NEW/styles/cash-out.css`
- `ERP.NEW/components/cash-out-detail.html`
- `minutes-connector/sync.js`

Cash Out data path:
`Minutes-derived detail → minutes_daily.detail_cash_out → daily_recap_source.cash_out → daily_recap_source.keterangan_cash_out → ERP Cash Out display`

Do not redesign Cash Out formula or formatter.

### Tabel Harian Semua Cabang
Status: **HARD LOCK OFFICIAL**  
Verified range: **2026-08-01 → 2026-08-18**  
Coverage: **10 branches × 18 days = 180/180 rows**

Verified 8 core metrics:
- Omzet
- Nett
- Non Tunai
- Cash Out
- Cash Bersih
- Customer
- Transaksi
- Services

Result: **MATCH 10/10 branches against Supabase**.

Branch: `locked/tabel-harian-2026-08-19`  
Commit: `00008ad7d0f831ca14c4bbe57810f5fc97336707`

Official locked files:
- `ERP.NEW/pages/tabel-harian-cabang.html`
- `ERP.NEW/js/modules/tabel-harian-cabang.js`
- `ERP.NEW/js/modules/dashboard-engine.js`
- `ERP.NEW/js/modules/setoran-money-engine.js`

Core source / formula notes:
- Source query uses `daily_recap_source`.
- Omzet derives from service + produk through the dashboard summary path.
- Nett / Non Tunai / Cash Bersih use the verified money engine path including `SetoranMoneyEngine.calculateBranchMoney`.
- Cash Out uses `daily_recap_source.cash_out` for display and is not silently subtracted again from Cash Bersih.
- Customer / Transaksi / Services use Minutes-derived count fields in the daily source.

Business role:
- Tabel Harian is a critical operational reference layer for the main dashboard, AI-assisted owner analysis/decision support, Setoran 3 Harian, and monthly recap.
- Downstream modules must not introduce silently divergent formulas from this verified baseline.

### Setoran 3 Harian
Status: **HARD LOCK OFFICIAL**

Branch: `locked/setoran-3-harian-2026-08-19`  
Commit: `47e6148cef8c78aeff1d46798c61dd375c96e72d`

Official locked files:
- `ERP.NEW/pages/setoran-3-harian.html`
- `ERP.NEW/components/setoran-3-harian-table.html`
- `ERP.NEW/js/modules/setoran-3-harian.js`
- `ERP.NEW/js/modules/setoran-money-engine.js`
- `ERP.NEW/styles/setoran-3-harian.css`

Verified business rules:
- Setoran may be taken by Owner at any time; maximum holding period is 3 days.
- CLEAR before `period_end` is valid.
- Nett = `nett_revenue + product_cost`.
- Cash Referensi = Nett - Non Tunai.
- Cash Out is display/context only and is not subtracted again.
- `setoran_cash_actual` represents the amount taken/saved at Owner action.
- If live Cash Referensi changes after Owner already took the money, UI must show that change as informational `Perubahan setelah pengambilan`, not automatically as shortage.
- Existing CLEAR / DONE / receipt / proof workflow remains unchanged.

Current UI note:
- Logic/business flow is locked and PASS.
- Setoran 3 Harian UI can be simplified later as a presentation-only redesign, while preserving this locked logic.

## 4. Sync / Freshness Locked Context
- Production sync uses systemd.
- Scheduler tick is one minute.
- Anti-overlap is locked.
- Freshness behavior is already locked.
- Do not touch scheduler / freshness unless a real regression is proven.
- Sync/runtime configuration is a critical dependency because stale or failed sync can make ERP data diverge from Minutes even when UI/formulas are correct.

## 5. Supabase Core Tables
- `kpi_ultimate_sales_source`
- `kpi_ultimate_monthly_target`
- `daily_recap_source`
- `minutes_daily`

Important fields:

`daily_recap_source`
- `cash_out`
- `keterangan_cash_out`

`minutes_daily`
- `detail_cash_out`

## 6. Recovery Philosophy
If ERP differs from Minutes:
1. Do not redesign.
2. Identify exact branch / date / module.
3. Check source / Supabase first.
4. Compare local code with GitHub HARD LOCK.
5. Repair only the mismatched target.
6. Re-check that target.
7. Only then consider a new lock.

## 7. Owner Workflow
Owner only needs to report the visible business mismatch, for example:
- `Cash Out Palabuan beda`
- `KPI Pamanukan beda`
- `Tabel Harian Kalijati beda`
- `Setoran 3 Harian beda`

Technical process:
- compare source data,
- identify exact mismatch,
- targeted repair only,
- owner review,
- verify,
- lock if appropriate.

## 8. Current State
- KPI Ultimate = **HARD LOCK OFFICIAL**
- Cash Out = **HARD LOCK OFFICIAL**
- Cash Out 01–18 Aug 2026 = **10/10 branch exact match**
- Tabel Harian Semua Cabang = **HARD LOCK OFFICIAL**
- Tabel Harian 01–18 Aug 2026 = **180/180 rows; 8 core metrics exact match across 10/10 branches**
- Setoran 3 Harian = **HARD LOCK OFFICIAL**
- Setoran 3 Harian formula/business flow = **PASS**; later UI redesign must be presentation-only.
- Next planned financial priority: **Arus Kas** as the secondary/control financial module.
- After financial module validation, audit **Sync/Runtime configuration** as the critical infrastructure path feeding ERP from Minutes.
- Future UI direction: main ERP Dashboard becomes the visual master shell/design language for all modules; visual unification must not merge or alter locked business logic.

## 9. Important Safety Rules
- No manual hardcoded totals.
- No manual SQL UPDATE for historical Cash Out repair unless explicitly authorized.
- No DB schema changes unless explicitly required.
- Do not touch unrelated locked modules.
- No `.env` / secrets in GitHub.
- Always stop for owner review before broad changes.

## 10. Canonical Transaction Source — Owner Decision 2026-09-05
Audit Minutes membuktikan `Customer Transactions + Guest Transactions` adalah breakdown visitor dan tidak selalu sama dengan jumlah transaksi aktual. Contoh audit menunjukkan Daily Recap / tabel Transactions dapat lebih tinggi karena satu visitor bisa membuat lebih dari satu transaksi, termasuk transaksi produk/minuman.

Aturan canonical:
- `daily_recap_source.transaction_minutes` = angka **TRANSACTION** resmi pada **Minutes Daily Recap**.
- `customer_minutes` tetap = angka **CUSTOMER** Daily Recap.
- `services_minutes` tetap = angka **SERVICES** Daily Recap.
- Jangan derive TRX dari `Customer Transactions + Guest Transactions`.
- Perubahan ini hanya mengoreksi source count TRX; formula Tabel Harian, DailyDataEngine, SetoranMoneyEngine, Cash Out, dan modul LOCK lain tidak diubah.

Implementation commit: `af19c6fc051a23aa813b560f2485e0ab2afafdc8` (`FIX TRX canonical from Minutes Daily Recap`).

Last updated: **2026-09-05**

Source of truth: GitHub HARD LOCK branches + verified Supabase / Minutes data.
