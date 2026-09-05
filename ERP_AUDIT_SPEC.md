# Minutes Audit Runner V1 — OWNER PASS / LOCK

Status: OWNER PASS → LOCK
Date: 2026-09-05

## Purpose
Read-only audit path for validating daily operational KPI across three layers:

Minutes Daily Recap → Supabase `daily_recap_source` → ERP `DailyDataEngine`

## Canonical KPI rules
- TRX = Minutes Daily Recap `TRANSACTION`
- Customer = Minutes Daily Recap `CUSTOMER`
- Services = Minutes Daily Recap `SERVICES`

Do not derive TRX from Customer Transactions + Guest Transactions.

## Permanent components
- `minutes-connector/audit-minutes.js`
- `minutes-connector/compare-erp-engine.js`
- `.github/workflows/audit-minutes.yml`
- `audit/requests/current.json`

Standalone login diagnostic:
- `minutes-connector/login-minutes-test.js`
- `.github/workflows/test-minutes-login.yml`

## Audit behavior
The runner is READ-ONLY. It may:
1. log in to Minutes,
2. switch to Merchant,
3. select a branch,
4. open Daily Recap for a requested date/range,
5. read TRX / Customer / Services,
6. compare Minutes vs Supabase,
7. compare the same row as exposed through ERP `DailyDataEngine`,
8. report MATCH / MISMATCH.

It must not write back to Minutes, Supabase, or ERP.

## ERP protection
`ERP.NEW/js/modules/daily-data-engine.js` remains OWNER LOCKED. Audit code may read/use the engine source for verification only. It must not redefine or modify DailyDataEngine formulas.

## Proven test
Cinangsi, 2026-09-05:
- Minutes T/C/S = 22 / 20 / 25
- Supabase T/C/S = 22 / 20 / 25
- ERP DailyDataEngine T/C/S = 22 / 20 / 25
- Result = MATCH
- Mismatch = 0

## Normal operator intent
Examples:
- `Audit Minutes Cinangsi tanggal 1–5 September, compare Supabase dan ERP.`
- `Audit semua cabang Minutes dari tanggal 1 sampai hari ini, cari mismatch dengan Supabase dan ERP.`

This capability is permanently named **Minutes Audit Runner V1**.
