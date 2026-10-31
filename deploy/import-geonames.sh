#!/bin/sh
# Загрузка городов GeoNames (CC-BY 4.0) с названиями RU/IT для штемпелей.
# Запуск на VPS: docker compose exec api sh /app/deploy/import-geonames.sh  (или локально с npm)
set -e
DIR=${1:-/tmp/geonames}
mkdir -p "$DIR" && cd "$DIR"
wget -q -N https://download.geonames.org/export/dump/cities15000.zip
wget -q -N https://download.geonames.org/export/dump/alternateNamesV2.zip
wget -q -N https://download.geonames.org/export/dump/countryInfo.txt
unzip -o -q cities15000.zip
unzip -o -q alternateNamesV2.zip alternateNamesV2.txt
cd - >/dev/null
npm run import:geonames -w server -- "$DIR/cities15000.txt" "$DIR/alternateNamesV2.txt" "$DIR/countryInfo.txt"
