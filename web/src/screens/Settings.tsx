import { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../api';
import { AppIcon } from '../art/Misc';
import { AVATAR_CHOICES, Avatar, ErrorText, Loading, Modal, Segmented, UserName, useLoad } from '../components/ui';
import { refreshLocation } from '../geo';
import { formatDate, useT } from '../i18n';
import { pushActive, pushSupported, subscribePush, unsubscribePush } from '../push';
import { useSession } from '../state';

export function getTheme(): 'auto' | 'light' | 'dark' {
  try { return (localStorage.getItem('colomba.theme') as any) ?? 'auto'; } catch { return 'auto'; }
}
export function applyTheme(v: 'auto' | 'light' | 'dark') {
  if (v === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', v);
  try { localStorage.setItem('colomba.theme', v); } catch { /* приватный режим */ }
}

export function Settings() {
  const { t, lang } = useT();
  const { me, reload, toast } = useSession();
  const interests = useLoad(() => api<any[]>('/interests'), []);
  const [push, setPush] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const [err, setErr] = useState<unknown>(null);
  const [profile, setProfile] = useState({ displayName: me.displayName, bio: me.bio, languages: me.languages.join(', ') });
  useEffect(() => { pushActive().then(setPush); }, []);

  async function patch(body: Record<string, unknown>) {
    setErr(null);
    try { await api('/me', { method: 'PATCH', body }); await reload(); } catch (e) { setErr(e); }
  }

  return (
    <div>
      <h1>{t('settings.title')}</h1>
      <ErrorText error={err} />

      <section className="card">
        <h2>{t('settings.profile')}</h2>
        <div className="field">
          <label>{t('settings.lang')}</label>
          <Segmented value={me.lang} options={[{ value: 'ru', label: 'Русский' }, { value: 'it', label: 'Italiano' }]} onChange={(v) => patch({ lang: v })} />
        </div>
        <div className="field">
          <label>{t('settings.avatar')}</label>
          <div className="row wrap">
            {AVATAR_CHOICES.map((a) => (
              <button key={a} className="ghost" style={{ minHeight: 0, padding: 2, outline: me.avatar === a ? '3px solid var(--wax)' : 'none', borderRadius: '50%' }} onClick={() => patch({ avatar: a })}>
                <Avatar code={a} size={44} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t('auth.displayName')}</label>
          <input value={profile.displayName} maxLength={64} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('settings.bio')}</label>
          <textarea value={profile.bio} maxLength={500} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('profile.languages')} (ru, it, en…)</label>
          <input value={profile.languages} onChange={(e) => setProfile({ ...profile, languages: e.target.value })} />
        </div>
        <button onClick={() => patch({
          displayName: profile.displayName, bio: profile.bio,
          languages: profile.languages.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z]{2}$/.test(s)),
        }).then(() => toast(t('common.saved')))}>{t('common.save')}</button>
        {interests.data && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>{t('profile.interests')}</label>
            <div className="row wrap">
              {interests.data.map((i) => {
                const on = me.interests.includes(i.code);
                return <button key={i.code} className={`chip ${on ? 'on' : ''}`} onClick={() => patch({ interests: on ? me.interests.filter((x) => x !== i.code) : [...me.interests, i.code] })}>{i[lang]}</button>;
              })}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t('settings.privacy')}</h2>
        <div className="field">
          <label>{t('settings.locPrecision')}</label>
          <Segmented value={me.locationPrecision} options={(['city', 'country', 'distance'] as const).map((v) => ({ value: v, label: t(`settings.loc.${v}`) }))} onChange={(v) => patch({ locationPrecision: v })} />
        </div>
        {me.kind === 'adult' && (
          <div className="field">
            <label>{t('settings.whoCanWrite')}</label>
            <select value={me.whoCanWrite} onChange={(e) => patch({ whoCanWrite: e.target.value })}>
              {(['friends', 'friends_penpals', 'everyone'] as const).map((v) => <option key={v} value={v}>{t(`settings.who.${v}`)}</option>)}
            </select>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={me.readReceipts} onChange={(e) => patch({ readReceipts: e.target.checked })} /> {t('settings.readReceipts')}</label>
        {me.kind === 'adult' && (
          <>
            <label className="check"><input type="checkbox" checked={me.penpalEnabled} onChange={(e) => patch({ penpalEnabled: e.target.checked })} /> {t('penpal.enable')}</label>
            <label className="check"><input type="checkbox" checked={me.bottleEnabled} onChange={(e) => patch({ bottleEnabled: e.target.checked })} /> {t('settings.bottle')}</label>
          </>
        )}
        <button className="secondary small" onClick={async () => { const p = await refreshLocation(); toast(p ? t('onb.locationOk') : t('err.no_sender_location')); reload(); }}>{t('settings.updateLocation')}</button>
        {me.location && <p><small className="muted">{formatDate(me.location.updatedAt, lang)}</small></p>}
        <Blocked />
      </section>

      <section className="card">
        <h2>{t('settings.notifications')}</h2>
        {pushSupported() ? (
          <label className="check">
            <input type="checkbox" checked={push} onChange={async (e) => {
              if (e.target.checked) setPush(await subscribePush(me.vapidPublicKey));
              else { await unsubscribePush(); setPush(false); }
            }} />
            {t('settings.push')}: {push ? t('settings.pushOn') : t('settings.pushOff')}
          </label>
        ) : <p className="muted">{t('onb.installIos')}</p>}
        <label className="check"><input type="checkbox" checked={me.notifyTripEvents} onChange={(e) => patch({ notifyTripEvents: e.target.checked })} /> {t('settings.tripEvents')}</label>
        <label className="check"><input type="checkbox" checked={me.dailyDigest} onChange={(e) => patch({ dailyDigest: e.target.checked, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })} /> {t('settings.digest')}</label>
        <label className="check"><input type="checkbox" checked={me.sounds} onChange={(e) => patch({ sounds: e.target.checked })} /> {t('settings.sounds')}</label>
        <label className="check"><input type="checkbox" checked={me.animations} onChange={(e) => patch({ animations: e.target.checked })} /> {t('settings.animations')}</label>
        <div className="field">
          <label>{t('settings.theme')}</label>
          <Segmented value={theme} options={(['auto', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))} onChange={(v) => { setTheme(v); applyTheme(v); }} />
        </div>
      </section>

      {me.kind === 'adult' && <Children />}
      <Security />

      <section className="card">
        <h2>{t('settings.about')}</h2>
        <div className="row"><AppIcon size={48} /><p style={{ margin: 0 }}>{t('about.text')}</p></div>
        <p><a href="#/legal">{t('settings.legal')}</a></p>
        <About />
      </section>

      <DeleteAccount />
    </div>
  );
}

function Blocked() {
  const { t } = useT();
  const { data, reload } = useLoad(() => api<any[]>('/blocks'), []);
  if (!data?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <h3>{t('settings.blocked')}</h3>
      {data.map((u) => (
        <div key={u.id} className="row" style={{ marginBottom: 6 }}>
          <span className="grow"><UserName u={u} /></span>
          <button className="small secondary" onClick={async () => { await api(`/blocks/${u.id}`, { method: 'DELETE' }); reload(); }}>{t('settings.unblock')}</button>
        </div>
      ))}
    </div>
  );
}

/** Детские профили: создаёт родитель; каждого друга одобряет родитель. */
function Children() {
  const { t } = useT();
  const kids = useLoad(() => api<any[]>('/me/children'), []);
  const reqs = useLoad(() => api<any[]>('/me/children/requests'), []);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [f, setF] = useState({ displayName: '', username: '', birthDate: '', lang: 'ru', consent: false });
  const [err, setErr] = useState<unknown>(null);
  return (
    <section className="card" id="children">
      <h2>{t('settings.children')}</h2>
      <p className="muted">{t('children.rules')}</p>
      {(reqs.data ?? []).length > 0 && (
        <div className="card flat">
          <h3>{t('children.requests')}</h3>
          {reqs.data!.map((r) => (
            <div key={r.id} className="row" style={{ marginBottom: 6 }}>
              <span className="grow">{t('children.wants', { other: `${r.other.displayName} (@${r.other.username})`, child: r.child.displayName })}</span>
              <button className="small" onClick={async () => { await api(`/me/children/requests/${r.id}/approve`, { body: {} }); reqs.reload(); }}>{t('children.approve')}</button>
              <button className="small secondary" onClick={async () => { await api(`/me/children/requests/${r.id}/decline`, { body: {} }); reqs.reload(); }}>{t('mailbox.decline')}</button>
            </div>
          ))}
        </div>
      )}
      {(kids.data ?? []).map((k) => (
        <div key={k.id} className="row" style={{ marginBottom: 8 }}>
          <Avatar code={k.avatar} />
          <span className="grow"><UserName u={k} /></span>
          <button className="small" onClick={async () => setCode((await api(`/me/children/${k.id}/device-code`, { body: {} })).code)}>{t('children.deviceCode')}</button>
        </div>
      ))}
      {adding ? (
        <form onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try { await api('/me/children', { body: f }); setAdding(false); kids.reload(); } catch (x) { setErr(x); }
        }}>
          <div className="field"><label>{t('auth.displayName')}</label><input required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></div>
          <div className="field"><label>{t('auth.username')}</label><input required pattern="[a-zA-Z0-9_.]{3,32}" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div className="field"><label>{t('auth.birthDate')}</label><input type="date" required value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /></div>
          <div className="field"><label>{t('auth.lang')}</label><Segmented value={f.lang} options={[{ value: 'ru', label: 'RU' }, { value: 'it', label: 'IT' }]} onChange={(v) => setF({ ...f, lang: v })} /></div>
          <label className="check"><input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /> {t('children.consent')}</label>
          <ErrorText error={err} />
          <button>{t('children.add')}</button>
        </form>
      ) : <button className="secondary" onClick={() => setAdding(true)}>{t('children.add')}</button>}
      {code && (
        <Modal onClose={() => setCode(null)} title={t('children.deviceCode')}>
          <p style={{ fontSize: '2rem', letterSpacing: '0.25em', textAlign: 'center', fontWeight: 700 }}>{code}</p>
          <p className="muted">{t('children.codeHint')}</p>
          <button className="block" onClick={() => setCode(null)}>{t('common.close')}</button>
        </Modal>
      )}
    </section>
  );
}

function Security() {
  const { t, lang } = useT();
  const { me, toast } = useSession();
  const keys = useLoad(() => api<any[]>('/me/passkeys'), []);
  const [pw, setPw] = useState({ current: '', password: '' });
  const [err, setErr] = useState<unknown>(null);
  return (
    <section className="card">
      <h2>{t('settings.security')}</h2>
      {me.email && <p className="muted">{me.email}</p>}
      <h3>{t('settings.passkeys')}</h3>
      {(keys.data ?? []).map((k) => (
        <div key={k.id} className="row">
          <span className="grow">🔑 {k.name ?? 'passkey'} <small className="muted">{formatDate(k.createdAt, lang, false)}</small></span>
          <button className="small secondary" onClick={async () => { await api(`/me/passkeys/${k.id}`, { method: 'DELETE' }); keys.reload(); }}>{t('common.delete')}</button>
        </div>
      ))}
      {'PublicKeyCredential' in window && (
        <button className="secondary small" onClick={async () => {
          setErr(null);
          try {
            const { challengeId, options } = await api('/auth/passkey/register/options', { body: {} });
            const response = await startRegistration({ optionsJSON: options });
            await api('/auth/passkey/register/verify', { body: { challengeId, response, name: navigator.platform } });
            keys.reload();
          } catch (e) { setErr(e); }
        }}>{t('settings.addPasskey')}</button>
      )}
      {me.kind === 'adult' && (
        <form style={{ marginTop: 12 }} onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try { await api('/me/password', { body: pw }); toast(t('common.saved')); setPw({ current: '', password: '' }); } catch (x) { setErr(x); }
        }}>
          <h3>{t('settings.changePassword')}</h3>
          <div className="field"><label>{t('settings.currentPassword')}</label><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div className="field"><label>{t('settings.newPassword')}</label><input type="password" autoComplete="new-password" minLength={8} required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></div>
          <button className="secondary">{t('common.save')}</button>
        </form>
      )}
      <ErrorText error={err} />
      <p style={{ marginTop: 12 }}>
        <button className="ghost" onClick={async () => {
          const data = await api('/me/export');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
          a.download = 'colomba-export.json';
          a.click();
        }}>⬇ {t('settings.export')}</button>
      </p>
      <button className="secondary" onClick={async () => { await api('/auth/logout', { body: {} }); window.location.hash = '#/'; window.location.reload(); }}>{t('auth.logout')}</button>
    </section>
  );
}

function About() {
  const { t } = useT();
  const { data } = useLoad(() => api('/about'), []);
  if (!data) return <Loading />;
  return (
    <>
      <h3>{t('about.attribution')}</h3>
      <ul>{data.attributions.map((a: any) => <li key={a.name}><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> — {a.license}</li>)}</ul>
    </>
  );
}

function DeleteAccount() {
  const { t } = useT();
  const { me } = useSession();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<unknown>(null);
  if (me.kind === 'child') return null;
  return (
    <section className="card">
      <h2>{t('settings.danger')}</h2>
      <p>{t('settings.deleteWarn')}</p>
      <div className="field"><label>{t('settings.deleteConfirm')}</label><input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      <div className="field"><label>{t('auth.password')}</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <ErrorText error={err} />
      <button disabled={confirm !== 'DELETE'} onClick={async () => {
        try { await api('/me', { method: 'DELETE', body: { confirm, password } }); window.location.hash = '#/'; window.location.reload(); } catch (e) { setErr(e); }
      }}>{t('settings.deleteBtn')}</button>
    </section>
  );
}
