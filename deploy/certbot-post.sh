#!/bin/sh
# Хук certbot после попытки (успешной или нет): поднимаем nginx обратно, если он работал.
STATE=/opt/colomba/.nginx-was-active
if [ -f "$STATE" ]; then
  systemctl start nginx && echo "certbot-post: nginx started"
  rm -f "$STATE"
fi
