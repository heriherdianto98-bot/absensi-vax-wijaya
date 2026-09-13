#!/usr/bin/env bash
set -euo pipefail

# VAX ERP — install monthly-period-freeze.js cron
# Schedule: tanggal 1, 01:00 WIB.
# Additive only; does not modify scheduler.js or any LOCK engine.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(command -v node || true)"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/monthly-period-freeze.log"
CRON_TAG="# ERP_VAX_MONTHLY_PERIOD_FREEZE"

if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: node tidak ditemukan di PATH."
  exit 1
fi

if [[ ! -f "$SCRIPT_DIR/monthly-period-freeze.js" ]]; then
  echo "ERROR: $SCRIPT_DIR/monthly-period-freeze.js tidak ditemukan."
  exit 1
fi

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

CURRENT="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "$CURRENT" | grep -v 'ERP_VAX_MONTHLY_PERIOD_FREEZE' || true)"

{
  printf '%s\n' "$CLEANED"
  echo 'CRON_TZ=Asia/Jakarta'
  echo "0 1 1 * * cd '$SCRIPT_DIR' && '$NODE_BIN' '$SCRIPT_DIR/monthly-period-freeze.js' >> '$LOG_FILE' 2>&1 $CRON_TAG"
} | awk 'NF || !seen_blank++' | crontab -

echo "OK: cron monthly-period-freeze terpasang."
echo "Jadwal: tanggal 1 jam 01:00 WIB."
echo "Script: $SCRIPT_DIR/monthly-period-freeze.js"
echo "Log: $LOG_FILE"
echo
echo "Verifikasi:"
crontab -l | grep -E 'CRON_TZ=Asia/Jakarta|ERP_VAX_MONTHLY_PERIOD_FREEZE' || true
