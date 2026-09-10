# LOCK — ERP VAX Provider Master Sync

Status: OWNER PASS + LOCK
Date: 2026-09-10

## Scope locked
- `minutes-connector/provider-master-audit.js`
- `minutes-connector/provider-master-sync.js`
- `minutes-connector/provider-master-sync-run.sh`
- `minutes-connector/systemd/erp-vax-provider-master-sync.service`
- `minutes-connector/systemd/erp-vax-provider-master-sync.timer`
- `ERP.NEW/migrations/20260910_provider_master_identity_map.sql`

## Final rules
- Minutes controls provider operational name, active branch, and active/inactive status.
- ERP remains source of truth for jabatan, employee ID, WhatsApp/phone, KTP address, and employee history.
- Generic `CAPSTER` and `BACKUP` entries are not employees and are ignored.
- Explicit provider-to-employee identity mapping has priority over historical/name matching.
- Sync never creates or deletes employees.
- Sync never changes `jabatan`, `no_hp_wa`, or `alamat_ktp`.
- Write mode is guarded and only allows `nama_karyawan`, `cabang_id`, and `aktif`.
- Scheduler is isolated from the locked Daily Recap/Minutes sync engine.

## Scheduler
- systemd service: `erp-vax-provider-master-sync.service`
- systemd timer: `erp-vax-provider-master-sync.timer`
- interval: every 30 minutes
- overlap protected with `flock`

## Owner-approved explicit identity
- Minutes provider `NDING` / provider ID `12591` = ERP employee `Nazril` / employee ID `22`.
- ERP canonical name remains `Nazril`.

## PASS evidence
Manual systemd run on 2026-09-10 completed successfully:
- branches: 10
- providers: 48
- errors: 0
- generic ignored: 13
- matched: 35
- unmapped: 0
- ambiguous blockers: 0
- broken explicit blockers: 0
- multi-live-provider blockers: 0
- rows with changes: 0
- applied: 0 (expected because ERP already matched Minutes at test time)
- `AUDIT_GATE_PASS`
- `WRITE_MODE=TRUE`
- service exited successfully

Do not modify this locked flow without explicit Owner unlock/approval.
