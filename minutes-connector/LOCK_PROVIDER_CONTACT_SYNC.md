# LOCK — ERP VAX Provider Contact Sync

Status: OWNER PASS + LOCK
Date: 2026-09-10

## Scope locked
- `minutes-connector/provider-contact-sync.js`
- `minutes-connector/provider-contact-sync-run.sh`

## Purpose
Isolated contact sync from Minutes Provider Detail to ERP Karyawan.

Source field Minutes:
- `#prov_phone` / `input[name="prov_phone"]`

Target field ERP:
- `public.karyawan.no_hp_wa`

## Final rules
- This is a separate flow from the locked Provider Master Sync.
- Target role is Kasir only.
- Existing ERP phone/WhatsApp values are preserved and never overwritten.
- Only blank `karyawan.no_hp_wa` values may be filled.
- Employee identity must resolve to an existing ERP `karyawan.id`.
- No employee is created or deleted.
- Never changes employee ID, name, branch, jabatan, active status, KTP address, sales, attendance, payroll, or finance data.
- Default mode is DRY RUN.
- Write occurs only with explicit `--apply`.
- Apply is blocked on identity blockers or provider-detail errors.

## PASS evidence — 2026-09-10
Provider master audit input:
- branches: 10
- providers: 48
- errors: 0

Contact sync DRY RUN:
- identity blockers: 0
- applied: 0
- 10 Kasir resolved with Minutes phone and status READY_TO_FILL

Owner-approved APPLY:
- mode: APPLY
- cashier_rows: 10
- ready_to_fill: 10
- erp_phone_preserved: 0
- minutes_phone_empty: 0
- detail_errors: 0
- identity_blockers: 0
- applied: 10

ERP UI verification:
- Owner verified phone is visible in Master Karyawan Edit modal (example Ivan: `+62 813-1668-4657`).
- Owner response: PASS.

## Scheduler note
No scheduler/service/timer is included in this LOCK. Runtime scheduling must be tested separately and receive Owner PASS before it can be LOCKED.

Do not modify this locked contact-sync flow without explicit Owner unlock/approval.
