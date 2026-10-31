import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { courierName } from '@colomba/shared';
import { api } from '../api';
import { CourierArt } from '../art/Couriers';
import { Avatar, ErrorText, Loading, UserName, useLoad } from '../components/ui';
import { useT } from '../i18n';
import { navigate } from '../router';
import { useSession } from '../state';
import { ReportModal } from './LetterView';

function locText(loc: any, lang: 'ru' | 'it', t: (k: string) => string): string {
  if (!loc) return '';
  const parts: string[] = [];
  if (loc.city) parts.push(loc.city[lang]);
  if (loc.country) parts.push(loc.country[lang]);
  if (loc.distanceKm !== undefined && loc.distanceKm !== null) parts.push(`${loc.distanceKm} ${t('common.km')}`);
  return parts.join(' · ');
}

export function Friends() {
  const { t, lang } = useT();
  const { me } = useSession();
  const [tab, setTab] = useState<'list' | 'add' | 'penpals'>('list');
  return (
    <div>
      <h1>{t('friends.title')}</h1>
      <div className="tabs">
        <button className={tab === 'list' ? 'small' : 'secondary small'} onClick={() => setTab('list')}>{t('friends.title')}</button>
        <button className={tab === 'add' ? 'small' : 'secondary small'} onClick={() => setTab('add')}>{t('friends.add')}</button>
        {me.kind === 'adult' && <button className={tab === 'penpals' ? 'small' : 'secondary small'} onClick={() => setTab('penpals')}>{t('friends.penpals')}</button>}
      </div>
      {tab === 'list' && <FriendList />}
      {tab === 'add' && <AddFriend />}
      {tab === 'penpals' && <Penpals />}
      <span hidden>{lang}</span>
    </div>
  );
}

function FriendList() {
  const { t, lang } = useT();
  const { pulse } = useSession();
  const { data, error, reload } = useLoad(() => api<any[]>('/friends'), [pulse]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <p className="muted center">{t('friends.empty')}</p>;
  return (
    <div>
      {data.map((f) => (
        <div key={f.friendshipId} className="card flat row">
          <Avatar code={f.user.avatar} />
          <a className="grow" href={`#/user/${f.user.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <UserName u={f.user} />
            <div><small className="muted">{f.status !== 'accepted' ? `${t(`friends.${f.status}`)} · ` : ''}{locText(f.location, lang, t)}</small></div>
          </a>
          {f.incoming ? (
            <button className="small" onClick={async () => { await api(`/friends/${f.friendshipId}/accept`, { body: {} }); reload(); }}>{t('mailbox.accept')}</button>
          ) : (f.status === 'accepted' || f.status === 'penpal') && (
            <a className="btn small" href={`#/write?to=${f.user.id}`}>{t('friends.write')}</a>
          )}
        </div>
      ))}
    </div>
  );
}

function AddFriend() {
  const { t } = useT();
  const { me, toast } = useSession();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [qr, setQr] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const link = `${window.location.origin}${import.meta.env.BASE_URL}#/invite/${me.inviteCode}`;
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 400, color: { dark: '#3b2a1a', light: '#ffffff' } }).then(setQr); }, [link]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.replace('@', '').length < 2) return;
    setResults(await api(`/users/search?q=${encodeURIComponent(q)}`));
  }
  async function request(userId: number) {
    try { await api('/friends/request', { body: { userId } }); toast(t('friends.requested')); } catch (e) { setErr(e); }
  }
  async function contacts() {
    const nav: any = navigator;
    if (!nav.contacts?.select) { toast(t('friends.contactsNone')); return; }
    const picked = await nav.contacts.select(['email'], { multiple: true });
    const emails = picked.flatMap((c: any) => c.email ?? []);
    setResults(await api('/friends/contacts', { body: { emails } }));
  }

  return (
    <div>
      <div className="card">
        <h3>{t('friends.byNick')}</h3>
        <form className="row" onSubmit={search}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="@nick" autoCapitalize="none" />
          <button>{t('common.search')}</button>
        </form>
        {results && results.map((u) => (
          <div key={u.id} className="row" style={{ marginTop: 8 }}>
            <Avatar code={u.avatar} />
            <a className="grow" href={`#/user/${u.id}`}><UserName u={u} /></a>
            <button className="small" onClick={() => request(u.id)}>{t('friends.request')}</button>
          </div>
        ))}
        <ErrorText error={err} />
      </div>
      <div className="card center">
        <h3>{t('friends.qr')}</h3>
        {qr && <img className="qr" src={qr} alt="QR" />}
        <p style={{ wordBreak: 'break-all' }}><small>{link}</small></p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="secondary small" onClick={() => { navigator.clipboard.writeText(link); toast(t('common.copied')); }}>{t('common.copy')}</button>
          {'share' in navigator && <button className="small" onClick={() => navigator.share({ title: 'Colomba', url: link }).catch(() => {})}>{t('friends.share')}</button>}
        </div>
      </div>
      {me.kind === 'adult' && (
        <div className="card">
          <h3>{t('friends.contacts')}</h3>
          <p className="muted">{t('friends.contactsWhy')}</p>
          <button className="secondary" onClick={contacts}>{t('friends.contacts')}</button>
        </div>
      )}
    </div>
  );
}

function Penpals() {
  const { t, lang } = useT();
  const { me, reload: reloadMe } = useSession();
  const [mode, setMode] = useState<'interests' | 'language' | 'near' | 'far' | 'random'>('random');
  const { data, error } = useLoad(() => api<any[]>(`/penpals?mode=${mode}`), [mode]);
  return (
    <div>
      <label className="check card flat">
        <input type="checkbox" checked={me.penpalEnabled} onChange={async (e) => { await api('/me', { method: 'PATCH', body: { penpalEnabled: e.target.checked } }); reloadMe(); }} />
        {t('penpal.enable')}
      </label>
      <div className="tabs">
        {(['random', 'interests', 'language', 'near', 'far'] as const).map((m) => (
          <button key={m} className={mode === m ? 'small' : 'secondary small'} onClick={() => setMode(m)}>{t(`penpal.mode.${m}`)}</button>
        ))}
      </div>
      <a className="card flat row" href="#/write?bottle=1" style={{ textDecoration: 'none', color: 'inherit' }}>
        <CourierArt code="bottle" size={48} />
        <div><b>{t('friends.bottle')}</b><br /><small className="muted">{t('compose.bottleHint')}</small></div>
      </a>
      <ErrorText error={error} />
      {!data ? <Loading /> : data.map((p) => (
        <div key={p.id} className="card row">
          <Avatar code={p.avatar} size={48} />
          <div className="grow">
            <a href={`#/user/${p.id}`}><UserName u={p} /></a>
            <div><small className="muted">{locText(p.location, lang, t)}</small></div>
            <div><small>{(p.interests ?? []).map((i: any) => i[lang]).join(', ')}</small></div>
          </div>
          <button className="small" onClick={async () => { await api(`/penpals/${p.id}/connect`, { body: {} }); navigate(`/write?to=${p.id}`); }}>{t('penpal.connect')}</button>
        </div>
      ))}
    </div>
  );
}

/** Профиль: имя, аватар, страна; интересы и языки; коллекция курьеров; статистика. */
export function Profile({ userId }: { userId: number }) {
  const { t, lang } = useT();
  const { me, toast } = useSession();
  const { data: p, error, reload } = useLoad(() => api(`/users/${userId}`), [userId]);
  const [report, setReport] = useState(false);
  if (error) return <ErrorText error={error} />;
  if (!p) return <Loading />;
  return (
    <div>
      <div className="card center">
        <Avatar code={p.avatar} size={96} />
        <h1 style={{ marginTop: 8 }}>{p.username === 'postmaster' ? (lang === 'it' ? 'Mastro postino' : 'Почтмейстер') : p.displayName}</h1>
        <div className="muted">@{p.username}</div>
        {p.location && <p>{locText(p.location, lang, t)}</p>}
        {p.bio && <p>{p.bio}</p>}
        {p.stats && <p className="muted">{p.stats.lettersSent} {t('profile.letters')} · {p.stats.km} {t('common.km')}</p>}
        {me.id !== p.id && !p.restricted && (
          <div className="row" style={{ justifyContent: 'center' }}>
            {p.friendship === 'accepted' || p.friendship === 'penpal' ? (
              <a className="btn" href={`#/write?to=${p.id}`}>{t('friends.write')}</a>
            ) : p.friendship === 'pending' ? <span className="muted">{t('friends.pending')}</span> : (
              <button onClick={async () => { await api('/friends/request', { body: { userId: p.id } }); toast(t('friends.requested')); reload(); }}>{t('friends.request')}</button>
            )}
          </div>
        )}
      </div>
      {p.interests?.length > 0 && (
        <div className="card"><h3>{t('profile.interests')}</h3><div className="row wrap">{p.interests.map((i: any) => <span key={i.code} className="chip">{i[lang]}</span>)}</div></div>
      )}
      {p.languages?.length > 0 && <div className="card"><h3>{t('profile.languages')}</h3>{p.languages.join(', ').toUpperCase()}</div>}
      {p.collection?.length > 0 && (
        <div className="card">
          <h3>{t('profile.collection')}</h3>
          <div className="row wrap">{p.collection.map((c: string) => <span key={c} title={courierName(c, lang)}><CourierArt code={c} size={44} /></span>)}</div>
        </div>
      )}
      {me.id !== p.id && p.username !== 'postmaster' && (
        <div className="row">
          <button className="ghost small" onClick={() => setReport(true)}>⚑ {t('letter.report')}</button>
          <button className="ghost small" onClick={async () => { await api('/blocks', { body: { userId: p.id } }); toast(t('common.done')); }}>⊘ {t('letter.block')}</button>
          {(p.friendship === 'accepted' || p.friendship === 'penpal') && (
            <button className="ghost small" onClick={async () => { await api(`/friends/${p.id}`, { method: 'DELETE' }); reload(); }}>{t('friends.remove')}</button>
          )}
        </div>
      )}
      {report && <ReportModal userId={p.id} onClose={() => setReport(false)} />}
    </div>
  );
}

/** Ссылка-приглашение: кто зовёт в Colomba. */
export function InviteLanding({ code }: { code: string }) {
  const { t } = useT();
  const { toast } = useSession();
  const { data, error } = useLoad(() => api(`/invite/${code}`), [code]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  if (data.kind !== 'user') return <p>{t('common.done')}</p>;
  return (
    <div className="card center">
      <Avatar code={data.user.avatar} size={80} />
      <h2><UserName u={data.user} /></h2>
      <button onClick={async () => { await api('/friends/request', { body: { inviteCode: code } }); toast(t('friends.requested')); navigate('/friends'); }}>{t('friends.request')}</button>
    </div>
  );
}
