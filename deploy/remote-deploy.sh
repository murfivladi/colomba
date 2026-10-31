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
set_kv COOKIE_PATH /
set_kv CORS_ORIGINS "${CORS_ORIGINS:-https://vladinc.ru,https://www.vladinc.ru}"
set_kv WEBAUTHN_RP_ID "${WEBAUTHN_RP_ID:-vladinc.ru}"
set_kv INVITE_ONLY "${INVITE_ONLY:-true}"
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

# ── запуск ──
log "docker compose up"
cd "$APP_DIR/app"
docker compose -p colomba up -d --build --remove-orphans
docker image prune -f >/dev/null || true

log "waiting for https://$DOMAIN:$API_PORT/api/health"
for i in $(seq 1 30); do
  if curl -fsS --resolve "$DOMAIN:$API_PORT:127.0.0.1" "https://$DOMAIN:$API_PORT/api/health" >/dev/null 2>&1; then
    log "backend is up"
    exit 0
  fi
  sleep 4
done
docker compose -p colomba logs --tail 80 api
echo "backend did not become healthy" >&2
exit 1
