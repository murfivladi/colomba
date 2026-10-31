#!/bin/bash
# Деплой бэкенда на VPS (запускается GitHub Actions по SSH от root).
# Ожидает архив кода в $BUNDLE и переменные окружения из workflow.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/colomba}
BUNDLE=${BUNDLE:-/tmp/colomba-deploy.tar.gz}
DOMAIN=${DOMAIN:-colomba-api.vladinc.ru}
API_PORT=${API_PORT:-5576}
export DOMAIN

log() { echo "==> $*"; }

# nginx нужен другим проектам: что бы ни случилось, вернуть его в прежнее состояние
NGINX_WAS_ACTIVE=0
systemctl is-active --quiet nginx 2>/dev/null && NGINX_WAS_ACTIVE=1
restore_nginx() {
  if [ "$NGINX_WAS_ACTIVE" = 1 ] && ! systemctl is-active --quiet nginx; then
    log "restoring nginx"
    systemctl start nginx || true
  fi
}
trap restore_nginx EXIT

# ── зависимости ──
if ! command -v docker >/dev/null; then
  log "installing docker"
  curl -fsSL https://get.docker.com | sh
fi
if ! command -v certbot >/dev/null; then
  log "installing certbot"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq certbot
fi

# ── код ──
log "unpacking release"
mkdir -p "$APP_DIR/bin" "$APP_DIR/certs"
rm -rf "$APP_DIR/app.new"
mkdir -p "$APP_DIR/app.new"
tar -xzf "$BUNDLE" -C "$APP_DIR/app.new"
rm -rf "$APP_DIR/app"
mv "$APP_DIR/app.new" "$APP_DIR/app"
ln -sfn "$APP_DIR/.env" "$APP_DIR/app/.env"
ln -sfn "$APP_DIR/certs" "$APP_DIR/app/certs"
install -m 755 "$APP_DIR/app/deploy/certbot-pre.sh" "$APP_DIR/bin/certbot-pre.sh"
install -m 755 "$APP_DIR/app/deploy/certbot-post.sh" "$APP_DIR/bin/certbot-post.sh"
install -m 755 "$APP_DIR/app/deploy/certbot-deploy.sh" "$APP_DIR/bin/certbot-deploy.sh"
rm -f "$BUNDLE"

# ── .env: пароли базы генерируются один раз, остальное — из секретов GitHub ──
ENV="$APP_DIR/.env"
if [ ! -f "$ENV" ]; then
  log "creating .env"
  umask 077
  cat > "$ENV" <<EOF
DB_NAME=colomba
DB_USER=colomba
DB_PASSWORD=$(openssl rand -hex 24)
DB_ROOT_PASSWORD=$(openssl rand -hex 24)
EOF
fi
chmod 600 "$ENV"
set_kv() {
  local k=$1 v=$2
  grep -v "^${k}=" "$ENV" > "$ENV.tmp" || true
  printf '%s=%s\n' "$k" "$v" >> "$ENV.tmp"
  mv "$ENV.tmp" "$ENV"
  chmod 600 "$ENV"
}
set_kv PUBLIC_URL "${PUBLIC_URL:-https://vladinc.ru/colomba}"
set_kv API_PREFIX /api
set_kv COOKIE_SECURE true
set_kv COOKIE_PATH /colomba
set_kv CORS_ORIGINS "${CORS_ORIGINS:-https://vladinc.ru,https://www.vladinc.ru}"
set_kv WEBAUTHN_RP_ID "${WEBAUTHN_RP_ID:-vladinc.ru}"
set_kv INVITE_ONLY "${INVITE_ONLY:-true}"
# общий секрет с PHP-прокси на хостинге: без него бэкенд отвечает 403 (кроме /api/health)
[ -n "${PROXY_SECRET:-}" ] && set_kv PROXY_SECRET "$PROXY_SECRET"
set_kv DEV_LOG_CODES false
set_kv WEATHER_ENABLED true
# необязательные секреты: пишем, только если заданы
[ -n "${ORS_API_KEY:-}" ] && set_kv ORS_API_KEY "$ORS_API_KEY"
[ -n "${GRAPHHOPPER_API_KEY:-}" ] && set_kv GRAPHHOPPER_API_KEY "$GRAPHHOPPER_API_KEY"
[ -n "${SMTP_URL:-}" ] && set_kv SMTP_URL "$SMTP_URL"
[ -n "${MAIL_FROM:-}" ] && set_kv MAIL_FROM "$MAIL_FROM"
[ -n "${ADMIN_EMAILS:-}" ] && set_kv ADMIN_EMAILS "$ADMIN_EMAILS"
true

# ── порты ──
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow "$API_PORT"/tcp >/dev/null
fi

# ── сертификат: certbot standalone, nginx на время выдачи останавливается хуками ──
# Хуки сохраняются в /etc/letsencrypt/renewal/$DOMAIN.conf и работают и при автопродлении.
log "certificate for $DOMAIN"
EMAIL_ARGS="--register-unsafely-without-email"
[ -n "${CERTBOT_EMAIL:-}" ] && EMAIL_ARGS="-m $CERTBOT_EMAIL"
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos $EMAIL_ARGS \
  --keep-until-expiring \
  --pre-hook "$APP_DIR/bin/certbot-pre.sh" \
  --post-hook "$APP_DIR/bin/certbot-post.sh" \
  --deploy-hook "$APP_DIR/bin/certbot-deploy.sh"
# если сертификат уже был, хуки могли не запуститься — копируем его бэкенду в любом случае
DOMAIN=$DOMAIN "$APP_DIR/bin/certbot-deploy.sh" norestart
restore_nginx

# ── nginx на 443 для API ──
# Shared-хостинги часто выпускают наружу только порты 80/443, и PHP-прокси не достучится до :5576.
# Поэтому colomba-api.vladinc.ru:443 отдаём через nginx (он уже держит 443 для других проектов):
# отдельный файл, проверка nginx -t, мягкий reload; при любой ошибке файл убирается.
setup_nginx_vhost() {
  command -v nginx >/dev/null || { log "nginx not installed — API only on :$API_PORT"; return 0; }
  local dir=/etc/nginx/conf.d
  [ -d "$dir" ] || { log "no $dir — skipping nginx vhost"; return 0; }
  local conf="$dir/colomba-api.conf" new
  new=$(mktemp)
  cat > "$new" <<NGX
# Colomba API (создаётся деплоем Colomba; другие проекты не затрагивает)
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    client_max_body_size 12m;

    location / {
        proxy_pass https://127.0.0.1:$API_PORT;
        proxy_ssl_server_name on;
        proxy_ssl_name $DOMAIN;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        # поток уведомлений (SSE) — без буферизации и с долгим таймаутом
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGX
  if [ -f "$conf" ] && cmp -s "$new" "$conf"; then rm -f "$new"; log "nginx vhost unchanged"; return 0; fi
  local backup=""
  [ -f "$conf" ] && { backup=$(mktemp); cp "$conf" "$backup"; }
  install -m 644 "$new" "$conf"; rm -f "$new"
  if nginx -t >/tmp/colomba-nginx-test.log 2>&1; then
    if ! nginx -T 2>/dev/null | grep -q "server_name $DOMAIN;"; then
      log "WARNING: nginx.conf does not include $dir — vhost not active"
    fi
    if systemctl is-active --quiet nginx 2>/dev/null; then systemctl reload nginx && log "nginx reloaded with $conf"; fi
    rm -f "$backup"
  else
    log "WARNING: nginx -t failed, rolling back the Colomba vhost:"
    cat /tmp/colomba-nginx-test.log
    if [ -n "$backup" ]; then mv "$backup" "$conf"; else rm -f "$conf"; fi
  fi
}
setup_nginx_vhost || true

# ── запуск ──
log "docker compose up"
cd "$APP_DIR/app"
docker compose -p colomba up -d --build --remove-orphans
docker image prune -f >/dev/null || true

log "waiting for https://$DOMAIN:$API_PORT/api/health"
for i in $(seq 1 30); do
  if curl -fsS --resolve "$DOMAIN:$API_PORT:127.0.0.1" "https://$DOMAIN:$API_PORT/api/health" >/dev/null 2>&1; then
    log "backend is up"
    if curl -fsS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" >/dev/null 2>&1; then
      log "also via nginx: https://$DOMAIN/api/health"
    else
      log "WARNING: https://$DOMAIN (443 via nginx) does not answer — the PHP proxy will try :$API_PORT"
    fi
    exit 0
  fi
  sleep 4
done
docker compose -p colomba logs --tail 80 api
echo "backend did not become healthy" >&2
exit 1
