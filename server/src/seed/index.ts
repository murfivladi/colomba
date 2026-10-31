import { DEFAULT_COURIER_TYPES, DEFAULT_POST_TARIFFS, COURIER_NAMES } from '@colomba/shared';
import { exec, one, pointWkt } from '../db.js';
import { ensurePostmaster } from '../services/accounts.js';
import { SEED_CITIES, SEED_CITY_ID_BASE, SEED_COUNTRIES } from './geo-data.js';

export const SEED_ACHIEVEMENTS: [string, string, number, string | null, number, string, string, string, string][] = [
  // code, category, threshold, param, reward, name_ru, name_it, desc_ru, desc_it
  ['first_letter', 'letters_sent', 1, null, 5, 'Первое письмо', 'Prima lettera', 'Отправить первое письмо', 'Spedisci la prima lettera'],
  ['letters_10', 'letters_sent', 10, null, 10, 'Корреспондент', 'Corrispondente', 'Отправить 10 писем', 'Spedisci 10 lettere'],
  ['letters_100', 'letters_sent', 100, null, 30, 'Эпистолярный жанр', 'Epistolografo', 'Отправить 100 писем', 'Spedisci 100 lettere'],
  ['km_100', 'km', 100, null, 5, '100 километров', '100 chilometri', 'Письма прошли 100 км', 'Le tue lettere hanno percorso 100 km'],
  ['km_1000', 'km', 1000, null, 10, '1 000 километров', '1.000 chilometri', 'Письма прошли 1 000 км', 'Le tue lettere hanno percorso 1.000 km'],
  ['km_10000', 'km', 10000, null, 25, '10 000 километров', '10.000 chilometri', 'Письма прошли 10 000 км', 'Le tue lettere hanno percorso 10.000 km'],
  ['km_40075', 'km', 40075, null, 50, 'Вокруг света', 'Il giro del mondo', 'Письма прошли длину экватора — 40 075 км', "Le tue lettere hanno percorso l'equatore: 40.075 km"],
  ['countries_3', 'countries', 3, null, 5, 'Три страны', 'Tre paesi', '3 страны в альбоме', '3 paesi nell’album'],
  ['countries_10', 'countries', 10, null, 15, 'Путешественник', 'Viaggiatore', '10 стран в альбоме', '10 paesi nell’album'],
  ['countries_25', 'countries', 25, null, 40, 'Глобус', 'Mappamondo', '25 стран в альбоме', '25 paesi nell’album'],
  ['couriers_5', 'couriers', 5, null, 10, 'Голубятня', 'Piccionaia', 'Собрать 5 разных курьеров', 'Colleziona 5 corrieri diversi'],
  ['couriers_10', 'couriers', 10, null, 30, 'Почтовая станция', 'Stazione postale', 'Собрать 10 разных курьеров', 'Colleziona 10 corrieri diversi'],
  ['variety_5', 'courier_variety', 5, null, 10, 'Разные крылья', 'Ali diverse', 'Отправить письма пятью разными курьерами', 'Spedisci lettere con cinque corrieri diversi'],
  ['variety_all', 'courier_variety', 13, null, 50, 'Всеми курьерами', 'Con ogni corriere', 'Отправить письмо каждым курьером каталога', 'Spedisci una lettera con ogni corriere del catalogo'],
  ['correspondence_10', 'correspondence', 10, null, 10, 'Долгая переписка', 'Lunga corrispondenza', '10 писем с одним человеком', '10 lettere con la stessa persona'],
  ['correspondence_50', 'correspondence', 50, null, 40, 'Друзья по перу', 'Amici di penna', '50 писем с одним человеком', '50 lettere con la stessa persona'],
  ['night_1', 'night_letters', 1, null, 5, 'Полуночник', 'Nottambulo', 'Отправить письмо ночью', 'Spedisci una lettera di notte'],
  ['night_10', 'night_letters', 10, null, 15, 'Совиная почта', 'Posta dei gufi', '10 писем ночью', '10 lettere di notte'],
  ['ocean_1', 'ocean', 1, null, 20, 'Через океан', 'Oltre l’oceano', 'Письмо через океан', 'Una lettera oltre l’oceano'],
  ['bottle_caught', 'bottle_caught', 1, null, 10, 'Улов', 'Bel pescato', 'Выловить бутылку с запиской', 'Ripesca un messaggio in bottiglia'],
  ['postmarks_50', 'postmarks', 50, null, 15, 'Филателист', 'Filatelico', 'Собрать 50 штемпелей', 'Raccogli 50 timbri postali'],
];

const ITEMS: [string, string, number, number, string | null, string, string, object | null, number][] = [
  // code, kind, price, free, event, name_ru, name_it, data, sort
  ['paper_cream', 'paper', 0, 1, null, 'Кремовая', 'Crema', { bg: '#f6ecd6', line: null }, 1],
  ['paper_lined', 'paper', 0, 1, null, 'В линейку', 'A righe', { bg: '#f8f1e0', line: '#c9b99a' }, 2],
  ['paper_parchment', 'paper', 0, 1, null, 'Пергамент', 'Pergamena', { bg: '#ead9b5', line: null }, 3],
  ['paper_kraft', 'paper', 10, 0, null, 'Крафт', 'Carta kraft', { bg: '#cfae84', line: null }, 4],
  ['paper_rose', 'paper', 10, 0, null, 'Розовая', 'Rosa', { bg: '#f3dcd4', line: null }, 5],
  ['paper_sky', 'paper', 10, 0, null, 'Небесная', 'Celeste', { bg: '#dfe8ec', line: '#aebfca' }, 6],
  ['paper_map', 'paper', 25, 0, null, 'Старая карта', 'Mappa antica', { bg: '#e7d7af', pattern: 'map' }, 7],
  ['envelope_plain', 'envelope', 0, 1, null, 'Простой', 'Semplice', { color: '#efe2c4' }, 1],
  ['envelope_kraft', 'envelope', 5, 0, null, 'Крафтовый', 'Kraft', { color: '#c8a073' }, 2],
  ['envelope_airmail', 'envelope', 15, 0, null, 'Авиаконверт', 'Busta via aerea', { color: '#f4efe4', border: 'airmail' }, 3],
  ['envelope_wax', 'envelope', 10, 0, null, 'С сургучом', 'Con ceralacca', { color: '#eadbbd', seal: '#8c2a1d' }, 4],
  ['stamp_colomba', 'stamp', 0, 1, null, 'Голубка', 'Colomba', { svg: 'dove', color: '#8c2a1d' }, 1],
  ['stamp_postmaster', 'stamp', 5, 0, null, 'Почтмейстер', 'Mastro postino', { svg: 'postmaster', color: '#2e4a62' }, 2],
  ['stamp_owl', 'stamp', 5, 0, null, 'Сова', 'Gufo', { svg: 'owl', color: '#4b3b2a' }, 3],
  ['stamp_ship', 'stamp', 8, 0, null, 'Парусник', 'Veliero', { svg: 'ship', color: '#24566e' }, 4],
  ['stamp_newyear', 'stamp', 5, 0, 'newyear', 'Новый год', 'Capodanno', { svg: 'fir', color: '#1f5a3a' }, 10],
  ['stamp_christmas', 'stamp', 5, 0, 'christmas', 'Рождество', 'Natale', { svg: 'star', color: '#8c2a1d' }, 11],
  ['stamp_march8', 'stamp', 5, 0, 'march8', '8 Марта', 'Festa della donna', { svg: 'mimosa', color: '#c49a1a' }, 12],
  ['stamp_ferragosto', 'stamp', 5, 0, 'ferragosto', 'Феррагосто', 'Ferragosto', { svg: 'sun', color: '#c4651a' }, 13],
  ['stamp_valentine', 'stamp', 5, 0, 'valentine', 'День влюблённых', 'San Valentino', { svg: 'heart', color: '#a8324a' }, 14],
  ['sticker_heart', 'sticker', 0, 1, null, 'Сердце', 'Cuore', { emoji: '❤' }, 1],
  ['sticker_leaf', 'sticker', 0, 1, null, 'Лист', 'Foglia', { emoji: '🍃' }, 2],
  ['sticker_star', 'sticker', 3, 0, null, 'Звезда', 'Stella', { emoji: '★' }, 3],
  ['sticker_flower', 'sticker', 3, 0, null, 'Цветок', 'Fiore', { emoji: '✿' }, 4],
  ['sticker_sun', 'sticker', 3, 0, null, 'Солнце', 'Sole', { emoji: '☀' }, 5],
  ['sticker_moon', 'sticker', 3, 0, null, 'Луна', 'Luna', { emoji: '☾' }, 6],
  ['tariff_standard', 'tariff', 20, 0, null, 'Почта: Стандарт', 'Posta: Standard', { tariff: 'standard' }, 1],
  ['tariff_express', 'tariff', 40, 0, null, 'Почта: Экспресс', 'Posta: Espresso', { tariff: 'express' }, 2],
  ['tariff_air', 'tariff', 60, 0, null, 'Почта: Авиа', 'Posta: Aerea', { tariff: 'air' }, 3],
];

const EVENTS: [string, string, string, string, string, string, object | null][] = [
  ['newyear', 'holiday', 'Новый год', 'Capodanno', '12-25', '01-10', null],
  ['christmas', 'holiday', 'Рождество', 'Natale', '12-18', '01-08', null],
  ['valentine', 'holiday', 'День святого Валентина', 'San Valentino', '02-07', '02-15', null],
  ['march8', 'holiday', '8 Марта', 'Festa della donna', '03-01', '03-09', null],
  ['ferragosto', 'holiday', 'Феррагосто', 'Ferragosto', '08-08', '08-20', null],
  ['winter', 'season', 'Зима: северные олени', 'Inverno: le renne', '12-01', '02-29', { courier: 'reindeer' }],
  ['spring', 'season', 'Весна: аист', 'Primavera: la cicogna', '03-01', '05-31', { courier: 'stork' }],
  ['migration_spring', 'migration', 'Весенняя миграция', 'Migrazione primaverile', '03-01', '05-31', { bonus: 0.1, direction: 'north' }],
  ['migration_autumn', 'migration', 'Осенняя миграция', 'Migrazione autunnale', '09-01', '11-30', { bonus: 0.1, direction: 'south' }],
];

const INTERESTS: [string, string, string][] = [
  ['travel', 'Путешествия', 'Viaggi'], ['books', 'Книги', 'Libri'], ['music', 'Музыка', 'Musica'], ['cinema', 'Кино', 'Cinema'],
  ['art', 'Искусство', 'Arte'], ['photo', 'Фотография', 'Fotografia'], ['cooking', 'Кулинария', 'Cucina'], ['sport', 'Спорт', 'Sport'],
  ['nature', 'Природа', 'Natura'], ['languages', 'Языки', 'Lingue'], ['history', 'История', 'Storia'], ['science', 'Наука', 'Scienza'],
  ['games', 'Игры', 'Giochi'], ['animals', 'Животные', 'Animali'], ['garden', 'Сад и огород', 'Giardinaggio'], ['crafts', 'Рукоделие', 'Artigianato'],
  ['poetry', 'Поэзия', 'Poesia'], ['tech', 'Технологии', 'Tecnologia'], ['stamps', 'Марки и открытки', 'Francobolli e cartoline'], ['sea', 'Море', 'Mare'],
];

export async function seed(log: (m: string) => void = console.log): Promise<void> {
  for (const c of DEFAULT_COURIER_TYPES) {
    await exec(
      `INSERT IGNORE INTO courier_types (code, section, speed_kmh, speed_water_kmh, night_mode, route_kind, capacity, unlock_rule,
        look, sound, season_months, unpredictability, wind_driven, no_return, name_ru, name_it, sort, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.code, c.section, c.speedKmh, c.speedWaterKmh ?? null, c.nightMode, c.routeKind, JSON.stringify(c.capacity),
        JSON.stringify(c.unlock), c.look, c.sound, c.seasonMonths ? JSON.stringify(c.seasonMonths) : null,
        c.unpredictability ?? null, c.windDriven ? 1 : 0, c.noReturn ? 1 : 0,
        COURIER_NAMES[c.code]?.ru ?? null, COURIER_NAMES[c.code]?.it ?? null, c.sort, c.enabled ? 1 : 0],
    );
  }
  for (const t of DEFAULT_POST_TARIFFS) {
    await exec(
      `INSERT IGNORE INTO post_tariffs (code, car_kmh, hours_per_day, plane_kmh, sorting_hours, unlock_rule) VALUES (?, ?, ?, ?, ?, ?)`,
      [t.code, t.carKmh, t.hoursPerDay, t.planeKmh ?? null, t.sortingHours, JSON.stringify(t.unlock)],
    );
  }
  for (const a of SEED_ACHIEVEMENTS) {
    await exec(
      `INSERT IGNORE INTO achievements (code, category, threshold, param, reward, name_ru, name_it, desc_ru, desc_it, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...a, SEED_ACHIEVEMENTS.indexOf(a)],
    );
  }
  for (const i of ITEMS) {
    await exec(
      `INSERT IGNORE INTO items (code, kind, price, free, event_code, name_ru, name_it, data, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i[0], i[1], i[2], i[3], i[4], i[5], i[6], i[7] ? JSON.stringify(i[7]) : null, i[8]],
    );
  }
  for (const e of EVENTS) {
    await exec(
      `INSERT IGNORE INTO events (code, kind, name_ru, name_it, start_md, end_md, params) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [e[0], e[1], e[2], e[3], e[4], e[5], e[6] ? JSON.stringify(e[6]) : null],
    );
  }
  for (const i of INTERESTS) await exec('INSERT IGNORE INTO interests (code, name_ru, name_it) VALUES (?, ?, ?)', i);
  for (const c of SEED_COUNTRIES) await exec('INSERT IGNORE INTO countries (code, name_ru, name_it) VALUES (?, ?, ?)', c);

  // стартовые города — только если полная база GeoNames ещё не загружена
  const real = await one<{ n: number }>('SELECT COUNT(*) AS n FROM cities WHERE id < ?', [SEED_CITY_ID_BASE]);
  if (!real || Number(real.n) === 0) {
    let id = SEED_CITY_ID_BASE;
    for (const [name, ru, it, cc, lat, lon, pop] of SEED_CITIES) {
      id++;
      await exec(
        `INSERT IGNORE INTO cities (id, name, name_ru, name_it, country, lon, lat, population, pt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?))`,
        [id, name, ru, it, cc, lon, lat, pop, pointWkt(lon, lat)],
      );
    }
  }
  await ensurePostmaster();
  log('seed: done');
}
