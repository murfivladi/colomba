import type { Capacity, CourierTypeDef, PostTariffDef } from './types.js';

/**
 * Стартовый каталог курьеров (раздел «Курьеры» ТЗ).
 * Все значения — стартовые, в работе правятся в админ-панели (таблица courier_types).
 */
export const DEFAULT_COURIER_TYPES: CourierTypeDef[] = [
  // ── Птицы ────────────────────────────────────────────────
  {
    code: 'pigeon', section: 'birds', speedKmh: 80, nightMode: 'rest', routeKind: 'air',
    capacity: { text: 500, photos: 1, drawings: 1, voiceSec: 0, maxAttachments: 1 },
    unlock: { kind: 'start' }, look: 'scroll_leg', sound: 'wings', sort: 10, enabled: true,
  },
  {
    code: 'falcon', section: 'birds', speedKmh: 100, nightMode: 'rest', routeKind: 'air',
    capacity: { text: 140, photos: 0, drawings: 0, voiceSec: 0 },
    unlock: { kind: 'semi', price: 40 }, look: 'tiny_scroll', sound: 'falcon', sort: 20, enabled: true,
  },
  {
    code: 'albatross', section: 'birds', speedKmh: 65, nightMode: 'sea_only', routeKind: 'air_sea',
    capacity: { text: 1000, photos: 1, drawings: 0, voiceSec: 0 },
    unlock: { kind: 'quest', quest: 'ocean_letter' }, look: 'scroll_case', sound: 'seabird', sort: 30, enabled: true,
  },
  {
    code: 'owl', section: 'birds', speedKmh: 40, nightMode: 'night_only', routeKind: 'air',
    capacity: { text: 500, photos: 1, drawings: 0, voiceSec: 0 },
    unlock: { kind: 'quest', quest: 'night_letter' }, look: 'sealed_envelope', sound: 'owl', sort: 40, enabled: true,
  },
  // ── Животные ─────────────────────────────────────────────
  {
    code: 'snail', section: 'animals', speedKmh: 0.05, nightMode: 'rest', routeKind: 'land',
    capacity: { text: 280, photos: 0, drawings: 0, voiceSec: 0 },
    unlock: { kind: 'start' }, look: 'leaf_shell', sound: 'snail', sort: 50, enabled: true,
  },
  {
    code: 'turtle', section: 'animals', speedKmh: 0.3, speedWaterKmh: 2, nightMode: 'rest', routeKind: 'land_sea',
    capacity: { text: 2000, photos: 2, drawings: 0, voiceSec: 0 },
    unlock: { kind: 'semi', price: 25 }, look: 'shell_bundle', sound: 'turtle', sort: 60, enabled: true,
  },
  {
    code: 'dogs', section: 'animals', speedKmh: 16, nightMode: 'rest', routeKind: 'land',
    capacity: { text: 3000, photos: 3, drawings: 0, voiceSec: 60 },
    unlock: { kind: 'semi', price: 60 }, look: 'mail_bag', sound: 'bark', sort: 70, enabled: true,
  },
  {
    code: 'dolphin', section: 'animals', speedKmh: 15, nightMode: 'always', routeKind: 'sea',
    capacity: { text: 500, photos: 1, drawings: 0, voiceSec: 0 },
    unlock: { kind: 'quest', quest: 'long_correspondence' }, look: 'capsule', sound: 'dolphin', sort: 80, enabled: true,
  },
  // ── История ──────────────────────────────────────────────
  {
    code: 'horse', section: 'history', speedKmh: 15, nightMode: 'rest', routeKind: 'land',
    capacity: { text: 3000, photos: 2, drawings: 1, voiceSec: 0 },
    unlock: { kind: 'semi', price: 50 }, look: 'wax_packet', sound: 'hooves', sort: 90, enabled: true,
  },
  {
    code: 'sailboat', section: 'history', speedKmh: 15, nightMode: 'always', routeKind: 'sea', windDriven: true,
    capacity: { text: 10000, photos: 10, drawings: 3, voiceSec: 300 },
    unlock: { kind: 'semi', price: 80 }, look: 'oilcloth_packet', sound: 'horn', sort: 100, enabled: true,
  },
  {
    code: 'airship', section: 'history', speedKmh: 115, nightMode: 'always', routeKind: 'air_direct',
    capacity: { text: 10000, photos: 10, drawings: 3, voiceSec: 300 },
    unlock: { kind: 'quest', quest: 'distance_5000' }, look: 'airmail', sound: 'engine', sort: 110, enabled: true,
  },
  {
    code: 'bottle', section: 'history', speedKmh: 1.5, nightMode: 'always', routeKind: 'sea', unpredictability: 0.5,
    noReturn: true,
    capacity: { text: 1000, photos: 0, drawings: 1, voiceSec: 0 },
    unlock: { kind: 'quest', quest: 'letters_5' }, look: 'bottle_note', sound: 'splash', sort: 120, enabled: true,
  },
  // ── Почта ────────────────────────────────────────────────
  {
    code: 'post', section: 'post', speedKmh: 60, nightMode: 'hours', routeKind: 'post',
    capacity: { text: 10000, photos: 10, drawings: 3, voiceSec: 300 },
    unlock: { kind: 'start' }, look: 'stamped_envelope', sound: 'post_horn', sort: 130, enabled: true,
  },
  // ── Сезонные ─────────────────────────────────────────────
  {
    code: 'reindeer', section: 'animals', speedKmh: 20, nightMode: 'rest', routeKind: 'land',
    capacity: { text: 2000, photos: 2, drawings: 1, voiceSec: 0 },
    unlock: { kind: 'season', months: [12, 1, 2] }, seasonMonths: [12, 1, 2],
    look: 'sleigh_bag', sound: 'bells', sort: 140, enabled: true,
  },
  {
    code: 'stork', section: 'birds', speedKmh: 45, nightMode: 'rest', routeKind: 'air',
    capacity: { text: 800, photos: 1, drawings: 1, voiceSec: 0 },
    unlock: { kind: 'season', months: [3, 4, 5] }, seasonMonths: [3, 4, 5],
    look: 'cloth_bundle', sound: 'stork', sort: 150, enabled: true,
  },
];

/** Тарифы «Почты»: сортировка добавляет задержку, как в жизни. */
export const DEFAULT_POST_TARIFFS: PostTariffDef[] = [
  { code: 'economy', carKmh: 60, hoursPerDay: 8, sortingHours: 48, unlock: { kind: 'start' } },
  { code: 'standard', carKmh: 60, hoursPerDay: 12, sortingHours: 24, unlock: { kind: 'semi', price: 20 } },
  { code: 'express', carKmh: 60, hoursPerDay: 24, sortingHours: 6, unlock: { kind: 'semi', price: 40 } },
  { code: 'air', carKmh: 60, hoursPerDay: 24, planeKmh: 800, sortingHours: 12, unlock: { kind: 'semi', price: 60 } },
];

/** Игровые параметры по умолчанию (правятся в админке через таблицу settings). */
export const GAME = {
  startSlots: 4,
  maxSlots: 10,
  slotPrice: (slotNumber: number) => 20 + (slotNumber - 4) * 10,
  recallWindowMin: 5,
  waitDays: 7,
  lossChance: 0.002,
  randomSpread: 0.1,
  migrationBonus: 0.1,
  maxExperienceBonus: 0.1,
  experiencePerTrip: 0.005,
  semiPer100Km: 1,
  semiReply: 2,
  semiLongCorrespondence: 10,
  semiDailyLogin: 1,
  rewardedRepliesPerPairPerDay: 3,
  childAgeLimit: 14,
  /** Предупреждать, если медленный курьер будет идти дольше этого (дней). */
  slowWarningDays: 30,
} as const;

export interface LetterContentSize {
  textLength: number;
  photos: number;
  drawings: number;
  voiceSec: number;
}

/** Проверка, помещается ли письмо в грузоподъёмность курьера. Возвращает список нарушений. */
export function checkCapacity(cap: Capacity, size: LetterContentSize): string[] {
  const errors: string[] = [];
  if (size.textLength > cap.text) errors.push('text');
  if (size.photos > cap.photos) errors.push('photos');
  if (size.drawings > cap.drawings) errors.push('drawings');
  if (size.voiceSec > cap.voiceSec) errors.push('voice');
  const total = size.photos + size.drawings + (size.voiceSec > 0 ? 1 : 0);
  if (cap.maxAttachments !== undefined && total > cap.maxAttachments) errors.push('attachments');
  return errors;
}

/** Опытный курьер чуть быстрее: до +10% к скорости. */
export function experienceSpeedBonus(trips: number): number {
  return Math.min(GAME.maxExperienceBonus, trips * GAME.experiencePerTrip);
}

/** ...и реже теряется: шанс падает до 30% от базового. */
export function experienceLossFactor(trips: number): number {
  return Math.max(0.3, 1 - trips * 0.03);
}

export function isInSeason(def: Pick<CourierTypeDef, 'seasonMonths'>, date: Date): boolean {
  if (!def.seasonMonths || def.seasonMonths.length === 0) return true;
  return def.seasonMonths.includes(date.getUTCMonth() + 1);
}
