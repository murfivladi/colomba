import { useState } from 'react';
import { courierName, type Capacity } from '@colomba/shared';
import { api } from '../api';
import { CourierArt } from '../art/Couriers';
import { STATION_SPOTS, StationScene } from '../art/Misc';
import { ErrorText, Loading, Modal, SeedIcon, useLoad } from '../components/ui';
import { formatDate, useT } from '../i18n';
import { navigate } from '../router';
import { useSession } from '../state';
import { playCourier } from '../sound';

export function capacityText(cap: Capacity, t: (k: string, p?: any) => string): string {
  const parts = [cap.text ? t('cap.text', { n: cap.text }) : ''];
  if (cap.maxAttachments === 1 && cap.photos && cap.drawings) parts.push(t('cap.or'));
  else {
    if (cap.photos) parts.push(t('cap.photos', { n: cap.photos }));
    if (cap.drawings) parts.push(t('cap.drawings'));
  }
  if (cap.voiceSec) parts.push(t('cap.voice', { n: Math.round(cap.voiceSec / 60) }));
  if (!cap.photos && !cap.drawings && !cap.voiceSec) parts.push(t('cap.textOnly'));
  return parts.filter(Boolean).join(' + ');
}

export interface OwnedCourier {
  id: number; type: string; name: string; trips: number; km: number; status: 'home' | 'outbound' | 'waiting' | 'returning';
  tripId: number | null; tripStartAt: string | null; tripEndAt: string | null; waitingLetterId: number | null; waitingUntil: string | null; speedBonus: number;
}

/** Почтовая станция: курьеры дома на своих местах, улетевшие — пустыми гнёздами. */
export function Station() {
  const { t, lang } = useT();
  const { me, reload: reloadMe, toast, pulse } = useSession();
  const { data, error, reload } = useLoad(() => api<{ couriers: OwnedCourier[]; slots: number; nextSlotPrice: number | null }>('/couriers'), [pulse]);
  const [open, setOpen] = useState<OwnedCourier | null>(null);

  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;

  // несколько курьеров одного типа — раздвигаем
  const seen: Record<string, number> = {};
  return (
    <div>
      {me.dailyBonus > 0 && <p className="ok center">{t('semi.daily', { n: me.dailyBonus })}</p>}
      <div className="station">
        <StationScene />
        {data.couriers.map((c) => {
          const spot = STATION_SPOTS[c.type] ?? { x: 50, y: 50 };
          const k = (seen[c.type] = (seen[c.type] ?? -1) + 1);
          const away = c.status !== 'home';
          return (
            <button
              key={c.id}
              className={`spot ${away ? 'away' : ''}`}
              style={{ left: `${Math.min(94, spot.x + k * 7)}%`, top: `${spot.y}%` }}
              onClick={() => { setOpen(c); if (!away) playCourier(c.type); }}
              aria-label={`${c.name} — ${t(`courier.status.${c.status}`)}`}
            >
              <CourierArt code={c.type} size={58} />
              <div className="name">{away ? '◌ ' : ''}{c.name}</div>
            </button>
          );
        })}
      </div>

      <div className="row between" style={{ margin: '14px 0' }}>
        <span className="muted">{t('station.slots')}: {data.couriers.length} / {data.slots}</span>
        <div className="row">
          {data.nextSlotPrice !== null && (
            <button className="secondary small" onClick={async () => {
              try { await api('/couriers/slots', { body: {} }); reload(); reloadMe(); } catch (e: any) { toast(t(`err.${e.code}`)); }
            }}>{t('station.buySlot')} · {data.nextSlotPrice} <SeedIcon /></button>
          )}
          <a className="btn small" href="#/catalog">{t('station.catalog')}</a>
        </div>
      </div>

      <div className="stack">
        {data.couriers.map((c) => (
          <div key={c.id} className="card flat row" onClick={() => setOpen(c)} style={{ cursor: 'pointer' }}>
            <CourierArt code={c.type} size={48} />
            <div className="grow">
              <div className="ellipsis"><b>{c.name}</b> <small className="muted">{courierName(c.type, lang)}</small></div>
              <span className={`status ${c.status}`}>{t(`courier.status.${c.status}`)}</span>{' '}
              {c.tripEndAt && c.status !== 'waiting' && <small className="muted">→ {formatDate(c.tripEndAt, lang)}</small>}
              {c.status === 'waiting' && c.waitingUntil && <small className="muted">{t('courier.waitUntil')} {formatDate(c.waitingUntil, lang)}</small>}
            </div>
          </div>
        ))}
      </div>

      {open && <CourierModal c={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function CourierModal({ c, onClose, onChanged }: { c: OwnedCourier; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const { toast } = useSession();
  const [name, setName] = useState(c.name);
  const [error, setError] = useState<unknown>(null);
  const { data: cat } = useLoad(() => api('/couriers/catalog'), []);
  const def = cat?.items.find((x: any) => x.code === c.type);

  return (
    <Modal onClose={onClose}>
      <div className="row">
        <CourierArt code={c.type} size={96} />
        <div className="grow">
          <h2 style={{ marginBottom: 2 }}>{c.name}</h2>
          <div className="muted">{courierName(c.type, lang)}</div>
          <span className={`status ${c.status}`}>{t(`courier.status.${c.status}`)}</span>
        </div>
      </div>
      <hr />
      {def && (
        <table className="simple">
          <tbody>
            <tr><th>{t('courier.speed')}</th><td>{def.speedKmh} {t('common.km')}/h{def.speedWaterKmh ? ` · ${def.speedWaterKmh} ${t('common.km')}/h ~` : ''}</td></tr>
            <tr><th>{t('courier.night')}</th><td>{t(`night.${def.nightMode}`)}</td></tr>
            <tr><th>{t('courier.route')}</th><td>{t(`route.${def.routeKind}`)}</td></tr>
            <tr><th>{t('courier.capacity')}</th><td>{capacityText(def.capacity, t)}</td></tr>
          </tbody>
        </table>
      )}
      <p className="muted">{c.trips} {t('courier.trips')} · {c.km} {t('common.km')} · {t('courier.experience', { n: Math.round(c.speedBonus * 100) })}</p>
      {c.status !== 'home' && c.tripId && (
        <button className="secondary block" onClick={() => navigate(`/courier/${c.id}/flight`)}>{t('courier.flight')}</button>
      )}
      <hr />
      <div className="field">
        <label htmlFor="cn">{t('courier.rename')}</label>
        <div className="row">
          <input id="cn" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button onClick={async () => {
            try { await api(`/couriers/${c.id}`, { method: 'PATCH', body: { name } }); toast(t('common.saved')); onChanged(); } catch (e) { setError(e); }
          }}>{t('common.save')}</button>
        </div>
      </div>
      {c.status === 'home' && (
        <div className="row">
          <a className="btn grow" href={`#/write?courier=${c.id}`}>{t('nav.write')}</a>
          <button className="ghost" onClick={async () => {
            if (!confirm(`${t('courier.release')}: ${c.name}?`)) return;
            try { await api(`/couriers/${c.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setError(e); }
          }}>{t('courier.release')}</button>
        </div>
      )}
      <ErrorText error={error} />
    </Modal>
  );
}
