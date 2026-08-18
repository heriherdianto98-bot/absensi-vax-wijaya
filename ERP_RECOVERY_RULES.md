# ERP VAX — RECOVERY RULES

## 1. Golden Rule
If a previously PASS / HARD LOCK module regresses:

**DO NOT redesign.**  
**DO NOT rebuild from zero.**

First determine whether the problem is:
- A. source data
- B. sync
- C. Supabase stored data
- D. local/runtime code
- E. UI/parser/display

Use the official GitHub HARD LOCK as the known-good baseline.

## 2. Standard Diagnosis Flow
When owner reports a mismatch:
1. Identify module.
2. Identify branch.
3. Identify date / range.
4. Identify exact wrong metric / detail.
5. Read source / Supabase first.
6. Inspect ERP runtime / local output READ-ONLY.
7. Compare the two.
8. Mark the exact mismatch.
9. Repair ONLY the mismatched target.
10. Re-check the repaired target.
11. Stop for owner review.

Never start with a broad refactor.

## 3. Data vs Code Decision
If Minutes / Supabase is wrong or incomplete:
- repair / re-fetch data through the EXISTING source / sync path.

If Minutes / Supabase is correct but ERP is wrong:
- compare local code with the official GitHub HARD LOCK.

If local code differs from HARD LOCK unexpectedly:
- restore only the affected file / section from the official baseline.

Do not rebuild the module.

## 4. Cash Out Recovery
Official baseline:

Branch: `locked/cash-out-2026-08-19`  
Commit: `bcb46969c76d9e0682f88085a1590ea55f48755c`

Verified: **10/10 branches, 01–18 Aug 2026**

Expected data path:
`Minutes → minutes_daily.detail_cash_out → daily_recap_source.cash_out → daily_recap_source.keterangan_cash_out → ERP Cash Out`

Cash Out mismatch procedure:
1. Compare Supabase Minutes-derived row vs ERP row.
2. Identify exact branch / date.
3. Check transaction count, total, description, nominal, cashier, and collapsed detail.
4. Repair ONLY the branch / date mismatch.
5. Use existing formatter / upsert.
6. No hardcoded totals.
7. No new schema.
8. Re-check only repaired target first.
9. Final 10-branch check only when needed.

## 5. KPI Ultimate Recovery
Official baseline:

Branch: `locked/kpi-ultimate-2026-08-18`  
Commit: `c9f78223876d324c2a6b4636f95d74f8e42b88c9`

Verified: **10/10 against Minutes Service Sales**

Rules:
- MTD only.
- Only MAX, RELAX, REGULER, PLUS, ENAKIN KEPALA.
- Use aliases / case normalization.
- All KPI components use the same filtered dataset.
- Targets / progress formula locked.
- bigint ID guard locked.

If KPI differs:
- check source freshness and filtered MTD data first.
- do not change formula before source / data is proven correct.

## 6. Sync / Freshness Recovery
Production uses systemd.

Do not casually change:
- scheduler cadence,
- one-minute tick,
- anti-overlap,
- freshness UI,
- systemd services,
- guard behavior.

If sync appears wrong:
- inspect runtime / log / source freshness first.
- do not infer scheduler failure only from stale UI.

## 7. GitHub HARD LOCK Rules
HARD LOCK branch is the official known-good snapshot.

Allowed without owner approval:
- read,
- compare,
- inspect.

NOT allowed automatically:
- edit lock branch,
- overwrite lock,
- merge lock,
- push new lock changes,
- replace baseline.

Any new verified version must follow:
**PASS → verify → owner review → new snapshot / lock**.

## 8. Supabase Safety
READ-ONLY inspection is preferred first.

Do not:
- manual UPDATE,
- manual DELETE,
- schema changes,
- hardcoded correction,

unless explicitly authorized.

Historical repair should use the existing source / sync path whenever possible.

## 9. Owner Interaction
Owner only needs to report the visible business mismatch.

Examples:
- `Cash Out Palabuan beda`
- `KPI Pamanukan beda`
- `ERP total beda dengan Minutes`

Do not ask owner to manually audit everything if source / runtime can be compared technically.

Technical assistant should return:
- ✅ MATCH
- ❌ MISMATCH
- ⚠️ SOURCE INCOMPLETE

Then return:
- exact branch,
- exact date,
- exact value,
- exact difference,
- recommended targeted action.

## 10. Mandatory STOP Rule
After diagnosis or repair:

**STOP FOR OWNER REVIEW.**

Do not continue into unrelated modules automatically.

## 11. Security
Never commit:
- `.env`
- access tokens
- passwords
- service role keys
- private credentials

Last updated: **2026-08-19**

Source of truth: GitHub HARD LOCK branches + verified Supabase / Minutes data.
