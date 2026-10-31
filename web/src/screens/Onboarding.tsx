import { useEffect, useState } from 'react';
import { api } from '../api';
import { Postmaster } from '../art/Misc';
import { refreshLocation } from '../geo';
import { useT } from '../i18n';
import { isIos, isStandalone, pushSupported, subscribePush } from '../push';
import { useSession } from '../state';

/**
 * Онбординг: место (честно объясняем, зачем и что видят другие), установка PWA
 * (на iPhone без неё нет уведомлений), уведомления. Первое письмо уже ждёт от почтмейстера.
 */
export function Onboarding() {
  const { me, reload } = useSession();
  const { t } = useT();
  const [loc, setLoc] = useState<'idle' | 'ok' | 'fail'>(me.hasLocation ? 'ok' : 'idle');
  const [push, setPush] = useState(false);
  const [installEvt, setInstallEvt] = useState<any>(null);

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  async function askLocation() {
    const p = await refreshLocation();
    setLoc(p ? 'ok' : 'fail');
  }

  async function finish() {
    await api('/me', { method: 'PATCH', body: { onboarded: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
    await reload();
    window.location.hash = '#/mailbox';
  }

  return (
    <div className="main">
      <div className="hero">
        <Postmaster />
        <h1>{t('onb.title')}</h1>
      </div>
      <div className="card">
        <h2>1. {t('onb.location')}</h2>
        <p>{t('onb.locationWhy')}</p>
        {loc === 'ok' ? <p className="ok">✓ {t('onb.locationOk')}</p> : <button onClick={askLocation}>{t('onb.allowLocation')}</button>}
        {loc === 'fail' && <p className="error">{t('err.no_sender_location')}</p>}
      </div>
      {!isStandalone() && (
        <div className="card">
          <h2>2. {t('onb.install')}</h2>
          {isIos() ? <p>{t('onb.installIos')}</p> : installEvt ? (
            <button onClick={() => installEvt.prompt()}>{t('onb.installBtn')}</button>
          ) : <p className="muted">{t('onb.installIos')}</p>}
        </div>
      )}
      {pushSupported() && (
        <div className="card">
          <h2>3. {t('onb.notify')}</h2>
          <p>{t('onb.notifyWhy')}</p>
          {push ? <p className="ok">✓</p> : <button className="secondary" onClick={async () => setPush(await subscribePush(me.vapidPublicKey))}>{t('onb.allowNotify')}</button>}
        </div>
      )}
      <button className="block" disabled={loc !== 'ok'} onClick={finish}>{t('onb.start')}</button>
    </div>
  );
}
