import { useState } from 'react';
import { courierName } from '@colomba/shared';
import { api } from '../api';
import { CourierArt } from '../art/Couriers';
import { ErrorText, Loading, SeedIcon, useLoad } from '../components/ui';
import { MONTHS, useT } from '../i18n';
import { useSession } from '../state';
import { capacityText } from './Station';
import { playCourier } from '../sound';

const SECTIONS = ['birds', 'animals', 'history', 'post'] as const;

/** Каталог: четыре раздела, открытые и закрытые курьеры (как альбом наклеек), задания. */
export function Catalog() {
  const { t, lang } = useT();
  const { reload: reloadMe, toast } = useSession();
  const { data, error, reload } = useLoad(() => api('/couriers/catalog'), []);
  const [err, setErr] = useState<unknown>(null);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;

  async function get(code: string) {
    setErr(null);
    try {
      await api('/couriers', { body: { type: code } });
      playCourier(code);
      toast(courierName(code, lang));
      reload();
      reloadMe();
    } catch (e) {
      setErr(e);
    }
  }

  return (
    <div>
      <h1>{t('catalog.title')}</h1>
      <ErrorText error={err} />
      {SECTIONS.map((s) => (
        <section key={s}>
          <h2>{t(`section.${s}`)}</h2>
          <div className="grid2">
            {data.items.filter((i: any) => i.section === s).map((i: any) => {
              const locked = i.state === 'locked' || i.state === 'out_of_season';
              return (
                <div key={i.code} className={`card courier-card ${locked ? 'locked' : ''}`}>
                  <CourierArt code={i.code} size={86} />
                  <h3 style={{ margin: '6px 0 2px' }}>{courierName(i.code, lang)}</h3>
                  <small className="muted">{i.speedKmh} {t('common.km')}/h · {t(`night.${i.nightMode}`)}</small>
                  <p style={{ fontSize: '0.85rem', margin: '6px 0' }}>{capacityText(i.capacity, t)}</p>
                  {i.seasonMonths && <p style={{ fontSize: '0.8rem' }} className="muted">{t('catalog.season', { m: i.seasonMonths.map((m: number) => MONTHS[lang][m - 1]).join(', ') })}</p>}
                  {i.count > 0 && <div className="status home">{t('catalog.owned')}: {i.count}</div>}
                  {i.state === 'buy' && (
                    <button className="small block" style={{ marginTop: 6 }} onClick={() => get(i.code)}>
                      {t('catalog.buy', { n: i.unlock.price })} <SeedIcon />
                    </button>
                  )}
                  {i.state === 'available' && <button className="small block" style={{ marginTop: 6 }} onClick={() => get(i.code)}>{t('catalog.get')}</button>}
                  {i.state === 'locked' && <p style={{ fontSize: '0.8rem', marginTop: 6 }}>🔒 {t('catalog.locked')}: {t(`quest.${i.unlock.quest}`)}</p>}
                  {i.state === 'out_of_season' && <p style={{ fontSize: '0.8rem', marginTop: 6 }}>{t('catalog.outOfSeason')}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
