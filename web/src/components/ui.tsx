import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api';
import { useT } from '../i18n';
import { CourierArt } from '../art/Couriers';
import { Postmaster } from '../art/Misc';

export function Loading() {
  const { t } = useT();
  return <p className="muted center">{t('common.loading')}</p>;
}

export function ErrorText({ error }: { error: unknown }) {
  const { t } = useT();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'error';
  const key = `err.${code}`;
  const text = t(key);
  return <p className="error" role="alert">{text === key ? `${t('common.error')} (${code})` : text}</p>;
}

/** Загрузка данных с повтором по ключу. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: unknown; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then(
      (d) => { if (alive) { setData(d); setError(null); setLoading(false); } },
      (e) => { if (alive) { setError(e); setLoading(false); } },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}

export function Modal({ onClose, children, title }: { onClose: () => void; children: ReactNode; title?: string }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

const AVATARS = ['pigeon', 'owl', 'falcon', 'albatross', 'snail', 'turtle', 'horse', 'dolphin', 'stork', 'reindeer', 'dogs', 'sailboat'];
export const AVATAR_CHOICES = AVATARS;

export function Avatar({ code, size = 40 }: { code: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {code === 'postmaster' ? <Postmaster size={size} /> : code === 'ghost' ? <span>—</span> : <CourierArt code={AVATARS.includes(code) ? code : 'pigeon'} size={size - 6} />}
    </span>
  );
}

export function UserName({ u }: { u: { displayName: string; username: string } | null }) {
  const { lang } = useT();
  if (!u) return <span className="muted">?</span>;
  if (u.username === 'postmaster') return <span>{lang === 'it' ? 'Mastro postino' : 'Почтмейстер'}</span>;
  return <span>{u.displayName} <small className="muted">@{u.username}</small></span>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SeedIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <ellipse cx="10" cy="10" rx="5" ry="8" fill="#c9952f" stroke="#3b2a1a" strokeWidth="1.2" transform="rotate(20 10 10)" />
      <path d="M8 4 C10 8 10 12 12 16" stroke="#3b2a1a" strokeWidth="1" fill="none" transform="rotate(20 10 10)" />
    </svg>
  );
}
