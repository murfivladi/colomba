import { useEffect, useState } from 'react';
import { courierName } from '@colomba/shared';
import { api } from '../api';
import { CourierArt } from '../art/Couriers';
import { LetterLook } from '../art/Misc';
import { LetterPaper, PostmarkStamp } from '../components/Letter';
import { ErrorText, Loading, Modal, UserName, useLoad } from '../components/ui';
import { formatDate, useT } from '../i18n';
import { navigate } from '../router';
import { useSession } from '../state';
import { play, playCourier } from '../sound';
import { lookOf } from './Mailbox';

/** Письмо: получатель «вскрывает» его анимацией, вид зависит от курьера. */
export function LetterView({ id }: { id: number }) {
  const { t, lang } = useT();
  const { me, reload: reloadMe, toast } = useSession();
  const { data: l, error, reload } = useLoad(() => api(`/letters/${id}`), [id]);
  const [opened, setOpened] = useState(false);
  const [report, setReport] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const isRecipient = l && l.to?.id === me.id;
  const isSender = l && l.from?.id === me.id;

  useEffect(() => {
    if (l && (isSender || l.readAt)) setOpened(true);
  }, [l, isSender]);

  if (error) return <ErrorText error={error} />;
  if (!l) return <Loading />;

  async function open() {
    play('open');
    setOpened(true);
    if (isRecipient && !l.readAt) {
      await api(`/letters/${id}/read`, { body: {} }).catch(() => {});
      reloadMe();
    }
  }

  async function postcard(text: string) {
    setErr(null);
    try {
      await api(`/letters/${id}/postcard`, { body: { text } });
      playCourier(l.courierType);
      toast(t('compose.sent'));
      reload();
    } catch (e) {
      setErr(e);
    }
  }

  async function recall() {
    try {
      await api(`/letters/${id}/recall`, { body: {} });
      navigate(`/write?draft=${id}`);
    } catch (e) {
      setErr(e);
    }
  }

  const other = isSender ? l.to : l.from;
  return (
    <div className={me.animations ? '' : 'no-anim'}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div>
          <div><small className="muted">{isSender ? t('letter.to') : t('letter.from')}</small></div>
          {l.isBottle && !other ? <b>{t('letter.someone')}</b> : <a href={other ? `#/user/${other.id}` : undefined}><UserName u={other} /></a>}
          {l.isBottle && <div><small className="muted">{t('letter.bottleFrom')}</small></div>}
        </div>
        <div className="center">
          {l.courierType && <CourierArt code={l.courierType} size={48} />}
          <div><small className="muted">{l.courier?.name ?? courierName(l.courierType ?? 'pigeon', lang)}</small></div>
        </div>
      </div>

      {!opened ? (
        <div className="center" style={{ padding: '30px 0' }}>
          <button className="ghost" onClick={open} aria-label={t('letter.open')} style={{ minHeight: 0 }}>
            <LetterLook look={l.kind === 'postcard' ? 'stamped_envelope' : lookOf(l.courierType)} size={220} />
          </button>
          <p><button onClick={open}>{t('letter.open')}</button></p>
        </div>
      ) : (
        <div className="opening">
          <div className="seal center" style={{ marginBottom: 8 }}>
            <LetterLook look={l.kind === 'postcard' ? 'stamped_envelope' : lookOf(l.courierType)} size={80} />
          </div>
          {l.removed ? <p className="error">{t('letter.removed')}</p> : <LetterPaper letter={l} />}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row wrap between">
          <small className="muted">
            {l.status === 'delivered' ? `${t('letter.delivered')} ${formatDate(l.deliveredAt, lang)}` : l.status === 'in_transit' ? `${t('letter.inTransit')} → ${formatDate(l.arriveAt, lang)}` : ''}
            {l.distanceKm ? ` · ${Math.round(l.distanceKm)} ${t('common.km')}` : ''}
            {isSender && l.readAt ? ` · ${t('letter.read')} ✓` : ''}
          </small>
          {isSender && l.status !== 'draft' && <a href={`#/flight/${l.id}`}>{t('flight.title')} →</a>}
        </div>
        {l.postmarks.length > 0 && (
          <>
            <h3 style={{ marginTop: 10 }}>{t('letter.postmarks')}</h3>
            <div className="row wrap">{l.postmarks.map((p: any, i: number) => <PostmarkStamp key={i} pm={p} lang={lang} />)}</div>
          </>
        )}
      </div>

      {isSender && l.recallableUntil && new Date(l.recallableUntil) > new Date() && (
        <div className="card">
          <p className="muted">{t('letter.recallUntil', { t: formatDate(l.recallableUntil, lang) })}</p>
          <button className="secondary block" onClick={recall}>{t('letter.recall')}</button>
        </div>
      )}

      {isRecipient && l.status === 'delivered' && opened && (
        <div className="card stack">
          {l.canReplyWithCourier && (
            <>
              <a className="btn block" href={`#/write?to=${l.from.id}&reply=${l.id}&courier=${l.courier.id}`}>
                {t('letter.replyWith', { name: l.courier.name })}
              </a>
              <div className="row wrap">
                {['letter.quick1', 'letter.quick2', 'letter.quick3'].map((k) => (
                  <button key={k} className="chip" onClick={() => postcard(t(k))}>✉ {t(k)}</button>
                ))}
              </div>
            </>
          )}
          {!l.canReplyWithCourier && l.from && l.kind !== 'broadcast' && (
            <a className="btn block secondary" href={`#/write?to=${l.from.id}&reply=${l.id}`}>{t('letter.reply')}</a>
          )}
          {l.from && l.from.username !== 'postmaster' && (
            <div className="row">
              <button className="ghost small" onClick={() => setReport(true)}>⚑ {t('letter.report')}</button>
              <button className="ghost small" onClick={async () => {
                if (!confirm(t('letter.block') + '?')) return;
                await api('/blocks', { body: { userId: l.from.id } });
                toast(t('common.done'));
              }}>⊘ {t('letter.block')}</button>
            </div>
          )}
        </div>
      )}
      <ErrorText error={err} />
      {report && <ReportModal userId={l.from.id} letterId={l.id} onClose={() => setReport(false)} />}
    </div>
  );
}

export function ReportModal({ userId, letterId, onClose }: { userId: number; letterId?: number; onClose: () => void }) {
  const { t } = useT();
  const { toast } = useSession();
  const [reason, setReason] = useState('abuse');
  const [comment, setComment] = useState('');
  const [block, setBlock] = useState(true);
  return (
    <Modal onClose={onClose} title={t('report.title')}>
      <div className="field">
        <label>{t('report.reason')}</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {['spam', 'abuse', 'inappropriate', 'child_safety', 'other'].map((r) => <option key={r} value={r}>{t(`report.${r}`)}</option>)}
        </select>
      </div>
      <div className="field">
        <label>{t('report.comment')}</label>
        <textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
      </div>
      <label className="check"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> {t('report.alsoBlock')}</label>
      <button className="block" onClick={async () => {
        await api('/reports', { body: { userId, letterId, reason, comment, block } });
        toast(t('report.sent'));
        onClose();
      }}>{t('common.send')}</button>
    </Modal>
  );
}
