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

# 2) Scheduler tidak boleh dobel, termasuk proses lama yang dipanggil sebagai `node scheduler.js`.
COUNT=$(pgrep -fc '[n]ode .*scheduler.js' || true)
if [ "$COUNT" -gt 1 ]; then
  log "DUPLICATE_SCHEDULER count=$COUNT -> clean legacy + restart service"

  # Stop service dulu agar proses milik systemd tidak berlomba dengan proses legacy.
  systemctl stop "$SERVICE"
  sleep 1

  # Bersihkan semua scheduler/sync legacy/manual. Bracket pattern mencegah self-match.
  pkill -f '[n]ode .*scheduler.js' 2>/dev/null || true
  pkill -f '[n]ode .*/minutes-connector/sync.js' 2>/dev/null || true
  pkill -f '[n]ode .*/minutes-connector/provider-sales-sync.js' 2>/dev/null || true
  pkill -f '[x]vfb-run .*scheduler.js' 2>/dev/null || true
  pkill -f '[x]vfb-run .*/minutes-connector/sync.js' 2>/dev/null || true

  sleep 2
  systemctl start "$SERVICE"
  exit 0
fi

# 3) Child sync yang macet terlalu lama (>12 menit) dibersihkan melalui restart service.
for PID in $(pgrep -f '[n]ode .*/minutes-connector/(sync.js|provider-sales-sync.js)' || true); do
  ELAPSED=$(ps -o etimes= -p "$PID" 2>/dev/null | tr -d ' ' || echo 0)
  if [ "${ELAPSED:-0}" -gt 720 ]; then
    log "STUCK_CHILD pid=$PID elapsed=${ELAPSED}s -> restart service"
    systemctl restart "$SERVICE"
    exit 0
  fi
done

log "HEALTHY"
