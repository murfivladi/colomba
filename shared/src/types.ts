/** [longitude, latitude] — порядок как в GeoJSON. */
export type LonLat = [number, number];

export type Lang = 'ru' | 'it';

export type CourierSection = 'birds' | 'animals' | 'history' | 'post';

/**
 * Как курьер ведёт себя ночью:
 *  - rest       — отдыхает с заката до рассвета;
 *  - night_only — летит только ночью, днём спит (сова);
 *  - always     — идёт круглосуточно;
 *  - sea_only   — над морем идёт круглосуточно, над сушей ночью отдыхает (альбатрос);
 *  - hours      — работает N часов в сутки вокруг местного полудня (машины «Почты»).
 */
export type NightMode = 'rest' | 'night_only' | 'always' | 'sea_only' | 'hours';

/**
 * Тип маршрута:
 *  - air      — птицы: дуга большого круга, облёт горных массивов;
 *  - air_sea  — альбатрос: предпочитает морской путь, иначе воздух;
 *  - air_direct — дирижабль: прямая дуга большого круга;
 *  - land     — дороги (OpenRouteService → GraphHopper → дуга ×1,3);
 *  - land_sea — черепаха: по суше, если можно, иначе по морю;
 *  - sea      — морские пути (searoute-ts);
 *  - post     — «Почта»: дороги или авиа в зависимости от тарифа.
 */
export type RouteKind = 'air' | 'air_sea' | 'air_direct' | 'land' | 'land_sea' | 'sea' | 'post';

export interface Capacity {
  /** Максимум знаков текста. */
  text: number;
  photos: number;
  drawings: number;
  /** Секунд голосовых сообщений суммарно. */
  voiceSec: number;
  /** Ограничение на общее число вложений (голубь: «1 фото или рисунок»). */
  maxAttachments?: number;
}

export type UnlockRule =
  | { kind: 'start' }
  | { kind: 'semi'; price: number }
  | { kind: 'quest'; quest: QuestCode }
  | { kind: 'season'; months: number[] };

export type QuestCode =
  | 'ocean_letter'
  | 'night_letter'
  | 'distance_5000'
  | 'letters_5'
  | 'long_correspondence';

export interface CourierTypeDef {
  code: string;
  section: CourierSection;
  /** Скорость, км/ч (для «Почты» — по тарифу). */
  speedKmh: number;
  /** Скорость в воде, км/ч (черепаха). */
  speedWaterKmh?: number;
  nightMode: NightMode;
  routeKind: RouteKind;
  capacity: Capacity;
  unlock: UnlockRule;
  /** Вид письма: ключ для иллюстрации и анимации вскрытия. */
  look: string;
  sound: string;
  /** Месяцы (1–12), когда курьер доступен; пусто — круглый год. */
  seasonMonths?: number[];
  /** Насколько непредсказуема скорость (бутылка) — доля разброса. */
  unpredictability?: number;
  /** Зависит ли скорость от ветра (парусник). */
  windDriven?: boolean;
  /** Курьер одноразовый — не возвращается домой (бутылка). */
  noReturn?: boolean;
  /** Порядок в каталоге. */
  sort: number;
  enabled: boolean;
}

export type PostTariffCode = 'economy' | 'standard' | 'express' | 'air';

export interface PostTariffDef {
  code: PostTariffCode;
  /** Скорость наземного транспорта, км/ч. */
  carKmh: number;
  /** Часов движения в сутки (24 — без остановок). */
  hoursPerDay: number;
  /** Скорость самолёта, км/ч (только Авиа). */
  planeKmh?: number;
  /** Задержка на сортировку, часы. */
  sortingHours: number;
  unlock: UnlockRule;
}

/** Точка временной шкалы полёта: [lon, lat, секунды от начала]. */
export type TimelinePoint = [number, number, number];

export type Surface = 'air' | 'land' | 'sea' | 'coast';

export interface TripEvent {
  /** Секунды от начала рейса. */
  t: number;
  type:
    | 'depart'
    | 'border'
    | 'mountains'
    | 'night_rest'
    | 'wake'
    | 'storm'
    | 'city'
    | 'sea_start'
    | 'arrive'
    | 'sorting'
    | 'lost';
  /** Параметры для текста уведомления: название города, страны, гор. */
  params?: Record<string, string>;
  pos?: LonLat;
}

export interface Postmark {
  t: number;
  cityId: number | null;
  nameRu: string;
  nameIt: string;
  country: string;
  pos: LonLat;
}

export interface TripPlan {
  distanceKm: number;
  durationSec: number;
  timeline: TimelinePoint[];
  events: TripEvent[];
  postmarks: Postmark[];
  routeSource: string;
  warnings: string[];
  lost: boolean;
}

export type LetterKind = 'letter' | 'postcard' | 'friend_request' | 'broadcast' | 'welcome';

export type LetterStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'in_transit'
  | 'delivered'
  | 'lost'
  | 'recalled';

export type CourierStatus = 'home' | 'outbound' | 'waiting' | 'returning';

export type LocationPrecision = 'city' | 'country' | 'distance';

export type WhoCanWrite = 'friends' | 'friends_penpals' | 'everyone';
