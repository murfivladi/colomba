import type { Lang, TripEvent } from './types.js';

/** Названия курьеров и тарифов — общие для сервера (уведомления) и клиента. */
export const COURIER_NAMES: Record<string, Record<Lang, string>> = {
  pigeon: { ru: 'Почтовый голубь', it: 'Piccione viaggiatore' },
  falcon: { ru: 'Сокол', it: 'Falco' },
  albatross: { ru: 'Альбатрос', it: 'Albatro' },
  owl: { ru: 'Сова', it: 'Gufo' },
  snail: { ru: 'Улитка', it: 'Lumaca' },
  turtle: { ru: 'Черепаха', it: 'Tartaruga' },
  dogs: { ru: 'Ездовые собаки', it: 'Cani da slitta' },
  dolphin: { ru: 'Дельфин', it: 'Delfino' },
  horse: { ru: 'Конный гонец', it: 'Messaggero a cavallo' },
  sailboat: { ru: 'Парусник', it: 'Veliero' },
  airship: { ru: 'Дирижабль', it: 'Dirigibile' },
  bottle: { ru: 'Бутылка в море', it: 'Messaggio in bottiglia' },
  post: { ru: 'Почта', it: 'Posta' },
  reindeer: { ru: 'Северные олени', it: 'Renne' },
  stork: { ru: 'Аист', it: 'Cicogna' },
};

export const TARIFF_NAMES: Record<string, Record<Lang, string>> = {
  economy: { ru: 'Эконом', it: 'Economica' },
  standard: { ru: 'Стандарт', it: 'Standard' },
  express: { ru: 'Экспресс', it: 'Espresso' },
  air: { ru: 'Авиа', it: 'Posta aerea' },
};

export function courierName(code: string, lang: Lang): string {
  return COURIER_NAMES[code]?.[lang] ?? code;
}

type Tpl = (p: Record<string, string>) => string;

const EVENT_TEXT: Record<TripEvent['type'], Record<Lang, Tpl>> = {
  depart: { ru: (p) => `${p.courier} отправился в путь`, it: (p) => `${p.courier} è partito` },
  border: {
    ru: (p) => `${p.courier} пересёк границу: ${p.country}`,
    it: (p) => `${p.courier} ha attraversato il confine: ${p.country}`,
  },
  mountains: {
    ru: (p) => `${p.courier} ${p.mode === 'over' ? 'перелетел' : 'облетел'} ${p.mountains}`,
    it: (p) => `${p.courier} ${p.mode === 'over' ? 'ha sorvolato' : 'ha aggirato'} ${p.mountains}`,
  },
  night_rest: { ru: (p) => `${p.courier} устроился на ночлег`, it: (p) => `${p.courier} si è fermato per la notte` },
  wake: { ru: (p) => `${p.courier} снова в пути`, it: (p) => `${p.courier} è di nuovo in viaggio` },
  storm: { ru: (p) => `Шторм задерживает: ${p.courier}`, it: (p) => `Una tempesta trattiene: ${p.courier}` },
  city: { ru: (p) => `${p.courier} пролетает ${p.city}`, it: (p) => `${p.courier} passa per ${p.city}` },
  sea_start: { ru: (p) => `${p.courier} вышел в море`, it: (p) => `${p.courier} ha preso il mare` },
  arrive: { ru: (p) => `${p.courier} прибыл`, it: (p) => `${p.courier} è arrivato` },
  sorting: { ru: () => `Письмо на сортировке`, it: () => `La lettera è allo smistamento` },
  lost: { ru: (p) => `${p.courier} потерял письмо в пути`, it: (p) => `${p.courier} ha perso la lettera` },
};

export function eventText(ev: TripEvent, lang: Lang, courier: string): string {
  return EVENT_TEXT[ev.type][lang]({ courier, ...(ev.params ?? {}) });
}

export const MOUNTAIN_NAMES: Record<string, Record<Lang, string>> = {
  alps: { ru: 'Альпы', it: 'le Alpi' },
  pyrenees: { ru: 'Пиренеи', it: 'i Pirenei' },
  carpathians: { ru: 'Карпаты', it: 'i Carpazi' },
  caucasus: { ru: 'Кавказ', it: 'il Caucaso' },
  pamir: { ru: 'Памир и Тянь-Шань', it: 'il Pamir e il Tien Shan' },
  himalaya: { ru: 'Гималаи', it: "l'Himalaya" },
  altai: { ru: 'Алтай', it: "l'Altaj" },
  rockies: { ru: 'Скалистые горы', it: 'le Montagne Rocciose' },
  andes: { ru: 'Анды', it: 'le Ande' },
  atlas: { ru: 'Атлас', it: "l'Atlante" },
  ethiopia: { ru: 'Эфиопское нагорье', it: "l'altopiano etiope" },
  zagros: { ru: 'Загрос', it: 'gli Zagros' },
};

/** Тексты уведомлений, которые формирует сервер. */
export const NOTIFY: Record<string, Record<Lang, Tpl>> = {
  incoming: {
    ru: (p) => `К вам летит ${p.courier} от ${p.from}. Прибытие: ${p.eta}`,
    it: (p) => `${p.courier} sta arrivando da ${p.from}. Arrivo: ${p.eta}`,
  },
  delivered: { ru: (p) => `${p.courier} принёс письмо от ${p.from}`, it: (p) => `${p.courier} ti ha portato una lettera da ${p.from}` },
  delivered_sender: { ru: (p) => `${p.courier} доставил письмо: ${p.to}`, it: (p) => `${p.courier} ha consegnato la lettera a ${p.to}` },
  returned: { ru: (p) => `${p.courier} вернулся домой`, it: (p) => `${p.courier} è tornato a casa` },
  returned_reply: { ru: (p) => `${p.courier} вернулся с ответом от ${p.from}`, it: (p) => `${p.courier} è tornato con la risposta di ${p.from}` },
  returned_lost: {
    ru: (p) => `${p.courier} вернулся без письма — оно пропало в пути`,
    it: (p) => `${p.courier} è tornato senza la lettera: è andata persa`,
  },
  friend_request: { ru: (p) => `Прилетел голубь: ${p.from} хочет дружить`, it: (p) => `È arrivato un piccione: ${p.from} vuole essere tuo amico` },
  friend_accepted: { ru: (p) => `${p.from} теперь ваш друг`, it: (p) => `${p.from} ora è tuo amico` },
  child_friend_request: {
    ru: (p) => `${p.from} хочет дружить с ${p.child} — нужно ваше одобрение`,
    it: (p) => `${p.from} vuole essere amico di ${p.child}: serve la tua approvazione`,
  },
  bottle_caught: { ru: () => `Вы выловили бутылку с запиской!`, it: () => `Hai ripescato un messaggio in bottiglia!` },
  achievement: { ru: (p) => `Новое достижение: ${p.name}`, it: (p) => `Nuovo traguardo: ${p.name}` },
  courier_unlocked: { ru: (p) => `Новый курьер: ${p.courier}`, it: (p) => `Nuovo corriere: ${p.courier}` },
  digest: {
    ru: (p) => `Утренняя почта: ${p.count} новостей от ваших курьеров`,
    it: (p) => `Posta del mattino: ${p.count} notizie dai tuoi corrieri`,
  },
  broadcast: { ru: () => `Письмо от почтмейстера`, it: () => `Una lettera dal mastro postino` },
  queue_failed: {
    ru: (p) => `Письмо не удалось отправить по расписанию (${p.error}) — оно вернулось в черновики`,
    it: (p) => `Non è stato possibile spedire la lettera programmata (${p.error}): è tornata nelle bozze`,
  },
  warning: { ru: (p) => `Предупреждение от администратора: ${p.text}`, it: (p) => `Avviso dall'amministratore: ${p.text}` },
  child_request_approved: { ru: (p) => `Родитель одобрил дружбу с ${p.from}`, it: (p) => `Il genitore ha approvato l'amicizia con ${p.from}` },
  scheduled_sent: { ru: (p) => `${p.courier} вылетел по расписанию`, it: (p) => `${p.courier} è partito come programmato` },
};

export function notifyText(key: string, lang: Lang, params: Record<string, string>): string {
  const t = NOTIFY[key];
  return t ? t[lang](params) : key;
}
