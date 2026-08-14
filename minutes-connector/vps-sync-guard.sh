#!/usr/bin/env bash
set -u

SERVICE="erp-vax-minutes-sync.service"
LOG="/var/log/erp-vax-sync-guard.log"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"

log(){ echo "[$NOW] $*" >> "$LOG"; }

# 1) Service harus hidup. systemd akan auto-restart, guard menjadi lapisan kedua.
if ! systemctl is-active --quiet "$SERVICE"; then
  log "SERVICE_DOWN -> restart $SERVICE"
  systemctl restart "$SERVICE"
  exit 0
fi

# 2) Scheduler tidak boleh dobel.
COUNT=$(pgrep -fc 'node .*minutes-connector/scheduler.js' || true)
if [ "$COUNT" -gt 1 ]; then
  log "DUPLICATE_SCHEDULER count=$COUNT -> restart clean"
  systemctl restart "$SERVICE"
  exit 0
fi

# 3) Child sync yang macet terlalu lama (>12 menit) dibersihkan melalui restart service.
for PID in $(pgrep -f '/minutes-connector/(sync.js|provider-sales-sync.js)' || true); do
  ELAPSED=$(ps -o etimes= -p "$PID" 2>/dev/null | tr -d ' ' || echo 0)
  if [ "${ELAPSED:-0}" -gt 720 ]; then
    log "STUCK_CHILD pid=$PID elapsed=${ELAPSED}s -> restart service"
    systemctl restart "$SERVICE"
    exit 0
  fi
done

log "HEALTHY"
