import { lazy, Suspense, useState } from 'react';
import { courierName, eventText, MOUNTAIN_NAMES } from '@colomba/shared';
import { api } from '../api';
import { PostmarkStamp } from '../components/Letter';
import { ErrorText, Loading, useLoad } from '../components/ui';
import { formatDate, formatDuration, useT } from '../i18n';
// карта (MapLibre) грузится отдельным чанком, только когда нужна
const FlightMap = lazy(() => import('../map/FlightMap').then((m) => ({ default: m.FlightMap })));

function localize(params: Record<string, string> | undefined, lang: 'ru' | 'it') {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (k.endsWith('_it')) continue;
    out[k] = lang === 'it' && params?.[`${k}_it`] ? params[`${k}_it`] : v;
  }
  if (out.mountains && MOUNTAIN_NAMES[out.mountains]) out.mountains = MOUNTAIN_NAMES[out.mountains][lang];
  return out;
}

/** Полёт письма: карту видит только отправитель. */
export function Flight({ letterId }: { letterId: number }) {
  const { t, lang } = useT();
  const { data, error } = useLoad(() => api(`/letters/${letterId}/flight`), [letterId]);
  const [state, setState] = useState<{ moving: boolean; elapsed: number }>({ moving: false, elapsed: 0 });
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const end = new Date(data.endAt).getTime();
  const left = Math.max(0, (end - Date.now()) / 1000);
  const name = data.courier?.name ?? courierName(data.courier?.type ?? 'pigeon', lang);
  return (
    <div>
      <h1>{t('flight.title')}: {name}</h1>
      <p className="muted">{t('flight.onlySender')}</p>
      <Suspense fallback={<div className="map-wrap"><Loading /></div>}>
      <FlightMap
        timeline={data.timeline}
        startAt={data.startAt}
        courier={data.courier?.type ?? 'pigeon'}
        postmarks={data.postmarks}
        lang={lang}
        onTick={(s) => { if (s.moving !== state.moving) setState(s); }}
      />
      </Suspense>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between wrap">
          <b>{left > 0 ? (state.moving ? t('flight.moving') : t('flight.resting')) : t('flight.arrived')}</b>
          <span>{t('flight.eta', { t: formatDate(data.endAt, lang) })}{left > 0 ? ` · ${t('flight.left', { d: formatDuration(left, lang) })}` : ''}</span>
        </div>
        <div className="progress" style={{ marginTop: 8 }}>
          <div style={{ width: `${Math.min(100, (100 * (Date.now() - new Date(data.startAt).getTime())) / Math.max(1, end - new Date(data.startAt).getTime()))}%` }} />
        </div>
        <small className="muted">{Math.round(data.distanceKm)} {t('common.km')}</small>
        {data.status === 'delayed' && <p className="error">{t('letter.lost')}</p>}
      </div>
      {data.postmarks.length > 0 && (
        <div className="card">
          <h3>{t('letter.postmarks')}</h3>
          <div className="row wrap">{data.postmarks.map((p: any, i: number) => <PostmarkStamp key={i} pm={p} lang={lang} faint={!p.stamped} />)}</div>
        </div>
      )}
      <div className="card">
        <h3>{t('flight.events')}</h3>
        <div className="timeline-events">
          {[...data.events].reverse().map((e: any, i: number) => (
            <div key={i} className="event">
              <small className="muted" style={{ minWidth: 110 }}>{formatDate(new Date(new Date(data.startAt).getTime() + e.t * 1000), lang)}</small>
              <span>{eventText({ ...e, params: localize(e.params, lang) }, lang, name)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Текущий рейс курьера (в том числе пустой обратный путь). */
export function CourierFlight({ courierId }: { courierId: number }) {
  const { t, lang } = useT();
  const { data, error } = useLoad(() => api(`/couriers/${courierId}/trip`), [courierId]);
  const cour = useLoad(() => api('/couriers'), []);
  if (error) return <ErrorText error={error} />;
  if (!data || !cour.data) return <Loading />;
  const c = cour.data.couriers.find((x: any) => x.id === courierId);
  if (data.letterId && data.direction === 'out') return <Flight letterId={data.letterId} />;
  return (
    <div>
      <h1>{c?.name}</h1>
      <Suspense fallback={<Loading />}>
        <FlightMap timeline={data.timeline} startAt={data.startAt} courier={c?.type ?? 'pigeon'} lang={lang} />
      </Suspense>
      <div className="card" style={{ marginTop: 12 }}>
        <b>{t(`courier.status.${c?.status ?? 'returning'}`)}</b> · {t('flight.eta', { t: formatDate(data.endAt, lang) })}
      </div>
    </div>
  );
}
