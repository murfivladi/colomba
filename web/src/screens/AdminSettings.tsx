import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorText, Loading } from '../components/ui';
import { useT } from '../i18n';
import { useSession } from '../state';

interface Item {
  key: string;
  group: 'mail' | 'apis' | 'access' | 'push' | 'game';
  kind: 'string' | 'secret' | 'bool' | 'number' | 'list';
  value: any;
  isSet?: boolean;
  source: 'admin' | 'env' | 'default';
  min?: number;
  max?: number;
}

type L = { ru: string; it: string; hint?: { ru: string; it: string } };
const GROUPS: Record<Item['group'], { ru: string; it: string }> = {
  mail: { ru: 'Почта (SMTP)', it: 'Email (SMTP)' },
  apis: { ru: 'Ключи API', it: 'Chiavi API' },
  access: { ru: 'Доступ', it: 'Accesso' },
  push: { ru: 'Push-уведомления', it: 'Notifiche push' },
  game: { ru: 'Игровые параметры', it: 'Parametri di gioco' },
};
const LABELS: Record<string, L> = {
  smtpHost: { ru: 'SMTP-сервер', it: 'Server SMTP', hint: { ru: 'например smtp.yandex.ru; пусто — SMTP_URL из .env', it: 'es. smtp.gmail.com; vuoto — SMTP_URL da .env' } },
  smtpPort: { ru: 'Порт', it: 'Porta', hint: { ru: '465 — SSL, 587 — STARTTLS', it: '465 — SSL, 587 — STARTTLS' } },
  smtpSecure: { ru: 'SSL/TLS сразу (порт 465)', it: 'SSL/TLS diretto (porta 465)' },
  smtpUser: { ru: 'Логин', it: 'Utente' },
  smtpPass: { ru: 'Пароль', it: 'Password' },
  mailFrom: { ru: 'Отправитель', it: 'Mittente', hint: { ru: 'Colomba <colomba@vladinc.ru>', it: 'Colomba <colomba@vladinc.ru>' } },
  devLogCodes: { ru: 'Без почты писать коды входа в лог сервера', it: 'Senza email, scrivere i codici nel log del server' },
  orsApiKey: { ru: 'OpenRouteService', it: 'OpenRouteService', hint: { ru: 'маршруты по дорогам; без ключа — дуга ×1,3', it: 'percorsi su strada; senza chiave — arco ×1,3' } },
  graphhopperKey: { ru: 'GraphHopper (резерв)', it: 'GraphHopper (riserva)' },
  weatherEnabled: { ru: 'Погода Open-Meteo влияет на скорость', it: 'Il meteo Open-Meteo influisce sulla velocità' },
  inviteOnly: { ru: 'Закрытая бета: регистрация только по приглашению', it: 'Beta chiusa: registrazione solo su invito' },
  adminEmails: { ru: 'Почты администраторов (через запятую)', it: 'Email degli amministratori (separate da virgola)', hint: { ru: 'получают роль при регистрации', it: 'ottengono il ruolo alla registrazione' } },
  publicUrl: { ru: 'Адрес приложения', it: 'Indirizzo dell’app', hint: { ru: 'для ссылок в письмах и passkeys', it: 'per i link nelle email e le passkey' } },
  vapidSubject: { ru: 'Контакт VAPID', it: 'Contatto VAPID', hint: { ru: 'mailto:… для push-сервисов', it: 'mailto:… per i servizi push' } },
  'game.startSlots': { ru: 'Слотов у новичка', it: 'Posti iniziali' },
  'game.maxSlots': { ru: 'Максимум слотов', it: 'Posti massimi' },
  'game.recallWindowMin': { ru: 'Окно отзыва письма, мин', it: 'Finestra per richiamare, min' },
  'game.waitDays': { ru: 'Курьер ждёт ответа, дней', it: 'Il corriere aspetta, giorni' },
  'game.lossChance': { ru: 'Шанс потери письма (0,002 = 0,2%)', it: 'Probabilità di perdita (0,002 = 0,2%)' },
  'game.randomSpread': { ru: 'Случайный разброс времени (0,1 = ±10%)', it: 'Variazione casuale (0,1 = ±10%)' },
  'game.migrationBonus': { ru: 'Бонус миграции птиц', it: 'Bonus migrazione' },
  'game.maxExperienceBonus': { ru: 'Максимальный бонус опыта', it: 'Bonus massimo di esperienza' },
  'game.experiencePerTrip': { ru: 'Бонус опыта за рейс', it: 'Bonus esperienza per viaggio' },
  'game.semiPer100Km': { ru: 'Зёрнышек за 100 км', it: 'Semi per 100 km' },
  'game.semiReply': { ru: 'Зёрнышек за ответ', it: 'Semi per risposta' },
  'game.semiLongCorrespondence': { ru: 'Зёрнышек за каждые 10 писем', it: 'Semi ogni 10 lettere' },
  'game.semiDailyLogin': { ru: 'Зёрнышек за ежедневный вход', it: 'Semi per l’accesso quotidiano' },
  'game.rewardedRepliesPerPairPerDay': { ru: 'Лимит наград за ответы в день с одним человеком', it: 'Limite premi per risposte al giorno con una persona' },
  'game.slowWarningDays': { ru: 'Предупреждать, если путь дольше, дней', it: 'Avvisare se il viaggio dura più di, giorni' },
};
const SOURCE: Record<Item['source'], { ru: string; it: string }> = {
  admin: { ru: 'из админки', it: 'dall’admin' },
  env: { ru: 'из .env', it: 'da .env' },
  default: { ru: 'по умолчанию', it: 'predefinito' },
};

/** Настройки без перезапуска: всё, что не нужно для старта сервера. */
export function AdminSettings() {
  const { lang } = useT();
  const { me } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [mailOk, setMailOk] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [testTo, setTestTo] = useState(me.email ?? '');
  const [mailResult, setMailResult] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (r: { items: Item[]; mailConfigured: boolean }) => { setItems(r.items); setMailOk(r.mailConfigured); };
  useEffect(() => { api('/admin/settings').then(apply, setErr); }, []);
  if (!items) return err ? <ErrorText error={err} /> : <Loading />;

  const L = (k: string) => LABELS[k]?.[lang] ?? k;
  const valueOf = (i: Item) => (i.key in draft ? draft[i.key] : i.kind === 'secret' ? '' : i.kind === 'list' ? (i.value ?? []).join(', ') : i.value);
  const set = (k: string, v: any) => { setDraft({ ...draft, [k]: v }); setSaved(false); };

  async function save(values: Record<string, any>) {
    setErr(null);
    setBusy(true);
    try {
      apply(await api('/admin/settings', { method: 'PUT', body: { values } }));
      setDraft({});
      setSaved(true);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  const dirty = Object.keys(draft).filter((k) => !(items.find((i) => i.key === k)?.kind === 'secret' && draft[k] === ''));
  return (
    <div>
      <p className="muted">
        {lang === 'it'
          ? 'Valgono subito, senza riavvio. Ciò che serve per l’avvio (database, porta, TLS, CORS) resta in .env sul VPS. Password e chiavi sono cifrate nel database e non vengono mai mostrate.'
          : 'Применяются сразу, без перезапуска. То, что нужно для старта сервера (база, порт, TLS, CORS), остаётся в .env на VPS. Пароли и ключи хранятся в базе зашифрованными и обратно не показываются.'}
      </p>
      {(Object.keys(GROUPS) as Item['group'][]).map((g) => (
        <section key={g} className="card">
          <h2>{GROUPS[g][lang]}</h2>
          {items.filter((i) => i.group === g).map((i) => (
            <div key={i.key} className="field">
              {i.kind === 'bool' ? (
                <label className="check">
                  <input type="checkbox" checked={!!valueOf(i)} onChange={(e) => set(i.key, e.target.checked)} />
                  <span>{L(i.key)}</span>
                </label>
              ) : (
                <>
                  <label htmlFor={i.key}>{L(i.key)}</label>
                  <input
                    id={i.key}
                    type={i.kind === 'secret' ? 'password' : i.kind === 'number' ? 'number' : 'text'}
                    autoComplete={i.kind === 'secret' ? 'new-password' : 'off'}
                    step={i.kind === 'number' ? 'any' : undefined}
                    min={i.min}
                    max={i.max}
                    placeholder={i.kind === 'secret' ? (i.isSet ? `${lang === 'it' ? 'impostato' : 'задан'} ${i.value}` : '—') : LABELS[i.key]?.hint?.[lang]}
                    value={valueOf(i) ?? ''}
                    onChange={(e) => set(i.key, i.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                  />
                </>
              )}
              <div className="row between">
                <small className="muted">{LABELS[i.key]?.hint && i.kind !== 'string' ? `${LABELS[i.key].hint![lang]} · ` : ''}{SOURCE[i.source][lang]}</small>
                {i.source === 'admin' && (
                  <button type="button" className="ghost small" onClick={() => save({ [i.key]: null })}>
                    {i.kind === 'secret' ? (lang === 'it' ? 'Rimuovi' : 'Удалить') : lang === 'it' ? 'Ripristina .env' : 'Сбросить к .env'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {g === 'mail' && (
            <div className="card flat">
              <p className="muted">{mailOk ? (lang === 'it' ? 'SMTP configurato.' : 'SMTP настроен.') : (lang === 'it' ? 'SMTP non configurato: i codici di accesso non arrivano per email.' : 'SMTP не настроен: коды входа на почту не приходят.')}</p>
              <div className="row">
                <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="email" />
                <button type="button" className="secondary" disabled={busy || dirty.length > 0} onClick={async () => {
                  setMailResult('…');
                  const r = await api('/admin/settings/test-mail', { body: { to: testTo || undefined } });
                  setMailResult(r.ok ? `✓ ${r.to}` : `✕ ${r.error}`);
                }}>{lang === 'it' ? 'Prova' : 'Проверить'}</button>
              </div>
              {dirty.length > 0 && <small className="muted">{lang === 'it' ? 'Salva prima le modifiche.' : 'Сначала сохраните изменения.'}</small>}
              {mailResult && <p className={mailResult.startsWith('✓') ? 'ok' : 'error'}>{mailResult}</p>}
            </div>
          )}
          {g === 'apis' && (
            <div className="card flat">
              <button type="button" className="secondary" disabled={busy || dirty.length > 0} onClick={async () => setApiResult(await api('/admin/settings/test-apis', { body: {} }))}>
                {lang === 'it' ? 'Verifica le chiavi' : 'Проверить ключи'}
              </button>
              {apiResult?.map((r) => (
                <p key={r.name} className={r.ok ? 'ok' : 'error'}>
                  {r.ok ? '✓' : '✕'} {r.name}{r.status ? ` · HTTP ${r.status}` : ''}{r.error ? ` · ${r.error === 'no_key' ? (lang === 'it' ? 'chiave non impostata' : 'ключ не задан') : r.error}` : ''}
                </p>
              ))}
            </div>
          )}
        </section>
      ))}
      <ErrorText error={err} />
      {saved && <p className="ok">✓ {lang === 'it' ? 'Salvato' : 'Сохранено'}</p>}
      <div style={{ position: 'sticky', bottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
        <button className="block" disabled={busy || dirty.length === 0} onClick={() => {
          const values: Record<string, any> = {};
          for (const k of dirty) values[k] = draft[k];
          void save(values);
        }}>{lang === 'it' ? 'Salva' : 'Сохранить'}{dirty.length ? ` (${dirty.length})` : ''}</button>
      </div>
    </div>
  );
}
