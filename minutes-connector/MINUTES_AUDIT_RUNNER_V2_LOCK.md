# Minutes Audit Runner V2 — OWNER PASS / LOCK

Status: OWNER PASS → LOCK
Date: 2026-09-05

## Purpose
Read-only audit runner untuk membandingkan data Minutes yang dipakai ERP melalui jalur:

Minutes → Supabase → ERP / DailyDataEngine

Tanpa mengubah rumus/engine produksi yang sudah LOCK.

## Canonical rules
- TRANSACTION = Daily Recap Minutes TRANSACTION
- CUSTOMER = Daily Recap Minutes CUSTOMER
- SERVICES = Daily Recap Minutes SERVICES
- Gross Omzet Minutes = Settlement `Gross Revenue`
- ERP Gross Omzet = DailyDataEngine `summary.omzet`
- Semua audit bersifat READ ONLY
- DailyDataEngine dan SetoranMoneyEngine tidak boleh diubah oleh runner

## Bulk coverage yang sudah diuji PASS
3-layer compare Minutes ↔ Supabase ↔ ERP:
- transaction
- customer
- services
- netServicesSales
- netProductsSales
- grossOmzet
- cashPayment
- nonCash
- cashOut
- productCost
- netRevenueMinutes

Minutes ↔ minutes_daily compare:
- grossRevenue
- revenue
- cashPayment
- nonCash
- totalPayment
- totalShare
- cashIn
- cashOut
- productCost
- thirdPartyCharges
- netRevenue

## PASS evidence
Cinangsi — 2026-09-05
- 22 checks
- mismatch: 0
- workflow: SUCCESS

## Locked files
- `minutes-connector/audit-minutes-v2.js`
- `minutes-connector/compare-erp-engine-v2.js`
- `.github/workflows/audit-minutes-v2.yml`

Perubahan berikutnya wajib mengikuti workflow Owner:
one task at a time → audit/test → OWNER PASS → LOCK → selective commit.
