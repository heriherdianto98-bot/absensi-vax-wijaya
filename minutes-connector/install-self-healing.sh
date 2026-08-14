#!/usr/bin/env bash
set -euo pipefail

BASE="/var/www/absensi-vax-wijaya/minutes-connector"
SERVICE="erp-vax-minutes-sync.service"
TIMER="erp-vax-sync-guard.timer"

chmod +x "$BASE/vps-sync-guard.sh"

cp "$BASE/systemd/erp-vax-minutes-sync.service" /etc/systemd/system/
cp "$BASE/systemd/erp-vax-sync-guard.service" /etc/systemd/system/
cp "$BASE/systemd/erp-vax-sync-guard.timer" /etc/systemd/system/

systemctl daemon-reload

# Stop service jika sudah ada, lalu bersihkan semua proses manual/nohup lama.
systemctl stop "$SERVICE" 2>/dev/null || true
pkill -f '[n]ode .*scheduler.js' 2>/dev/null || true
pkill -f '[n]ode .*/minutes-connector/sync.js' 2>/dev/null || true
pkill -f '[n]ode .*/minutes-connector/provider-sales-sync.js' 2>/dev/null || true
pkill -f '[x]vfb-run .*scheduler.js' 2>/dev/null || true
pkill -f '[x]vfb-run .*/minutes-connector/sync.js' 2>/dev/null || true
sleep 2

systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl enable "$TIMER" >/dev/null 2>&1 || true
systemctl start "$SERVICE"
systemctl restart "$TIMER"

sleep 3

echo '=== ERP VAX SELF-HEALING STATUS ==='
systemctl --no-pager --full status "$SERVICE" | sed -n '1,12p'
systemctl --no-pager --full status "$TIMER" | sed -n '1,12p'
echo '=== PROCESS ==='
pgrep -af 'scheduler.js|sync.js|provider-sales-sync.js' || true
echo '=== SCHEDULER COUNT ==='
echo "$(pgrep -fc '[n]ode .*scheduler.js' || true) scheduler"
echo '=== GUARD LOG ==='
tail -n 10 /var/log/erp-vax-sync-guard.log 2>/dev/null || true
