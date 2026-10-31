import { useEffect, useState } from 'react';
import { api, mediaUrl } from '../api';
import { Stamp } from '../art/Misc';

/** Все предметы (бумага, марки, конверты, наклейки) — один раз на сессию. */
let itemsCache: Promise<Record<string, any>> | null = null;
export function loadItems(): Promise<Record<string, any>> {
  itemsCache ??= api('/shop').then((r: any) => Object.fromEntries(r.items.map((i: any) => [i.code, i]))).catch(() => {
    itemsCache = null;
    return {};
  });
  return itemsCache;
}

export function useItems(): Record<string, any> {
  const [items, setItems] = useState<Record<string, any>>({});
  useEffect(() => { loadItems().then(setItems); }, []);
  return items;
}

export const FONTS = ['caveat', 'marck_script', 'bad_script', 'neucha', 'amatic_sc', 'old_standard'];

export interface LetterLike {
  body: string | null;
  paper: string;
  font: string;
  stamp: string | null;
  stickers?: { code: string; x: number; y: number; r?: number }[] | null;
  media?: { id: number; kind: string; mime: string; durationSec?: number | null }[];
}

/** Лист письма: бумага, «рукописный» шрифт, марка, наклейки, фото, рисунки, голос. */
export function LetterPaper({ letter, children }: { letter: LetterLike; children?: React.ReactNode }) {
  const items = useItems();
  const paper = items[letter.paper]?.data ?? { bg: '#f6ecd6' };
  const stamp = letter.stamp ? items[letter.stamp]?.data : null;
  return (
    <div
      className={`letter-paper font-${letter.font} ${paper.line ? 'lined' : ''}`}
      style={{ background: paper.bg, ['--rule' as any]: paper.line ?? undefined }}
    >
      {letter.stamp && <span className="stamp-corner"><Stamp data={stamp} size={64} /></span>}
      <div style={{ paddingRight: letter.stamp ? 60 : 0 }}>{letter.body}</div>
      {letter.media && letter.media.length > 0 && (
        <div className="row wrap" style={{ marginTop: 14 }}>
          {letter.media.map((m) =>
            m.kind === 'voice' ? (
              <audio key={m.id} controls src={mediaUrl(m.id)} style={{ width: '100%' }} />
            ) : (
              <a key={m.id} href={mediaUrl(m.id)} target="_blank" rel="noreferrer">
                <img src={mediaUrl(m.id)} alt="" style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 4, border: '6px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,.2)', transform: `rotate(${(m.id % 5) - 2}deg)` }} />
              </a>
            ),
          )}
        </div>
      )}
      {letter.stickers?.map((s, i) => (
        <span key={i} className="sticker" style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `rotate(${s.r ?? 0}deg)` }}>
          {items[s.code]?.data?.emoji ?? '★'}
        </span>
      ))}
      {children}
    </div>
  );
}

export function PostmarkStamp({ pm, lang, faint }: { pm: { ru: string; it: string; country: string; at?: string }; lang: 'ru' | 'it'; faint?: boolean }) {
  const d = pm.at ? new Date(pm.at) : null;
  return (
    <span className={`postmark ${faint ? 'faint' : ''}`}>
      <b>{lang === 'it' ? pm.it : pm.ru}</b>
      {d && <span>{d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>}
      <span>{pm.country}</span>
    </span>
  );
}
