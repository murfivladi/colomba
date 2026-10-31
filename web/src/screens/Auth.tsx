import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { Lang } from '@colomba/shared';
import { api } from '../api';
import { Postmaster } from '../art/Misc';
import { ErrorText, Segmented } from '../components/ui';
import { useT } from '../i18n';
import { navigate, useRoute } from '../router';

type Mode = 'login' | 'code' | 'register' | 'child';

export function Auth({ onDone, lang, setLang }: { onDone: () => void; lang: Lang; setLang: (l: Lang) => void }) {
  const { t } = useT();
  const route = useRoute();
  const [mode, setMode] = useState<Mode>(route.path === '/register' || route.query.get('invite') ? 'register' : 'login');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<{ inviteOnly: boolean } | null>(null);
  const [f, setF] = useState({
    email: '', password: '', username: '', displayName: '', birthDate: '', invite: route.query.get('invite') ?? '', code: '', terms: false,
  });
  const [codeSent, setCodeSent] = useState(false);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    api('/auth/config').then(setCfg).catch(() => {});
    // вход по ссылке из письма
    const token = route.query.get('token');
    if (token) {
      api('/auth/code/verify', { body: { token } }).then(() => { navigate('/'); onDone(); }, setError);
    }
    // ссылка-приглашение друга: /#/invite/код
    if (route.parts[0] === 'invite' && route.parts[1]) {
      setF((x) => ({ ...x, invite: route.parts[1] }));
      setMode('register');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') return run(() => api('/auth/login', { body: { email: f.email, password: f.password } }));
    if (mode === 'child') return run(() => api('/auth/child-device', { body: { code: f.code } }));
    if (mode === 'code') {
      if (!codeSent) {
        setBusy(true);
        return api('/auth/code/request', { body: { email: f.email, lang } }).then(() => setCodeSent(true), setError).finally(() => setBusy(false));
      }
      return run(() => api('/auth/code/verify', { body: { email: f.email, code: f.code } }));
    }
    return run(() =>
      api('/auth/register', {
        body: {
          email: f.email, password: f.password, username: f.username, displayName: f.displayName, lang,
          birthDate: f.birthDate, invite: f.invite || undefined, acceptTerms: f.terms,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    );
  };

  async function passkey() {
    await run(async () => {
      const { challengeId, options } = await api('/auth/passkey/login/options', { body: {} });
      const response = await startAuthentication({ optionsJSON: options });
      await api('/auth/passkey/login/verify', { body: { challengeId, response } });
    });
  }

  return (
    <div className="main" style={{ paddingBottom: 32 }}>
      <div className="hero">
        <Postmaster />
        <h1 style={{ color: 'var(--wax)', letterSpacing: '0.08em' }}>Colomba</h1>
        <p className="muted">{t('app.tagline')}</p>
        <div style={{ maxWidth: 220, margin: '0 auto' }}>
          <Segmented value={lang} options={[{ value: 'ru', label: 'Русский' }, { value: 'it', label: 'Italiano' }]} onChange={setLang} />
        </div>
      </div>

      <div className="card">
        <div className="tabs" role="tablist">
          <button className={mode === 'login' || mode === 'code' ? '' : 'secondary'} onClick={() => setMode('login')}>{t('auth.login')}</button>
          <button className={mode === 'register' ? '' : 'secondary'} onClick={() => setMode('register')}>{t('auth.register')}</button>
        </div>

        <form onSubmit={submit}>
          {mode !== 'child' && (
            <div className="field">
              <label htmlFor="email">{t('auth.email')}</label>
              <input id="email" type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
            </div>
          )}
          {(mode === 'login' || mode === 'register') && (
            <div className="field">
              <label htmlFor="pw">{t('auth.password')}</label>
              <input id="pw" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : 1} required value={f.password} onChange={set('password')} />
            </div>
          )}
          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="un">{t('auth.username')}</label>
                <input id="un" required pattern="[a-zA-Z0-9_.]{3,32}" value={f.username} onChange={set('username')} autoCapitalize="none" />
              </div>
              <div className="field">
                <label htmlFor="dn">{t('auth.displayName')}</label>
                <input id="dn" required maxLength={64} value={f.displayName} onChange={set('displayName')} />
              </div>
              <div className="field">
                <label htmlFor="bd">{t('auth.birthDate')}</label>
                <input id="bd" type="date" required value={f.birthDate} onChange={set('birthDate')} />
                <small>{t('auth.under14')}</small>
              </div>
              {(cfg?.inviteOnly || f.invite) && (
                <div className="field">
                  <label htmlFor="inv">{t('auth.invite')}</label>
                  <input id="inv" required={cfg?.inviteOnly} value={f.invite} onChange={set('invite')} />
                  {cfg?.inviteOnly && <small>{t('auth.inviteOnly')}</small>}
                </div>
              )}
              <label className="check">
                <input type="checkbox" required checked={f.terms} onChange={set('terms')} />
                <span>{t('auth.terms')} — <a href="#/legal" target="_blank">{t('settings.legal')}</a></span>
              </label>
            </>
          )}
          {mode === 'code' && codeSent && (
            <div className="field">
              <p className="ok">{t('auth.codeSent')}</p>
              <label htmlFor="code">{t('auth.code')}</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={f.code} onChange={set('code')} />
            </div>
          )}
          {mode === 'child' && (
            <div className="field">
              <label htmlFor="cc">{t('auth.childCode')}</label>
              <input id="cc" required autoCapitalize="characters" value={f.code} onChange={set('code')} style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }} />
            </div>
          )}
          <ErrorText error={error} />
          <button className="block" disabled={busy}>
            {mode === 'register' ? t('auth.register') : mode === 'code' && !codeSent ? t('auth.sendCode') : t('auth.login')}
          </button>
        </form>

        {mode !== 'register' && (
          <div className="stack" style={{ marginTop: 14 }}>
            {mode !== 'login' && <button className="secondary block" onClick={() => setMode('login')}>{t('auth.withPassword')}</button>}
            {mode !== 'code' && <button className="secondary block" onClick={() => { setMode('code'); setCodeSent(false); }}>{t('auth.withCode')}</button>}
            {'PublicKeyCredential' in window && <button className="secondary block" onClick={passkey}>{t('auth.withPasskey')}</button>}
            {mode !== 'child' && <button className="ghost block" onClick={() => setMode('child')}>{t('auth.childDevice')}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
