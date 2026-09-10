#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/absensi-vax-wijaya/minutes-connector"
LIVE_JSON="/tmp/provider-contact-master-live.json"
RESULT_JSON="/tmp/provider-contact-sync-result.json"
LOCK_FILE="/run/erp-vax-provider-contact-sync.lock"

cd "$ROOT"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "SKIP: provider contact sync already running"
  exit 0
fi

# 1) Reuse locked provider master AUDIT in read-only mode only,
#    writing to a separate temp file. Locked source file itself is untouched.
node provider-master-audit.js --out="$LIVE_JSON"

# 2) Validate provider audit before opening provider detail pages.
node - <<'NODE'
const fs=require('fs');
const p='/tmp/provider-contact-master-live.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
if (!j.audit_read_only) throw new Error('provider contact input is not marked read-only');
if (!j.summary) throw new Error('provider contact summary missing');
if (Number(j.summary.errors||0)!==0) throw new Error(`provider audit errors=${j.summary.errors}`);
if (Number(j.summary.branches||0)!==10) throw new Error(`expected 10 active branches, got ${j.summary.branches}`);
if (Number(j.summary.providers||0)<=0) throw new Error('provider audit returned zero providers');
console.log(`CONTACT_AUDIT_GATE_PASS branches=${j.summary.branches} providers=${j.summary.providers}`);
NODE

# 3) Isolated contact sync. Only karyawan.no_hp_wa can be filled, blank-only.
node provider-contact-sync.js --input="$LIVE_JSON" --out="$RESULT_JSON" --apply

# 4) Compact result for journalctl.
node - <<'NODE'
const fs=require('fs');
const p='/tmp/provider-contact-sync-result.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
console.log('PROVIDER_CONTACT_SYNC_RESULT='+JSON.stringify(j.summary||{}));
NODE
