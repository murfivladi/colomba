import { useEffect, useMemo, useRef, useState } from 'react';
import { checkCapacity, courierName, TARIFF_NAMES, type Capacity, type LonLat } from '@colomba/shared';
import { api, mediaUrl } from '../api';
import { CourierArt } from '../art/Couriers';
import { Stamp } from '../art/Misc';
import { FONTS, LetterPaper } from '../components/Letter';
import { compressImage, DrawingPad, VoiceRecorder } from '../components/Media';
import { ErrorText, Loading, Modal, UserName, useLoad } from '../components/ui';
import { currentPosition } from '../geo';
import { formatDate, formatDuration, useT } from '../i18n';
import { navigate, useRoute } from '../router';
import { useSession } from '../state';
import { playCourier } from '../sound';
import { capacityText, type OwnedCourier } from './Station';

type When = 'now' | 'schedule' | 'arriveBy' | 'queue';

interface Suggestion {
  courierId: number;
  ok: boolean;
  durationSec?: number;
  distanceKm?: number;
  token?: string | null;
  warnings?: string[];
  error?: string;
  isReply?: boolean;
}

/**
 * Написать письмо: адресат → курьер (с временем пути и что вместит) → бумага и шрифт →
 * текст, фото, голос, рисунок → когда отправить.
 */
export function Compose() {
  const { t, lang } = useT();
  const { me, toast, reload: reloadMe } = useSession();
  const route = useRoute();

  const [draftId, setDraftId] = useState<number | null>(route.query.get('draft') ? Number(route.query.get('draft')) : null);
  const [toIds, setToIds] = useState<number[]>(route.query.get('to') ? [Number(route.query.get('to'))] : []);
  const [multi, setMulti] = useState(false);
  const [bottle, setBottle] = useState(route.query.get('bottle') === '1');
  const [body, setBody] = useState('');
  const [paper, setPaper] = useState('paper_cream');
  const [font, setFont] = useState('caveat');
  const [stamp, setStamp] = useState<string | null>('stamp_colomba');
  const [stickers, setStickers] = useState<{ code: string; x: number; y: number; r?: number }[]>([]);
  const [media, setMedia] = useState<{ id: number; kind: string; mime: string; durationSec?: number | null }[]>([]);
  const [courierId, setCourierId] = useState<number | null>(route.query.get('courier') ? Number(route.query.get('courier')) : null);
  const [tariff, setTariff] = useState('economy');
  const [when, setWhen] = useState<When>('now');
  const [whenAt, setWhenAt] = useState('');
  const [surprise, setSurprise] = useState(false);
  const [from, setFrom] = useState<LonLat | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [multiCouriers, setMultiCouriers] = useState<Record<number, number>>({});
  const replyTo = route.query.get('reply') ? Number(route.query.get('reply')) : null;

  const friends = useLoad(() => api<any[]>('/friends'), []);
  const couriersRes = useLoad(() => api<{ couriers: OwnedCourier[]; tariffs: string[] }>('/couriers'), []);
  const stationery = useLoad(() => api<any[]>('/stationery'), []);
  const catalog = useLoad(() => api('/couriers/catalog'), []);

  // живой GPS отправителя в момент написания
  useEffect(() => { currentPosition().then((p) => p && setFrom(p.point)); }, []);

  // открыть существующий черновик
  useEffect(() => {
    if (!draftId) return;
    api(`/letters/${draftId}`).then((l) => {
      setBody(l.body ?? '');
      setPaper(l.paper);
      setFont(l.font);
      setStamp(l.stamp);
      setStickers(l.stickers ?? []);
      setMedia(l.media ?? []);
      if (l.to) setToIds([l.to.id]);
      if (l.courier) setCourierId(l.courier.id);
      if (l.tariff) setTariff(l.tariff);
    }).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allCouriers = couriersRes.data?.couriers ?? [];
  const selectedSuggestion = suggestions?.find((s) => s.courierId === courierId) ?? null;
  const [replyCourierType, setReplyCourierType] = useState<string | null>(null);
  // свой курьер — или чужой, который ждёт ответа у меня
  const courierType = allCouriers.find((c) => c.id === courierId)?.type ?? replyCourierType;
  const def = catalog.data?.items.find((i: any) => i.code === courierType);
  const cap: Capacity | null = def?.capacity ?? null;

  // курьер, ждущий ответа у меня (ответ тем же курьером)
  useEffect(() => {
    if (!replyTo) return;
    api(`/letters/${replyTo}`).then((l) => {
      if (l.canReplyWithCourier) {
        setCourierId(l.courier.id);
        setReplyCourierType(l.courier.type);
      }
    }).catch(() => {});
  }, [replyTo]);

  // подбор курьеров для адресата: время пути каждого
  const to = toIds[0] ?? null;
  useEffect(() => {
    if (!to || multi || bottle) { setSuggestions(null); return; }
    setSuggestions(null);
    api<Suggestion[]>('/letters/suggest', { body: { toId: to, from } }).then((s) => {
      setSuggestions(s);
      if (!courierId || !s.some((x) => x.courierId === courierId)) {
        const best = s.find((x) => x.ok && x.isReply) ?? s.filter((x) => x.ok).sort((a, b) => (a.durationSec ?? 0) - (b.durationSec ?? 0))[0];
        if (best) setCourierId(best.courierId);
      }
    }).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, multi, bottle, from?.[0]]);

  // для «Почты» — расчёт по выбранному тарифу
  useEffect(() => {
    setQuote(null);
    if (!to || !courierId || multi || bottle) return;
    if (courierType !== 'post') return;
    api('/letters/quote', { body: { courierId, toId: to, tariff, from } }).then(setQuote, setError);
  }, [courierId, tariff, to, courierType, multi, bottle, from]);

  const size = useMemo(() => ({
    textLength: [...body].length,
    photos: media.filter((m) => m.kind === 'photo').length,
    drawings: media.filter((m) => m.kind === 'drawing').length,
    voiceSec: Math.ceil(media.filter((m) => m.kind === 'voice').reduce((s, m) => s + Number(m.durationSec ?? 0), 0)),
  }), [body, media]);
  const over = cap ? checkCapacity(cap, size) : [];

  // ── автосохранение черновика ──
  const saveTimer = useRef<number | null>(null);
  const draftPayload = { body, paper, font, stamp, stickers, toId: toIds[0] ?? null, replyToId: replyTo };
  async function ensureDraft(): Promise<number> {
    if (draftId) return draftId;
    const d = await api('/letters', { body: draftPayload });
    setDraftId(d.id);
    return d.id;
  }
  useEffect(() => {
    if (!body && !draftId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        if (draftId) await api(`/letters/${draftId}`, { method: 'PATCH', body: draftPayload });
        else await ensureDraft();
      } catch { /* сохраним позже */ }
    }, 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, paper, font, stamp, stickers, toIds.join(',')]);

  async function upload(kind: 'photo' | 'voice' | 'drawing', blob: Blob, durationSec?: number) {
    setError(null);
    try {
      const id = await ensureDraft();
      const fd = new FormData();
      fd.append('kind', kind);
      if (durationSec) fd.append('durationSec', String(durationSec));
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webm';
      fd.append('file', blob, `${kind}.${ext}`);
      const m = await api(`/letters/${id}/media`, { form: fd });
      setMedia((x) => [...x, m]);
    } catch (e) {
      setError(e);
    }
  }

  async function removeMedia(mid: number) {
    if (!draftId) return;
    await api(`/letters/${draftId}/media/${mid}`, { method: 'DELETE' });
    setMedia((x) => x.filter((m) => m.id !== mid));
  }

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const id = await ensureDraft();
      await api(`/letters/${id}`, { method: 'PATCH', body: draftPayload });
      const pos = (await currentPosition(8000))?.point ?? from;
      if (bottle) {
        const b = allCouriers.find((c) => c.type === 'bottle' && c.status === 'home');
        if (!b) throw Object.assign(new Error('courier_busy'), { code: 'courier_busy' });
        await api(`/letters/${id}/send`, { body: { courierId: b.id, bottle: true, from: pos } });
      } else if (multi) {
        const targets = toIds.map((tid) => ({ toId: tid, courierId: multiCouriers[tid] }));
        const r = await api(`/letters/${id}/send-many`, { body: { targets, from: pos, surprise } });
        const failed = r.results.filter((x: any) => !x.ok);
        if (failed.length) toast(failed.map((f: any) => t(`err.${f.error}`)).join('; '));
      } else {
        if (!to || !courierId) return;
        const dur = selectedSuggestion?.durationSec ?? quote?.durationSec ?? 0;
        if (when === 'now' && dur > 30 * 86400 && !confirm(t('compose.confirmSlow', { d: formatDuration(dur, lang) }))) return;
        const base = { courierId, toId: to, tariff: courierType === 'post' ? tariff : null, surprise };
        if (when === 'now') {
          await api(`/letters/${id}/send`, { body: { ...base, from: pos, quoteToken: courierType === 'post' ? quote?.token : selectedSuggestion?.token } });
        } else if (when === 'schedule') {
          const r = await api(`/letters/${id}/schedule`, { body: { ...base, releaseAt: new Date(whenAt).toISOString() } });
          toast(t('compose.scheduled', { t: formatDate(r.releaseAt, lang) }));
        } else if (when === 'arriveBy') {
          const r = await api(`/letters/${id}/schedule`, { body: { ...base, arriveBy: new Date(whenAt).toISOString() } });
          toast(t('compose.scheduled', { t: formatDate(r.releaseAt, lang) }));
        } else {
          await api(`/letters/${id}/queue`, { body: base });
          toast(t('compose.queued'));
        }
      }
      if (when === 'now' || bottle || multi) {
        playCourier(bottle ? 'bottle' : courierType);
        toast(t('compose.sent'));
      }
      reloadMe();
      navigate(when === 'now' && !multi && !bottle ? `/flight/${id}` : '/mailbox?tab=outbox');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!couriersRes.data || !catalog.data) return <Loading />;
  const friendList = (friends.data ?? []).filter((f) => f.status === 'accepted' || f.status === 'penpal');
  const selectedCourier = allCouriers.find((c) => c.id === courierId);
  const busyCourier = selectedCourier && selectedCourier.status !== 'home';
  const stationeryOf = (k: string) => (stationery.data ?? []).filter((s) => s.kind === k);
  const durationSec = courierType === 'post' ? quote?.durationSec : selectedSuggestion?.durationSec;
  const warnings: string[] = (courierType === 'post' ? quote?.warnings : selectedSuggestion?.warnings) ?? [];
  const canSend = !busy && over.length === 0 && (body.trim() || media.length) &&
    (bottle || (multi ? toIds.length > 0 && toIds.every((x) => multiCouriers[x]) : !!to && !!courierId)) &&
    (when === 'now' || when === 'queue' || whenAt);

  return (
    <div>
      <h1>{t('compose.title')}</h1>

      {/* 1. Адресат */}
      <section className="card">
        <h2>{t('compose.to')}</h2>
        {me.kind === 'adult' && !replyTo && (
          <div className="row wrap" style={{ marginBottom: 8 }}>
            <button className={`chip ${multi ? 'on' : ''}`} onClick={() => { setMulti(!multi); setBottle(false); }}>{t('compose.multi')}</button>
            <button className={`chip ${bottle ? 'on' : ''}`} onClick={() => { setBottle(!bottle); setMulti(false); }}>🍾 {t('compose.bottle')}</button>
          </div>
        )}
        {bottle ? <p className="muted">{t('compose.bottleHint')}</p> : (
          <>
            {!friendList.length && <p className="muted">{t('friends.empty')}</p>}
            <div className="row wrap">
              {friendList.map((f) => {
                const on = toIds.includes(f.user.id);
                return (
                  <button key={f.user.id} className={`chip ${on ? 'on' : ''}`} onClick={() => setToIds(multi ? (on ? toIds.filter((x) => x !== f.user.id) : [...toIds, f.user.id]) : [f.user.id])}>
                    {f.user.displayName}
                  </button>
                );
              })}
            </div>
            {to && !friendList.some((f) => f.user.id === to) && <p className="muted" style={{ marginTop: 6 }}>→ #{to}</p>}
          </>
        )}
      </section>

      {/* 2. Курьер */}
      {!bottle && !multi && to && (
        <section className="card">
          <h2>{t('compose.courier')}</h2>
          {!suggestions ? <Loading /> : (
            <div className="stack">
              {suggestions.map((s) => {
                const c = allCouriers.find((x) => x.id === s.courierId);
                const type = c?.type ?? replyCourierType ?? 'pigeon';
                const cdef = catalog.data.items.find((i: any) => i.code === type);
                const fits = cdef ? checkCapacity(cdef.capacity, size).length === 0 : true;
                return (
                  <label key={s.courierId} className="check" style={{ alignItems: 'center', opacity: s.ok ? 1 : 0.6 }}>
                    <input type="radio" name="courier" checked={courierId === s.courierId} onChange={() => setCourierId(s.courierId)} />
                    <CourierArt code={type} size={44} />
                    <span className="grow">
                      <b>{c?.name ?? courierName(type, lang)}</b> {s.isReply && <small className="status waiting">{t('compose.reply')}</small>}
                      <br />
                      {s.ok ? <small>{t('compose.travel', { d: formatDuration(s.durationSec!, lang) })} · {Math.round(s.distanceKm!)} {t('common.km')}</small>
                        : <small className="error">{t(`err.${s.error}`)}</small>}
                      {cdef && <><br /><small className={fits ? 'muted' : 'error'}>{capacityText(cdef.capacity, t)}</small></>}
                    </span>
                  </label>
                );
              })}
              {allCouriers.filter((c) => c.status !== 'home' && !suggestions.some((s) => s.courierId === c.id)).map((c) => (
                <label key={c.id} className="check" style={{ alignItems: 'center', opacity: 0.6 }}>
                  <input type="radio" name="courier" checked={courierId === c.id} onChange={() => { setCourierId(c.id); setWhen('queue'); }} />
                  <CourierArt code={c.type} size={44} />
                  <span className="grow"><b>{c.name}</b><br /><small>{t(`courier.status.${c.status}`)} → {t('compose.queue')}</small></span>
                </label>
              ))}
            </div>
          )}
          {courierType === 'post' && (
            <div className="field" style={{ marginTop: 10 }}>
              <label>{t('compose.tariff')}</label>
              <select value={tariff} onChange={(e) => setTariff(e.target.value)}>
                {(couriersRes.data.tariffs ?? ['economy']).map((x) => <option key={x} value={x}>{TARIFF_NAMES[x]?.[lang] ?? x}</option>)}
              </select>
              {quote && <small>{t('compose.travel', { d: formatDuration(quote.durationSec, lang) })}</small>}
            </div>
          )}
          {durationSec !== undefined && durationSec !== null && when === 'now' && (
            <p style={{ marginTop: 10 }}><b>{t('compose.arrive', { t: formatDate(new Date(Date.now() + durationSec * 1000), lang) })}</b></p>
          )}
          {warnings.includes('far_from_sea') && <p className="muted">{t('compose.warnFarSea')}</p>}
        </section>
      )}

      {multi && toIds.length > 0 && (
        <section className="card">
          <h2>{t('compose.courier')}</h2>
          {toIds.map((tid) => {
            const f = friendList.find((x) => x.user.id === tid);
            const used = new Set(Object.entries(multiCouriers).filter(([k]) => Number(k) !== tid).map(([, v]) => v));
            return (
              <div key={tid} className="field">
                <label><UserName u={f?.user ?? null} /></label>
                <select value={multiCouriers[tid] ?? ''} onChange={(e) => setMultiCouriers({ ...multiCouriers, [tid]: Number(e.target.value) })}>
                  <option value="">—</option>
                  {allCouriers.filter((c) => c.status === 'home' && !used.has(c.id) && c.type !== 'bottle').map((c) => <option key={c.id} value={c.id}>{c.name} · {courierName(c.type, lang)}</option>)}
                </select>
              </div>
            );
          })}
        </section>
      )}

      {/* 3. Бумага и шрифт */}
      <section className="card">
        <h2>{t('compose.paper')}</h2>
        <div className="row wrap" style={{ marginBottom: 8 }}>
          {stationeryOf('paper').map((p) => (
            <button key={p.code} title={p[lang]} aria-label={p[lang]} onClick={() => setPaper(p.code)}
              style={{ width: 44, height: 44, minHeight: 0, padding: 0, background: p.data?.bg, border: paper === p.code ? '3px solid var(--wax)' : '1px solid var(--line)', boxShadow: 'none' }} />
          ))}
        </div>
        <div className="field">
          <label>{t('compose.font')}</label>
          <div className="row wrap">
            {FONTS.map((f) => <button key={f} className={`chip font-${f} ${font === f ? 'on' : ''}`} style={{ fontSize: '1.1rem' }} onClick={() => setFont(f)}>Colomba · Голубка</button>)}
          </div>
        </div>
        <div className="field">
          <label>{t('compose.stamp')}</label>
          <div className="row wrap">
            {stationeryOf('stamp').map((s) => (
              <button key={s.code} className="ghost" onClick={() => setStamp(s.code)} style={{ minHeight: 0, padding: 2, outline: stamp === s.code ? '3px solid var(--wax)' : 'none' }} title={s[lang]}>
                <Stamp data={s.data} size={44} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t('compose.stickers')}</label>
          <div className="row wrap">
            {stationeryOf('sticker').map((s) => (
              <button key={s.code} className="chip" onClick={() => stickers.length < 12 && setStickers([...stickers, { code: s.code, x: 10 + Math.random() * 75, y: 60 + Math.random() * 30, r: Math.round(Math.random() * 40 - 20) }])}>
                {s.data?.emoji}
              </button>
            ))}
            {stickers.length > 0 && <button className="ghost small" onClick={() => setStickers([])}>✕</button>}
          </div>
        </div>
      </section>

      {/* 4. Письмо */}
      <section className="card">
        <h2>{t('compose.content')}</h2>
        <LetterPaper letter={{ body: null, paper, font, stamp, stickers, media: [] }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`font-${font}`}
            aria-label={t('compose.text')}
            style={{ background: 'transparent', border: 0, minHeight: 220, padding: 0, color: '#2f2216', marginTop: -24, width: stamp ? 'calc(100% - 60px)' : '100%' }}
          />
        </LetterPaper>
        {cap && <p className={over.includes('text') ? 'error' : 'muted'} style={{ textAlign: 'right' }}>{t('compose.chars', { n: size.textLength, max: cap.text })}</p>}
        {cap && <p className="muted">{t('compose.fits', { cap: capacityText(cap, t) })}</p>}
        {over.length > 0 && <p className="error">{t('compose.over', { what: over.join(', ') })}</p>}

        {media.length > 0 && (
          <div className="row wrap" style={{ margin: '10px 0' }}>
            {media.map((m) => (
              <div key={m.id} style={{ position: 'relative' }}>
                {m.kind === 'voice' ? <audio controls src={mediaUrl(m.id)} style={{ width: 220 }} /> : <img className="media-thumb" src={mediaUrl(m.id)} alt="" />}
                <button className="small" onClick={() => removeMedia(m.id)} style={{ position: 'absolute', top: -6, right: -6, minHeight: 26, padding: '0 8px' }} aria-label={t('common.delete')}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="row wrap">
          {(!cap || cap.photos > 0) && (
            <label className="btn secondary" style={{ margin: 0 }}>
              📷 {t('compose.photo')}
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await upload('photo', await compressImage(f)); e.target.value = ''; }} />
            </label>
          )}
          {(!cap || cap.drawings > 0) && <button className="secondary" onClick={() => setDrawing(true)}>✎ {t('compose.drawing')}</button>}
          {cap && cap.voiceSec > 0 && <VoiceRecorder maxSec={cap.voiceSec - size.voiceSec} onSave={(b, s) => upload('voice', b, s)} />}
        </div>
      </section>

      {/* 5. Когда */}
      {!bottle && (
        <section className="card">
          <h2>{t('compose.when')}</h2>
          <div className="stack">
            {(['now', 'schedule', 'arriveBy', 'queue'] as When[]).filter((w) => !multi || w === 'now').map((w) => (
              <label key={w} className="check">
                <input type="radio" name="when" checked={when === w} disabled={w === 'now' && !!busyCourier} onChange={() => setWhen(w)} />
                {t(`compose.${w}`)}
              </label>
            ))}
          </div>
          {(when === 'schedule' || when === 'arriveBy') && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>{when === 'schedule' ? t('compose.releaseAt') : t('compose.arriveByDate')}</label>
              <input type="datetime-local" value={whenAt} onChange={(e) => setWhenAt(e.target.value)} />
            </div>
          )}
          <label className="check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={surprise} onChange={(e) => setSurprise(e.target.checked)} /> {t('compose.surprise')}
          </label>
        </section>
      )}

      <ErrorText error={error} />
      <button className="block" disabled={!canSend} onClick={send}>✉ {t('common.send')}</button>

      {drawing && (
        <Modal onClose={() => setDrawing(false)} title={t('compose.drawing')}>
          <DrawingPad onCancel={() => setDrawing(false)} onSave={async (b) => { setDrawing(false); await upload('drawing', b); }} />
        </Modal>
      )}
    </div>
  );
}
