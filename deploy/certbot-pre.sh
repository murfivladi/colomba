#!/bin/sh
# Хук certbot перед выпуском/продлением: освобождаем порт 80 — останавливаем nginx,
# запомнив, работал ли он (он нужен другим проектам и должен вернуться в то же состояние).
STATE=/opt/colomba/.nginx-was-active
rm -f "$STATE"
if systemctl is-active --quiet nginx 2>/dev/null; then
  touch "$STATE"
  systemctl stop nginx
  echo "certbot-pre: nginx stopped"
fi
