import { useCallback, useEffect, useState } from 'react';
import type { Lang } from '@colomba/shared';
import { api, ApiError, API_BASE } from './api';
import { AppIcon } from './art/Misc';
import { Loading, SeedIcon } from './components/ui';
import { refreshLocation } from './geo';
import { LangContext, translate } from './i18n';
import { navigate, useRoute } from './router';
import { SessionContext, type Me } from './state';
import { playCourier, setSoundsEnabled } from './sound';
import { Admin } from './screens/Admin';
import { Album, Notifications, Shop } from './screens/Album';
import { Auth } from './screens/Auth';
import { Catalog } from './screens/Catalog';
import { Compose } from './screens/Compose';
import { CourierFlight, Flight } from './screens/Flight';
import { Friends, InviteLanding, Profile } from './screens/Friends';
import { Legal } from './screens/Legal';
import { LetterView } from './screens/LetterView';
import { Conversation, Mailbox } from './screens/Mailbox';
import { More } from './screens/More';
import { Onboarding } from './screens/Onboarding';
import { Settings } from './screens/Settings';
import { Station } from './screens/Station';

function guessLang(): Lang {
  try {
    const saved = localStorage.getItem('colomba.lang');
    if (saved === 'ru' || saved === 'it') return saved;
  } catch { /* приватный режим */ }
  return navigator.language.toLowerCase().startsWith('it') ? 'it' : 'ru';
}

const Icon = {
  station: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></svg>,
  mail: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="6" width="18" height="13" rx="1.5" /><path d="m3 7 9 7 9-7" /></svg>,
  write: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 20c4-1 6-3 14-14l-2-2C5 12 4 14 4 20Z" /><path d="M14 6l2 2" /></svg>,
  friends: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="3.5" /><circle cx="17" cy="10" r="2.5" /><path d="M3 20c0-4 3-6 6-6s6 2 6 6M15 15c3 0 6 1.5 6 5" /></svg>,
  more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>,
};

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'anon' | 'ready'>('loading');
  const [anonLang, setAnonLang] = useState<Lang>(guessLang());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const route = useRoute();

  const reload = useCallback(async () => {
    try {
      const m = await api<Me>('/me');
      setMe(m);
      setState('ready');
      setSoundsEnabled(m.sounds);
      try { localStorage.setItem('colomba.lang', m.lang); } catch { /* ignore */ }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setMe(null); setState('anon'); }
      else setState((s) => (s === 'loading' ? 'anon' : s));
    }
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 4000);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // последняя известная позиция обновляется при открытии приложения
  useEffect(() => {
    if (state === 'ready' && me?.hasLocation) void refreshLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // SSE: уведомления, пока приложение открыто, — со звуком курьера
  useEffect(() => {
    if (state !== 'ready') return;
    const es = new EventSource(`${API_BASE}/me/stream`, { withCredentials: true });
    es.addEventListener('notification', (ev) => {
      const n = JSON.parse((ev as MessageEvent).data);
      playCourier(n.courier);
      toast(n.text);
      setPulse((x) => x + 1);
      void reload();
    });
    return () => es.close();
  }, [state, reload, toast]);

  const lang: Lang = me?.lang ?? anonLang;
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);

  if (state === 'loading') return <div className="main"><Loading /></div>;

  if (state === 'anon' || !me) {
    if (route.path === '/legal') return <LangContext.Provider value={lang}><div className="main"><a href="#/">← Colomba</a><Legal /></div></LangContext.Provider>;
    return (
      <LangContext.Provider value={lang}>
        <Auth lang={anonLang} setLang={(l) => { setAnonLang(l); try { localStorage.setItem('colomba.lang', l); } catch { /* ignore */ } }} onDone={() => { void reload(); if (route.path !== '/') navigate('/'); }} />
      </LangContext.Provider>
    );
  }

  const session = { me, reload, toast, pulse };
  const p = route.parts;
  let screen: React.ReactNode;
  if (!me.onboarded) screen = <Onboarding />;
  else if (p[0] === 'mailbox') screen = <Mailbox />;
  else if (p[0] === 'letter' && p[1]) screen = <LetterView id={Number(p[1])} />;
  else if (p[0] === 'conversation' && p[1]) screen = <Conversation userId={Number(p[1])} />;
  else if (p[0] === 'write') screen = <Compose key={route.query.toString()} />;
  else if (p[0] === 'flight' && p[1]) screen = <Flight letterId={Number(p[1])} />;
  else if (p[0] === 'courier' && p[1] && p[2] === 'flight') screen = <CourierFlight courierId={Number(p[1])} />;
  else if (p[0] === 'catalog') screen = <Catalog />;
  else if (p[0] === 'album') screen = <Album />;
  else if (p[0] === 'shop') screen = <Shop />;
  else if (p[0] === 'friends') screen = <Friends />;
  else if (p[0] === 'user' && p[1]) screen = <Profile userId={Number(p[1])} />;
  else if (p[0] === 'invite' && p[1]) screen = <InviteLanding code={p[1]} />;
  else if (p[0] === 'settings') screen = <Settings />;
  else if (p[0] === 'notifications') screen = <Notifications />;
  else if (p[0] === 'admin') screen = <Admin />;
  else if (p[0] === 'more') screen = <More />;
  else if (p[0] === 'legal') screen = <Legal />;
  else screen = <Station />;

  const tab = (href: string, icon: React.ReactNode, label: string, active: boolean, badge?: number) => (
    <a href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
      {badge ? <span className="dot">{badge}</span> : null}
    </a>
  );

  return (
    <LangContext.Provider value={lang}>
      <SessionContext.Provider value={session}>
        <div className={`app ${me.animations ? '' : 'no-anim'}`}>
          <header className="topbar">
            <a className="brand" href="#/"><AppIcon size={28} /> Colomba</a>
            <span className="spacer" />
            {me.bannedUntil && new Date(me.bannedUntil) > new Date() && <small className="error">{t('err.banned')}</small>}
            <a href="#/shop" className="semi-badge" style={{ textDecoration: 'none', color: 'inherit' }}>{me.semi} <SeedIcon /></a>
          </header>
          <main className="main">{screen}</main>
          {me.onboarded && (
            <nav className="tabbar" aria-label="main">
              {tab('#/', Icon.station, t('nav.station'), p.length === 0 || p[0] === 'catalog')}
              {tab('#/mailbox', Icon.mail, t('nav.mailbox'), ['mailbox', 'letter', 'conversation', 'flight'].includes(p[0]), me.unreadLetters)}
              {tab('#/write', Icon.write, t('nav.write'), p[0] === 'write')}
              {tab('#/friends', Icon.friends, t('nav.friends'), ['friends', 'user'].includes(p[0]))}
              {tab('#/more', Icon.more, t('nav.more'), ['more', 'album', 'shop', 'settings', 'notifications', 'admin', 'legal'].includes(p[0]), me.unreadNotifications)}
            </nav>
          )}
          {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
        </div>
      </SessionContext.Provider>
    </LangContext.Provider>
  );
}
