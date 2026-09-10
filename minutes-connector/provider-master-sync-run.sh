#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/absensi-vax-wijaya/minutes-connector"
LIVE_JSON="/tmp/provider-master-live.json"
RESULT_JSON="/tmp/provider-master-sync-scheduled.json"
LOCK_FILE="/run/erp-vax-provider-master-sync.lock"

cd "$ROOT"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "SKIP: provider master sync already running"
  exit 0
fi

# 1) READ LIVE Minutes provider master (read-only)
node provider-master-audit.js --out="$LIVE_JSON"

# 2) Fail-safe validation before any write
node - <<'NODE'
const fs = require('fs');
const p = '/tmp/provider-master-live.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!j.audit_read_only) throw new Error('provider live file is not marked read-only audit');
if (!j.summary) throw new Error('provider live summary missing');
if (Number(j.summary.errors || 0) !== 0) throw new Error(`provider live audit errors=${j.summary.errors}`);
if (Number(j.summary.branches || 0) !== 10) throw new Error(`expected 10 active branches, got ${j.summary.branches}`);
if (Number(j.summary.providers || 0) <= 0) throw new Error('provider live audit returned zero providers');
console.log(`AUDIT_GATE_PASS branches=${j.summary.branches} providers=${j.summary.providers} errors=${j.summary.errors}`);
NODE

# 3) Guarded apply. Script itself only permits nama/cabang/aktif fields.
node provider-master-sync.js --input="$LIVE_JSON" --out="$RESULT_JSON" --apply

# 4) Print compact final result for journalctl
node - <<'NODE'
const fs = require('fs');
const p = '/tmp/provider-master-sync-scheduled.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('PROVIDER_MASTER_SYNC_RESULT=' + JSON.stringify(j.summary || {}));
NODE
