/**
 * Импорт городов GeoNames (CC-BY 4.0) с названиями на русском и итальянском.
 *
 *   npm run import:geonames -- /path/to/cities15000.txt /path/to/alternateNamesV2.txt /path/to/countryInfo.txt
 *
 * Файлы: https://download.geonames.org/export/dump/ (cities15000.zip, alternateNamesV2.zip, countryInfo.txt).
 * Скрипт deploy/import-geonames.sh скачивает и распаковывает их сам.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { exec, pointWkt, closePool } from '../db.js';
import { SEED_CITY_ID_BASE } from '../seed/geo-data.js';

const [citiesFile, altFile, countryFile] = process.argv.slice(2);
if (!citiesFile) {
  console.error('usage: import-geonames <cities15000.txt> [alternateNamesV2.txt] [countryInfo.txt]');
  process.exit(1);
}

async function* lines(file: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const l of rl) if (l && !l.startsWith('#')) yield l.split('\t');
}

const cities = new Map<number, { name: string; cc: string; lat: number; lon: number; pop: number; ru?: string; it?: string; ruPref?: boolean; itPref?: boolean }>();
for await (const c of lines(citiesFile)) {
  cities.set(Number(c[0]), { name: c[1], lat: Number(c[4]), lon: Number(c[5]), cc: c[8], pop: Number(c[14]) || 0 });
}
console.log(`cities: ${cities.size}`);

if (altFile) {
  // alternateNameId, geonameid, isolanguage, name, isPreferred, isShort, isColloquial, isHistoric
  for await (const a of lines(altFile)) {
    const lang = a[2];
    if (lang !== 'ru' && lang !== 'it') continue;
    const c = cities.get(Number(a[1]));
    if (!c || a[6] === '1' || a[7] === '1') continue;
    const pref = a[4] === '1';
    if (lang === 'ru' && (!c.ru || (pref && !c.ruPref))) { c.ru = a[3]; c.ruPref = pref; }
    if (lang === 'it' && (!c.it || (pref && !c.itPref))) { c.it = a[3]; c.itPref = pref; }
  }
}

let n = 0;
for (const [id, c] of cities) {
  await exec(
    `INSERT INTO cities (id, name, name_ru, name_it, country, lon, lat, population, pt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?))
     ON DUPLICATE KEY UPDATE name = VALUES(name), name_ru = VALUES(name_ru), name_it = VALUES(name_it), population = VALUES(population)`,
    [id, c.name, c.ru ?? c.name, c.it ?? c.name, c.cc, c.lon, c.lat, c.pop, pointWkt(c.lon, c.lat)],
  );
  if (++n % 5000 === 0) console.log(`  ${n}`);
}
// стартовый набор больше не нужен
await exec('DELETE FROM cities WHERE id > ?', [SEED_CITY_ID_BASE]);

if (countryFile) {
  for await (const c of lines(countryFile)) {
    // названия стран — английские; русские и итальянские из стартового набора не перезаписываем
    await exec('INSERT IGNORE INTO countries (code, name_ru, name_it) VALUES (?, ?, ?)', [c[0], c[4], c[4]]);
  }
}
console.log('done');
await closePool();
