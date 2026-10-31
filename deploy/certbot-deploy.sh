#!/bin/sh
# Хук certbot после успешного выпуска: сертификат — бэкенду (контейнер работает от uid 1000),
# затем перезапуск, чтобы он подхватил новый ключ. Без аргумента restart — только копирование.
set -e
DOMAIN=${DOMAIN:-colomba-api.vladinc.ru}
# при продлении certbot сам передаёт путь к сертификату в RENEWED_LINEAGE
LIVE=${RENEWED_LINEAGE:-/etc/letsencrypt/live/$DOMAIN}
DEST=/opt/colomba/certs
mkdir -p "$DEST"
cp -L "$LIVE/fullchain.pem" "$DEST/fullchain.pem"
cp -L "$LIVE/privkey.pem" "$DEST/privkey.pem"
chown -R 1000:1000 "$DEST"
chmod 700 "$DEST"
chmod 600 "$DEST"/*.pem
if [ "${1:-restart}" = "restart" ] && docker ps --format '{{.Names}}' | grep -qx colomba-api; then
  docker restart colomba-api >/dev/null && echo "certbot-deploy: colomba-api restarted"
fi
