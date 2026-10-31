#!/bin/bash
# Выгрузка фронта (PWA + PHP-прокси) на shared-хостинг по FTP — с VPS.
# Архив сборки кладёт GitHub Actions в $BUNDLE; доступ к FTP — из переменных окружения.
set -euo pipefail

BUNDLE=${BUNDLE:-/tmp/colomba-front/colomba-web.tar.gz}
APP_DIR=${APP_DIR:-/opt/colomba}
FTP_DIR=${FTP_DIR:-/colomba/}
PUBLIC_URL=${PUBLIC_URL:-https://vladinc.ru/colomba}
: "${FTP_HOST:?FTP_HOST is required}" "${FTP_USER:?FTP_USER is required}" "${FTP_PASS:?FTP_PASS is required}"

log() { echo "==> $*"; }

if ! command -v lftp >/dev/null; then
  log "installing lftp"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq lftp
fi

log "unpacking frontend"
SRC="$APP_DIR/web-release"
rm -rf "$SRC"
mkdir -p "$SRC"
tar -xzf "$BUNDLE" -C "$SRC"
rm -f "$BUNDLE"
chmod 600 "$SRC/api/config.php" 2>/dev/null || true
for f in index.html sw.js api/index.php api/config.php .htaccess; do
  [ -f "$SRC/$f" ] || { echo "missing $f in the bundle" >&2; exit 1; }
done

# хост может быть задан как ftp://host:port
HOST=${FTP_HOST#ftp://}; HOST=${HOST#ftps://}; HOST=${HOST%/}
PORT_ARG=()
[ -n "${FTP_PORT:-}" ] && PORT_ARG=(-p "$FTP_PORT")
REMOTE=${FTP_DIR%/}
[ -z "$REMOTE" ] && REMOTE=/

# Сначала ассеты, затем точки входа (index.html, sw.js, манифест, .htaccess) —
# чтобы ни один браузер не получил новую страницу раньше файлов, на которые она ссылается.
# Старые файлы с хешами не удаляются: у открытых вкладок со старым Service Worker они ещё нужны.
log "uploading to ftp://$HOST$REMOTE"
export LFTP_PASSWORD="$FTP_PASS"
lftp "${PORT_ARG[@]}" -u "$FTP_USER" --env-password "$HOST" <<LFTP
set cmd:fail-exit yes
set net:timeout 30
set net:max-retries 3
set net:reconnect-interval-base 5
set ftp:passive-mode yes
set ftp:ssl-allow yes
set ssl:verify-certificate no
mkdir -p -f $REMOTE
mirror -R --parallel=4 --no-perms --verbose=1 \
  --exclude '^index\.html$' --exclude '^sw\.js$' --exclude '^manifest\.webmanifest$' --exclude '^\.htaccess$' \
  "$SRC" "$REMOTE"
put -O "$REMOTE" "$SRC/manifest.webmanifest"
put -O "$REMOTE" "$SRC/sw.js"
put -O "$REMOTE" "$SRC/.htaccess"
put -O "$REMOTE" "$SRC/index.html"
bye
LFTP
unset LFTP_PASSWORD
log "upload done"

log "checking $PUBLIC_URL/api/health through the PHP proxy"
for i in $(seq 1 10); do
  if curl -fsS "$PUBLIC_URL/api/health" 2>/dev/null | grep -q '"ok":true'; then
    code=$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_URL/api/auth/config")
    log "proxy is up (auth/config: $code)"
    [ "$code" = "200" ] || { echo "proxy reaches backend, but API answered $code (PROXY_SECRET mismatch?)" >&2; exit 1; }
    exit 0
  fi
  sleep 6
done
echo "PHP proxy $PUBLIC_URL/api does not answer (PHP with the curl extension is required)" >&2
curl -sS -i "$PUBLIC_URL/api/health" | head -20 >&2 || true
exit 1
