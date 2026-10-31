import { useState } from 'react';
import { courierName } from '@colomba/shared';
import { api, mediaUrl } from '../api';
import { CourierArt } from '../art/Couriers';
import { ErrorText, Loading, Modal, useLoad } from '../components/ui';
import { formatDate, useT } from '../i18n';
import { useSession } from '../state';

type Tab = 'reports' | 'stats' | 'couriers' | 'catalog' | 'broadcasts' | 'invites' | 'users';

/** Админ-панель: курьеры и события, жалобы и баны, статистика, рассылки. */
export function Admin() {
  const { t } = useT();
  const { me } = useSession();
  const [tab, setTab] = useState<Tab>('reports');
  if (me.role !== 'admin') return <p className="error">403</p>;
  const tabs: [Tab, string][] = [
    ['reports', t('admin.reports')], ['stats', t('admin.stats')], ['couriers', t('admin.couriers')], ['catalog', 'Items · Events · Achievements'],
    ['broadcasts', t('admin.broadcasts')], ['invites', t('admin.invites')], ['users', t('admin.users')],
  ];
  return (
    <div>
      <h1>{t('admin.title')}</h1>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'small' : 'secondary small'} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'reports' && <Reports />}
      {tab === 'stats' && <Stats />}
      {tab === 'couriers' && <CourierTypes />}
      {tab === 'catalog' && <JsonCatalog />}
      {tab === 'broadcasts' && <Broadcasts />}
      {tab === 'invites' && <Invites />}
      {tab === 'users' && <Users />}
    </div>
  );
}

function Reports() {
  const { lang } = useT();
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const { data, error, reload } = useLoad(() => api<any[]>(`/admin/reports?status=${status}`), [status]);
  const [reason, setReason] = useState('');
  const act = async (id: number, action: string, banDays?: number | null) => {
    await api(`/admin/reports/${id}/resolve`, { body: { action, banDays, reason } });
    reload();
  };
  return (
    <div>
      <div className="tabs">{(['open', 'resolved', 'dismissed'] as const).map((s) => <button key={s} className={status === s ? 'small' : 'secondary small'} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <ErrorText error={error} />
      {!data ? <Loading /> : data.map((r) => (
        <div key={r.id} className="card">
          <div className="row between wrap">
            <b>#{r.id} · {r.reason}</b>
            <small className="muted">{formatDate(r.created_at, lang)}</small>
          </div>
          <p>@{r.reporter_username} → <b>@{r.target_username}</b> ({r.target_name}) · {r.priorReports} reports {r.banned_until && new Date(r.banned_until) > new Date() ? '· BANNED' : ''}</p>
          {r.comment && <p className="muted">«{r.comment}»</p>}
          {r.letter_body && <pre className="code">{r.letter_body}</pre>}
          {r.media?.map((m: any) => m.kind === 'voice' ? <audio key={m.id} controls src={mediaUrl(m.id)} /> : <img key={m.id} className="media-thumb" src={mediaUrl(m.id)} alt="" />)}
          {status === 'open' && (
            <>
              <input placeholder="reason / причина" value={reason} onChange={(e) => setReason(e.target.value)} style={{ margin: '8px 0' }} />
              <div className="row wrap">
                <button className="small secondary" onClick={() => act(r.id, 'dismiss')}>dismiss</button>
                {r.letter_id && <button className="small secondary" onClick={() => act(r.id, 'delete_letter')}>delete letter</button>}
                <button className="small secondary" onClick={() => act(r.id, 'warn')}>warn</button>
                <button className="small" onClick={() => act(r.id, 'ban', 7)}>ban 7d</button>
                <button className="small" onClick={() => act(r.id, 'ban', 30)}>ban 30d</button>
                <button className="small" onClick={() => confirm('Ban forever?') && act(r.id, 'ban', null)}>ban ∞</button>
              </div>
            </>
          )}
        </div>
      ))}
      {data && !data.length && <p className="muted">—</p>}
    </div>
  );
}

function Stats() {
  const { data, error } = useLoad(() => api('/admin/stats'), []);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  return (
    <div>
      <div className="grid3">
        {[['users', data.users], ['children', data.children], ['active today', data.activeToday], ['active 7d', data.active7d], ['online', data.onlineNow],
          ['in flight', data.couriersInFlight], ['waiting', data.couriersWaiting], ['open reports', data.openReports], ['route cache', data.routeCache], ['media', mb(data.mediaBytes)],
          ['disk free', data.disk ? `${mb(data.disk.freeBytes)} / ${mb(data.disk.totalBytes)}` : '—']].map(([k, v]) => (
          <div key={k as string} className="card center"><div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{v as any}</div><small className="muted">{k as string}</small></div>
        ))}
      </div>
      <h3>Letters / day</h3>
      <Bars rows={data.lettersByDay} />
      <h3>Registrations / day</h3>
      <Bars rows={data.registrationsByDay} />
      <h3>API usage (ORS / GraphHopper / Open-Meteo)</h3>
      <div className="scroll-x">
        <table className="simple">
          <thead><tr><th>day</th><th>service</th><th>count</th><th>errors</th></tr></thead>
          <tbody>{data.apiUsage.map((u: any, i: number) => <tr key={i}><td>{String(u.day).slice(0, 10)}</td><td>{u.service}</td><td>{u.count}</td><td>{u.errors}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Bars({ rows }: { rows: { day: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.n)));
  if (!rows.length) return <p className="muted">—</p>;
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
      {rows.map((r) => (
        <div key={r.day} title={`${String(r.day).slice(0, 10)}: ${r.n}`} style={{ flex: 1, background: 'var(--wax)', height: `${(100 * Number(r.n)) / max}%`, minHeight: 2, borderRadius: '2px 2px 0 0' }} />
      ))}
    </div>
  );
}

function CourierTypes() {
  const { lang } = useT();
  const { data, error, reload } = useLoad(() => api<any[]>('/admin/courier-types'), []);
  const tariffs = useLoad(() => api<any[]>('/admin/tariffs'), []);
  const [edit, setEdit] = useState<any | null>(null);
  const [tariffEdit, setTariffEdit] = useState<any | null>(null);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  return (
    <div>
      <button className="small" onClick={() => setEdit({ code: '', section: 'birds', speedKmh: 50, nightMode: 'rest', routeKind: 'air', capacity: { text: 500, photos: 0, drawings: 0, voiceSec: 0 }, unlock: { kind: 'semi', price: 50 }, look: 'scroll_leg', sound: 'wings', sort: 200, enabled: true })}>+ new courier</button>
      {data.map((c) => (
        <div key={c.code} className="card flat row" style={{ opacity: c.enabled ? 1 : 0.5 }}>
          <CourierArt code={c.code} size={44} />
          <div className="grow">
            <b>{c.nameRu ?? courierName(c.code, lang)}</b> <small className="muted">{c.code} · {c.speedKmh} km/h · {c.nightMode} · {c.routeKind}</small>
            <div><small>{JSON.stringify(c.capacity)} · {JSON.stringify(c.unlock)}</small></div>
          </div>
          <button className="small secondary" onClick={() => setEdit(c)}>edit</button>
        </div>
      ))}
      <h3>Post tariffs</h3>
      {tariffs.data?.map((tf) => (
        <div key={tf.code} className="card flat row">
          <div className="grow"><b>{tf.code}</b> <small>{tf.car_kmh} km/h · {tf.hours_per_day} h/day · plane {tf.plane_kmh ?? '—'} · sorting {tf.sorting_hours} h</small></div>
          <button className="small secondary" onClick={() => setTariffEdit({ code: tf.code, carKmh: tf.car_kmh, hoursPerDay: tf.hours_per_day, planeKmh: tf.plane_kmh, sortingHours: tf.sorting_hours, unlock: typeof tf.unlock_rule === 'string' ? JSON.parse(tf.unlock_rule) : tf.unlock_rule })}>edit</button>
        </div>
      ))}
      {edit && <JsonEdit title={`courier: ${edit.code || 'new'}`} value={edit} onClose={() => setEdit(null)} onSave={async (v) => {
        const { code, illustration, ...rest } = v;
        await api(`/admin/courier-types/${code}`, { method: 'PUT', body: { ...rest, illustration: illustration ?? null } });
        setEdit(null);
        reload();
      }} />}
      {tariffEdit && <JsonEdit title={`tariff: ${tariffEdit.code}`} value={tariffEdit} onClose={() => setTariffEdit(null)} onSave={async (v) => {
        const { code, ...rest } = v;
        await api(`/admin/tariffs/${code}`, { method: 'PUT', body: rest });
        setTariffEdit(null);
        tariffs.reload();
      }} />}
    </div>
  );
}

function JsonEdit({ title, value, onSave, onClose }: { title: string; value: any; onSave: (v: any) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal onClose={onClose} title={title}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 360, fontFamily: 'monospace', fontSize: 13 }} />
      <ErrorText error={err} />
      <button className="block" onClick={async () => {
        try { await onSave(JSON.parse(text)); } catch (e) { setErr(e); }
      }}>Save</button>
    </Modal>
  );
}

function JsonCatalog() {
  const [kind, setKind] = useState<'items' | 'events' | 'achievements'>('items');
  const { data, reload } = useLoad(() => api<any[]>(`/admin/${kind}`), [kind]);
  const [edit, setEdit] = useState<any | null>(null);
  const toBody = (r: any) => kind === 'items'
    ? { code: r.code, kind: r.kind, price: r.price, free: !!r.free, eventCode: r.event_code, nameRu: r.name_ru, nameIt: r.name_it, data: r.data, sort: r.sort, enabled: !!r.enabled }
    : kind === 'events'
      ? { code: r.code, kind: r.kind, nameRu: r.name_ru, nameIt: r.name_it, startMd: r.start_md, endMd: r.end_md, params: r.params, enabled: !!r.enabled }
      : { code: r.code, category: r.category, threshold: r.threshold, reward: r.reward, nameRu: r.name_ru, nameIt: r.name_it, descRu: r.desc_ru, descIt: r.desc_it, sort: r.sort, enabled: !!r.enabled };
  return (
    <div>
      <div className="tabs">{(['items', 'events', 'achievements'] as const).map((k) => <button key={k} className={kind === k ? 'small' : 'secondary small'} onClick={() => setKind(k)}>{k}</button>)}</div>
      <button className="small" onClick={() => setEdit({ code: 'new_code' })}>+ new</button>
      {!data ? <Loading /> : (
        <div className="scroll-x">
          <table className="simple">
            <tbody>
              {data.map((r) => (
                <tr key={r.code}>
                  <td><b>{r.code}</b></td><td>{r.name_ru}</td><td>{r.kind ?? r.category}</td><td>{r.price ?? r.reward ?? `${r.start_md}–${r.end_md}`}</td>
                  <td><button className="small secondary" onClick={() => setEdit(toBody(r))}>edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <JsonEdit title={`${kind}: ${edit.code}`} value={edit} onClose={() => setEdit(null)} onSave={async (v) => {
        const { code, ...rest } = v;
        await api(`/admin/${kind}/${code}`, { method: 'PUT', body: rest });
        setEdit(null);
        reload();
      }} />}
    </div>
  );
}

function Broadcasts() {
  const { lang } = useT();
  const { data, reload } = useLoad(() => api<any[]>('/admin/broadcasts'), []);
  const [f, setF] = useState({ textRu: '', textIt: '' });
  const [err, setErr] = useState<unknown>(null);
  return (
    <div>
      <div className="card">
        <p className="muted">Письмо от почтмейстера всем пользователям · Lettera del mastro postino a tutti</p>
        <div className="field"><label>RU</label><textarea value={f.textRu} onChange={(e) => setF({ ...f, textRu: e.target.value })} /></div>
        <div className="field"><label>IT</label><textarea value={f.textIt} onChange={(e) => setF({ ...f, textIt: e.target.value })} /></div>
        <ErrorText error={err} />
        <button disabled={!f.textRu || !f.textIt} onClick={async () => {
          if (!confirm('Send to everyone?')) return;
          try { await api('/admin/broadcasts', { body: f }); setF({ textRu: '', textIt: '' }); reload(); } catch (e) { setErr(e); }
        }}>Send</button>
      </div>
      {data?.map((b) => <div key={b.id} className="card flat"><small className="muted">{formatDate(b.sent_at, lang)} · {b.recipients}</small><p>{b.text_ru}</p></div>)}
    </div>
  );
}

function Invites() {
  const { data, reload } = useLoad(() => api<any[]>('/admin/invites'), []);
  const [uses, setUses] = useState(5);
  const [note, setNote] = useState('');
  const [last, setLast] = useState<string | null>(null);
  return (
    <div>
      <div className="card row wrap">
        <input type="number" min={1} value={uses} onChange={(e) => setUses(Number(e.target.value))} style={{ width: 90 }} />
        <input placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} className="grow" />
        <button onClick={async () => { const r = await api('/admin/invites', { body: { uses, note } }); setLast(r.link); reload(); }}>Create</button>
      </div>
      {last && <p style={{ wordBreak: 'break-all' }}><code>{last}</code></p>}
      <table className="simple"><tbody>{data?.map((i) => <tr key={i.code}><td><code>{i.code}</code></td><td>{i.uses_left}</td><td>{i.note}</td></tr>)}</tbody></table>
    </div>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const { data, reload } = useLoad(() => api<any[]>(`/admin/users?q=${encodeURIComponent(q)}`), [q]);
  return (
    <div>
      <input placeholder="search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll-x">
        <table className="simple">
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td><td>@{u.username}<br /><small>{u.email}</small></td><td>{u.kind}/{u.role}</td><td>{u.letters_sent}</td>
                <td>{u.banned_until && new Date(u.banned_until) > new Date() ? <button className="small secondary" onClick={async () => { await api(`/admin/users/${u.id}/unban`, { body: {} }); reload(); }}>unban</button> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
