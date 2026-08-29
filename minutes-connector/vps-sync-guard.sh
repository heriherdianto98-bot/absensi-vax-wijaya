#!/usr/bin/env bash
set -u

SERVICE="erp-vax-minutes-sync.service"
LOG="/var/log/erp-vax-sync-guard.log"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"

log(){ echo "[$NOW] $*" >> "$LOG"; }

# 1) Service harus hidup. systemd adalah owner utama scheduler.
if ! systemctl is-active --quiet "$SERVICE"; then
  log "SERVICE_DOWN -> restart $SERVICE"
  systemctl restart "$SERVICE"
  exit 0
fi

MAIN_PID=$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null || echo 0)

# 2) Bersihkan scheduler legacy/manual. Hanya MainPID milik systemd yang boleh hidup.
DUPLICATE_FOUND=0
for PID in $(pgrep -f '[n]ode .*scheduler.js' || true); do
  if [ "$PID" != "$MAIN_PID" ]; then
    log "LEGACY_SCHEDULER pid=$PID main=$MAIN_PID -> kill"
    kill -9 "$PID" 2>/dev/null || true
    DUPLICATE_FOUND=1
  fi
done

# xvfb-run scheduler lama tidak boleh hidup karena scheduler systemd berjalan direct node.
for PID in $(pgrep -f '[x]vfb-run .*scheduler.js' || true); do
  log "LEGACY_XVFB_SCHEDULER pid=$PID -> kill"
  kill -9 "$PID" 2>/dev/null || true
  DUPLICATE_FOUND=1
done

if [ "$DUPLICATE_FOUND" -eq 1 ]; then
  sleep 1
fi

# Pastikan scheduler systemd tetap hidup setelah cleanup.
if ! kill -0 "$MAIN_PID" 2>/dev/null; then
  log "MAIN_SCHEDULER_MISSING_AFTER_CLEANUP -> restart $SERVICE"
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

SCHED_COUNT=$(pgrep -fc '[n]ode .*scheduler.js' || true)
if [ "$SCHED_COUNT" -ne 1 ]; then
  log "SCHEDULER_COUNT_INVALID count=$SCHED_COUNT -> restart clean"
  systemctl restart "$SERVICE"
  exit 0
fi

log "HEALTHY main_pid=$MAIN_PID scheduler_count=$SCHED_COUNT"
