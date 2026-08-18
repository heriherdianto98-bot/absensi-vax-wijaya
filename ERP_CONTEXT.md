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

## 4. Sync / Freshness Locked Context
- Production sync uses systemd.
- Scheduler tick is one minute.
- Anti-overlap is locked.
- Freshness behavior is already locked.
- Do not touch scheduler / freshness unless a real regression is proven.

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

## 9. Important Safety Rules
- No manual hardcoded totals.
- No manual SQL UPDATE for historical Cash Out repair unless explicitly authorized.
- No DB schema changes unless explicitly required.
- Do not touch unrelated locked modules.
- No `.env` / secrets in GitHub.
- Always stop for owner review before broad changes.

Last updated: **2026-08-19**

Source of truth: GitHub HARD LOCK branches + verified Supabase / Minutes data.
