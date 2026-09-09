#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/erp-vax-notification"
SERVICE_SRC="$APP_DIR/deploy/erp-vax-svp-invoice.service"
NGINX_SNIPPET_SRC="$APP_DIR/deploy/nginx-svp-invoice.conf"
SERVICE_DST="/etc/systemd/system/erp-vax-svp-invoice.service"

if [[ $EUID -ne 0 ]]; then
  echo "Jalankan sebagai root." >&2
  exit 1
fi

for f in "$APP_DIR/svp-invoice-api.js" "$APP_DIR/.env" "$SERVICE_SRC" "$NGINX_SNIPPET_SRC"; do
  [[ -f "$f" ]] || { echo "File wajib belum ada: $f" >&2; exit 1; }
done

install -m 0644 "$SERVICE_SRC" "$SERVICE_DST"
systemctl daemon-reload
systemctl enable --now erp-vax-svp-invoice.service

SITE_FILE="$(grep -RIlE 'server_name[[:space:]]+[^;]*erp-test\.vaxwijaya\.com' /etc/nginx/sites-enabled /etc/nginx/sites-available 2>/dev/null | head -n1 || true)"
if [[ -z "$SITE_FILE" ]]; then
  echo "Service API aktif, tetapi site Nginx erp-test.vaxwijaya.com tidak ditemukan otomatis." >&2
  echo "Tambahkan isi $NGINX_SNIPPET_SRC ke server block ERP lalu nginx -t && systemctl reload nginx." >&2
  exit 2
fi

if grep -q 'location = /api/svp-invoice/send' "$SITE_FILE"; then
  echo "Nginx route SVP invoice sudah ada: $SITE_FILE"
else
  BACKUP="${SITE_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
  cp -a "$SITE_FILE" "$BACKUP"
  python3 - "$SITE_FILE" "$NGINX_SNIPPET_SRC" <<'PY'
import re
import sys
from pathlib import Path

site = Path(sys.argv[1])
snippet = Path(sys.argv[2]).read_text().strip() + "\n"
text = site.read_text()
domain = 'erp-test.vaxwijaya.com'

starts = [m.start() for m in re.finditer(r'(?m)^[ \t]*server[ \t]*\{', text)]
if not starts:
    raise SystemExit('server block Nginx tidak ditemukan')

def block_end(start):
    brace = text.find('{', start)
    if brace < 0:
        return None
    depth = 0
    for i in range(brace, len(text)):
        ch = text[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
    return None

target = None
for start in starts:
    end = block_end(start)
    if end is None:
        continue
    block = text[start:end+1]
    if re.search(r'(?m)^\s*server_name\s+[^;]*\b' + re.escape(domain) + r'\b[^;]*;', block):
        target = (start, end)
        break

if target is None:
    raise SystemExit('server block erp-test.vaxwijaya.com tidak ditemukan')

_, end = target
indent = '    '
insert = '\n' + '\n'.join(indent + line if line else '' for line in snippet.splitlines()) + '\n'
site.write_text(text[:end] + insert + text[end:])
PY
  nginx -t
  systemctl reload nginx
  echo "Nginx route ditambahkan ke $SITE_FILE (backup: $BACKUP)"
fi

curl -fsS http://127.0.0.1:8791/health
echo
curl -fsS https://erp-test.vaxwijaya.com/api/svp-invoice/health
echo
systemctl --no-pager --full status erp-vax-svp-invoice.service | sed -n '1,12p'
echo "SVP Invoice API deploy PASS"
