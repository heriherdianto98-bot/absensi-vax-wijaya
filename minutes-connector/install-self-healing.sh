#!/usr/bin/env bash
set -euo pipefail

BASE="/var/www/absensi-vax-wijaya/minutes-connector"

chmod +x "$BASE/vps-sync-guard.sh"

cp "$BASE/systemd/erp-vax-minutes-sync.service" /etc/systemd/system/
cp "$BASE/systemd/erp-vax-sync-guard.service" /etc/systemd/system/
cp "$BASE/systemd/erp-vax-sync-guard.timer" /etc/systemd/system/

# Bersihkan scheduler manual/nohup lama agar hanya systemd yang menjadi owner proses.
pkill -f 'node .*minutes-connector/scheduler.js' 2>/dev/null || true
pkill -f '/minutes-connector/sync.js' 2>/dev/null || true
pkill -f '/minutes-connector/provider-sales-sync.js' 2>/dev/null || true
sleep 2

systemctl daemon-reload
systemctl enable --now erp-vax-minutes-sync.service
systemctl enable --now erp-vax-sync-guard.timer

sleep 3

echo '=== ERP VAX SELF-HEALING STATUS ==='
systemctl --no-pager --full status erp-vax-minutes-sync.service | sed -n '1,12p'
systemctl --no-pager --full status erp-vax-sync-guard.timer | sed -n '1,12p'
echo '=== PROCESS ==='
pgrep -af 'scheduler.js|sync.js|provider-sales-sync.js' || true
echo '=== GUARD LOG ==='
tail -n 10 /var/log/erp-vax-sync-guard.log 2>/dev/null || true
