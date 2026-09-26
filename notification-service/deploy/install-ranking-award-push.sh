#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ERP_VAX_NOTIFICATION_DIR:-/opt/erp-vax-notification}"
ENV_FILE="$APP_DIR/.env"
SERVICE_SRC="$APP_DIR/deploy/erp-vax-ranking-award-api.service"
OVERRIDE_SRC="$APP_DIR/deploy/erp-vax-setoran-closing-email-ranking-award.override.conf"

cd "$APP_DIR"
npm install --omit=dev

if ! grep -q '^VAPID_PUBLIC_KEY=' "$ENV_FILE" || ! grep -q '^VAPID_PRIVATE_KEY=' "$ENV_FILE"; then
  read -r PUB PRIV < <(node --input-type=module -e "import webpush from 'web-push';const k=webpush.generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")
  {
    echo
    echo "# Ranking 1 Semua Cabang Web Push"
    echo "VAPID_PUBLIC_KEY=$PUB"
    echo "VAPID_PRIVATE_KEY=$PRIV"
    echo "VAPID_SUBJECT=mailto:notification@vaxwijaya.com"
    echo "RANKING_AWARD_API_PORT=8796"
    echo "ERP_BASE_URL=https://erp.vaxwijaya.com"
  } >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

install -m 0644 "$SERVICE_SRC" /etc/systemd/system/erp-vax-ranking-award-api.service
mkdir -p /etc/systemd/system/erp-vax-setoran-closing-email.service.d
install -m 0644 "$OVERRIDE_SRC" /etc/systemd/system/erp-vax-setoran-closing-email.service.d/ranking-award.conf

systemctl daemon-reload
systemctl enable --now erp-vax-ranking-award-api.service
systemctl restart erp-vax-setoran-closing-email.timer

echo "Ranking Award API:"
curl -fsS http://127.0.0.1:8796/health
echo
echo "Closing timer remains unchanged; service now runs closing email + Ranking Award push."
systemctl cat erp-vax-setoran-closing-email.service
systemctl list-timers --all --no-pager | grep erp-vax-setoran-closing-email || true
