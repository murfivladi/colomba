import { useState } from 'react';
import { courierName, DEFAULT_COURIER_TYPES } from '@colomba/shared';
import { api } from '../api';
import { CourierArt } from '../art/Couriers';
import { LetterLook } from '../art/Misc';
import { Avatar, ErrorText, Loading, UserName, useLoad } from '../components/ui';
import { formatDate, useT } from '../i18n';
import { useRoute } from '../router';
import { useSession } from '../state';

export const lookOf = (code: string | null) => DEFAULT_COURIER_TYPES.find((c) => c.code === code)?.look ?? 'stamped_envelope';

export function EnvelopeTile({ l, me }: { l: any; me: number }) {
  const { t, lang } = useT();
  const mine = l.from?.id === me;
  const other = mine ? l.to : l.from;
  const unread = !mine && l.status === 'delivered' && !l.readAt;
  const href = l.status === 'draft' || l.status === 'scheduled' || l.status === 'queued' ? `#/write?draft=${l.id}` : `#/letter/${l.id}`;
  return (
    <a className={`envelope-tile ${unread ? 'unread' : ''}`} href={href}>
      <LetterLook look={l.kind === 'postcard' ? 'stamped_envelope' : lookOf(l.courierType)} />
      <div className="grow">
        <div className="ellipsis">
          {mine ? `${t('letter.to')}: ` : `${t('letter.from')}: `}
          {l.isBottle && !other ? t('letter.someone') : <UserName u={other} />}
        </div>
        <small className="muted">
          {l.kind === 'postcard' ? `${t('letter.postcard')} · ` : ''}
          {l.status === 'delivered' ? formatDate(l.deliveredAt, lang)
            : l.status === 'in_transit' ? `${t('letter.inTransit')} → ${formatDate(l.arriveAt, lang)}`
            : l.status === 'scheduled' ? t('letter.scheduled', { t: formatDate(l.releaseAt, lang) })
            : l.status === 'queued' ? t('letter.queued')
            : t('mailbox.drafts')}
          {l.courierType ? ` · ${courierName(l.courierType, lang)}` : ''}
        </small>
      </div>
      {unread && <span className="dot" style={{ position: 'static' }}>•</span>}
    </a>
  );
}

type Tab = 'inbox' | 'conversations' | 'outbox' | 'drafts' | 'box';

export function Mailbox() {
  const { t, lang } = useT();
  const { me, reload: reloadMe } = useSession();
  const route = useRoute();
  const [tab, setTab] = useState<Tab>((route.query.get('tab') as Tab) ?? 'inbox');
  const tabs: Tab[] = ['inbox', 'conversations', 'outbox', 'drafts', 'box'];
  const label: Record<Tab, string> = {
    inbox: t('mailbox.title'), conversations: t('mailbox.conversations'), outbox: t('mailbox.outbox'), drafts: t('mailbox.drafts'), box: t('mailbox.box'),
  };
  return (
    <div>
      <div className="tabs">
        {tabs.map((x) => <button key={x} className={tab === x ? 'small' : 'secondary small'} onClick={() => setTab(x)}>{label[x]}</button>)}
      </div>
      {tab === 'inbox' && <Inbox onChange={reloadMe} />}
      {tab === 'conversations' && <Conversations />}
      {tab === 'outbox' && <ListOf path="/outbox" me={me.id} />}
      {tab === 'drafts' && <ListOf path="/letters/drafts" me={me.id} />}
      {tab === 'box' && <ListOf path="/box" me={me.id} />}
      <span hidden>{lang}</span>
    </div>
  );
}

function Inbox({ onChange }: { onChange: () => void }) {
  const { t, lang } = useT();
  const { me, pulse } = useSession();
  const { data, error, reload } = useLoad(() => api('/mailbox'), [pulse]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const answer = async (id: number, action: 'accept' | 'decline') => {
    await api(`/friends/${id}/${action}`, { body: {} });
    reload();
    onChange();
  };
  return (
    <div>
      {data.friendRequests.length > 0 && (
        <section className="card">
          <h3>{t('mailbox.requests')}</h3>
          {data.friendRequests.map((r: any) => (
            <div key={r.friendshipId} className="row" style={{ marginBottom: 8 }}>
              <CourierArt code="pigeon" size={40} />
              <a className="grow" href={`#/user/${r.from.id}`}><UserName u={r.from} /></a>
              {me.kind === 'adult' && (
                <>
                  <button className="small" onClick={() => answer(r.friendshipId, 'accept')}>{t('mailbox.accept')}</button>
                  <button className="small secondary" onClick={() => answer(r.friendshipId, 'decline')}>{t('mailbox.decline')}</button>
                </>
              )}
            </div>
          ))}
        </section>
      )}
      {data.incoming.length > 0 && (
        <section className="card">
          <h3>{t('mailbox.incoming')}</h3>
          {data.incoming.map((i: any) => (
            <div key={i.letterId} className="row" style={{ marginBottom: 8 }}>
              <CourierArt code={i.courierType} size={40} />
              <div className="grow">
                <UserName u={i.from} />
                <div><small className="muted">{courierName(i.courierType, lang)} · {t('mailbox.arrives', { t: formatDate(i.arriveAt, lang) })}</small></div>
              </div>
            </div>
          ))}
        </section>
      )}
      <div className="stack-envelopes">
        {data.letters.length === 0 ? <p className="muted center">{t('mailbox.empty')}</p> : data.letters.map((l: any) => <EnvelopeTile key={l.id} l={l} me={me.id} />)}
      </div>
    </div>
  );
}

function ListOf({ path, me }: { path: string; me: number }) {
  const { t } = useT();
  const { pulse } = useSession();
  const { data, error } = useLoad(() => api<any[]>(path), [path, pulse]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <p className="muted center">{t('mailbox.empty')}</p>;
  return <div className="stack-envelopes">{data.map((l) => <EnvelopeTile key={l.id} l={l} me={me} />)}</div>;
}

function Conversations() {
  const { t, lang } = useT();
  const { pulse } = useSession();
  const { data, error } = useLoad(() => api<any[]>('/conversations'), [pulse]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <p className="muted center">{t('mailbox.empty')}</p>;
  return (
    <div>
      {data.map((c) => (
        <a key={c.user.id} className="envelope-tile" href={`#/conversation/${c.user.id}`}>
          <Avatar code={c.user.avatar} />
          <div className="grow">
            <UserName u={c.user} />
            <div><small className="muted">{c.count} · {formatDate(c.lastAt, lang)}</small></div>
          </div>
          {c.unread > 0 && <span className="dot" style={{ position: 'static' }}>{c.unread}</span>}
        </a>
      ))}
    </div>
  );
}

/** Переписка с человеком: лента писем как стопка конвертов. */
export function Conversation({ userId }: { userId: number }) {
  const { t } = useT();
  const { me } = useSession();
  const { data, error } = useLoad(() => api(`/conversations/${userId}`), [userId]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <a className="row" href={`#/user/${userId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          {data.user && <Avatar code={data.user.avatar} />} <UserName u={data.user} />
        </a>
        <a className="btn small" href={`#/write?to=${userId}`}>{t('friends.write')}</a>
      </div>
      <div className="stack-envelopes">
        {data.letters.map((l: any) => <EnvelopeTile key={l.id} l={l} me={me.id} />)}
      </div>
    </div>
  );
}
