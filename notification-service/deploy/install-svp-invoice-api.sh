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

# Prioritaskan site aktif canonical dan JANGAN pernah memilih file .bak.
SITE_FILE=""
if [[ -f /etc/nginx/sites-enabled/erp-vax-test ]] && grep -qE 'server_name[[:space:]]+[^;]*erp-test\.vaxwijaya\.com' /etc/nginx/sites-enabled/erp-vax-test; then
  SITE_FILE="/etc/nginx/sites-enabled/erp-vax-test"
else
  SITE_FILE="$(find /etc/nginx/sites-enabled /etc/nginx/sites-available -maxdepth 1 -type f ! -name '*.bak*' -print0 2>/dev/null | xargs -0 -r grep -IlE 'server_name[[:space:]]+[^;]*erp-test\.vaxwijaya\.com' | head -n1 || true)"
fi

if [[ -z "$SITE_FILE" ]]; then
  echo "Service API aktif, tetapi site Nginx erp-test.vaxwijaya.com tidak ditemukan otomatis." >&2
  echo "Tambahkan isi $NGINX_SNIPPET_SRC ke server block ERP lalu nginx -t && systemctl reload nginx." >&2
  exit 2
fi

# Backup WAJIB di luar sites-enabled supaya tidak ikut di-include Nginx.
BACKUP_DIR="/etc/nginx/erp-vax-backups"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/$(basename "$SITE_FILE").bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$SITE_FILE" "$BACKUP"

# Idempotent: hapus route invoice lama dari server block target lalu pasang snippet terbaru.
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

def block_end(src, start):
    brace = src.find('{', start)
    if brace < 0:
        return None
    depth = 0
    for i in range(brace, len(src)):
        ch = src[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
    return None

target = None
for start in starts:
    end = block_end(text, start)
    if end is None:
        continue
    block = text[start:end+1]
    if re.search(r'(?m)^\s*server_name\s+[^;]*\b' + re.escape(domain) + r'\b[^;]*;', block):
        target = (start, end)
        break

if target is None:
    raise SystemExit('server block erp-test.vaxwijaya.com tidak ditemukan')

start, end = target
block = text[start:end+1]

def remove_location(src, path):
    pat = re.compile(r'(?m)^\s*location\s*=\s*' + re.escape(path) + r'\s*\{')
    while True:
        m = pat.search(src)
        if not m:
            return src
        brace = src.find('{', m.start())
        depth = 0
        close = None
        for i in range(brace, len(src)):
            if src[i] == '{':
                depth += 1
            elif src[i] == '}':
                depth -= 1
                if depth == 0:
                    close = i
                    break
        if close is None:
            raise SystemExit(f'location {path} tidak tertutup')
        j = close + 1
        while j < len(src) and src[j] in ' \t':
            j += 1
        if j < len(src) and src[j] == '\n':
            j += 1
        src = src[:m.start()] + src[j:]

block = remove_location(block, '/api/svp-invoice/send')
block = remove_location(block, '/api/svp-invoice/health')

last = block.rfind('}')
indent = '    '
insert = '\n' + '\n'.join(indent + line if line else '' for line in snippet.splitlines()) + '\n'
block = block[:last] + insert + block[last:]
site.write_text(text[:start] + block + text[end+1:])
PY

nginx -t
systemctl reload nginx
echo "Nginx route SVP invoice diperbarui di $SITE_FILE (backup: $BACKUP)"

curl -fsS http://127.0.0.1:8791/health
echo
curl -fsS https://erp-test.vaxwijaya.com/api/svp-invoice/health
echo
systemctl --no-pager --full status erp-vax-svp-invoice.service | sed -n '1,12p'
echo "SVP Invoice API deploy PASS"
