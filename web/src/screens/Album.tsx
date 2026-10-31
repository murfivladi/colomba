import { useState } from 'react';
import { courierName } from '@colomba/shared';
import { api } from '../api';
import { CourierArt } from '../art/Couriers';
import { Stamp } from '../art/Misc';
import { PostmarkStamp } from '../components/Letter';
import { ErrorText, Loading, SeedIcon, useLoad } from '../components/ui';
import { formatDate, useT } from '../i18n';
import { useSession } from '../state';

/** Альбом: штемпели, страны, марки, достижения, коллекция курьеров. */
export function Album() {
  const { t, lang } = useT();
  const [tab, setTab] = useState<'postmarks' | 'countries' | 'stamps' | 'achievements' | 'couriers'>('postmarks');
  const { data, error } = useLoad(() => api('/album'), []);
  const cat = useLoad(() => api('/couriers/catalog'), []);
  if (error) return <ErrorText error={error} />;
  if (!data || !cat.data) return <Loading />;
  return (
    <div>
      <h1>{t('album.title')}</h1>
      <div className="tabs">
        {(['postmarks', 'countries', 'stamps', 'achievements', 'couriers'] as const).map((x) => (
          <button key={x} className={tab === x ? 'small' : 'secondary small'} onClick={() => setTab(x)}>{t(`album.${x}`)}</button>
        ))}
      </div>
      {tab === 'postmarks' && (data.postmarks.length ? (
        <div className="row wrap">{data.postmarks.map((p: any, i: number) => <PostmarkStamp key={i} pm={{ ...p, at: p.firstAt }} lang={lang} />)}</div>
      ) : <p className="muted center">{t('album.empty')}</p>)}
      {tab === 'countries' && (
        <div className="grid3">
          {data.countries.map((c: any) => (
            <div key={c.code} className="card center">
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--navy)' }}>{c.code}</div>
              <div>{c[lang]}</div>
              <small className="muted">× {c.count}</small>
            </div>
          ))}
          {!data.countries.length && <p className="muted">{t('album.empty')}</p>}
        </div>
      )}
      {tab === 'stamps' && (
        <div className="grid3">
          {data.stamps.map((s: any) => (
            <div key={s.code} className="card center" style={{ opacity: s.owned ? 1 : 0.35 }}>
              <Stamp data={s.data} size={64} />
              <div style={{ fontSize: '0.85rem' }}>{s[lang]}</div>
            </div>
          ))}
        </div>
      )}
      {tab === 'achievements' && (
        <div>
          {data.achievements.map((a: any) => (
            <div key={a.code} className="card flat row" style={{ opacity: a.achievedAt ? 1 : 0.5 }}>
              <div style={{ fontSize: '1.6rem' }}>{a.achievedAt ? '🏅' : '◯'}</div>
              <div className="grow">
                <b>{lang === 'it' ? a.it : a.ru}</b>
                <div><small className="muted">{lang === 'it' ? a.descIt : a.descRu}</small></div>
                {a.achievedAt && <small className="muted">{formatDate(a.achievedAt, lang, false)}</small>}
              </div>
              <span className="semi-badge">+{a.reward} <SeedIcon /></span>
            </div>
          ))}
        </div>
      )}
      {tab === 'couriers' && (
        <div className="grid3">
          {cat.data.items.map((c: any) => (
            <div key={c.code} className={`card courier-card ${c.count ? '' : 'locked'}`}>
              <CourierArt code={c.code} size={64} />
              <div style={{ fontSize: '0.85rem' }}>{courierName(c.code, lang)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Лавка: всё только за зёрнышки. */
export function Shop() {
  const { t, lang } = useT();
  const { me, reload: reloadMe, toast } = useSession();
  const { data, error, reload } = useLoad(() => api('/shop'), []);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const kinds = ['tariff', 'stamp', 'paper', 'envelope', 'sticker'];
  return (
    <div>
      <div className="row between">
        <h1>{t('shop.title')}</h1>
        <span className="semi-badge">{me.semi} <SeedIcon /></span>
      </div>
      <p className="muted">{t('semi.hint')}</p>
      {kinds.map((k) => (
        <section key={k}>
          <h2>{t(`shop.kind.${k}`)}</h2>
          <div className="grid3">
            {data.items.filter((i: any) => i.kind === k).map((i: any) => (
              <div key={i.code} className="card center" style={{ padding: 10 }}>
                {k === 'stamp' && <Stamp data={i.data} size={56} />}
                {k === 'paper' && <div style={{ height: 56, background: i.data?.bg, border: '1px solid var(--line)', borderRadius: 4 }} />}
                {k === 'envelope' && <div style={{ height: 40, background: i.data?.color, border: '1px solid var(--line)', borderRadius: 4, marginBottom: 8 }} />}
                {k === 'sticker' && <div style={{ fontSize: '2rem' }}>{i.data?.emoji}</div>}
                {k === 'tariff' && <CourierArt code="post" size={56} />}
                <div style={{ fontSize: '0.85rem', margin: '4px 0' }}>{i[lang]}</div>
                {i.owned ? <small className="ok">{t('shop.owned')}</small> : !i.available ? <small className="muted">{t('shop.notNow')}</small> : (
                  <button className="small block" disabled={me.semi < i.price} onClick={async () => {
                    try { await api('/shop/buy', { body: { code: i.code } }); reload(); reloadMe(); } catch (e: any) { toast(t(`err.${e.code}`)); }
                  }}>{t('shop.buy', { n: i.price })} <SeedIcon /></button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function Notifications() {
  const { t, lang } = useT();
  const { reload: reloadMe } = useSession();
  const { data, error } = useLoad(async () => {
    const r = await api<any[]>('/me/notifications');
    await api('/me/notifications/read', { body: {} });
    reloadMe();
    return r;
  }, []);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  return (
    <div>
      <h1>{t('notif.title')}</h1>
      {!data.length && <p className="muted center">{t('notif.empty')}</p>}
      {data.map((n) => (
        <a key={n.id} className="envelope-tile" href={n.letterId ? (n.type === 'trip_event' ? `#/flight/${n.letterId}` : `#/letter/${n.letterId}`) : '#/'} style={{ opacity: n.read ? 0.75 : 1 }}>
          <CourierArt code={n.courier ?? 'pigeon'} size={40} />
          <div className="grow">
            <div>{n.text}</div>
            <small className="muted">{formatDate(n.createdAt, lang)}</small>
          </div>
        </a>
      ))}
    </div>
  );
}
