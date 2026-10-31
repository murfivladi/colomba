import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';

/** Сжатие фото перед загрузкой: до 1600 px по длинной стороне, JPEG. */
export async function compressImage(file: File, max = 1600): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Рисование и письмо от руки пальцем или стилусом (Pointer Events, с нажимом). */
export function DrawingPad({ onSave, onCancel }: { onSave: (png: Blob) => void; onCancel: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#2f2216');
  const [width, setWidth] = useState(3);
  const drawing = useRef(false);
  const last = useRef<[number, number] | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fbf6ea';
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = ref.current!.getContext('2d')!;
    const p = pos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (e.pressure && e.pointerType === 'pen' ? 0.5 + e.pressure : 1);
    ctx.beginPath();
    ctx.moveTo(...last.current);
    ctx.lineTo(...p);
    ctx.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };
  const clear = () => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fbf6ea';
    ctx.fillRect(0, 0, c.width, c.height);
  };

  return (
    <div>
      <canvas ref={ref} className="draw-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="row wrap" style={{ marginTop: 8 }}>
        {['#2f2216', '#8c2a1d', '#2e4a62', '#5b6b3a', '#b8892f'].map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} style={{ background: c, minHeight: 32, width: 32, padding: 0, borderRadius: '50%', outline: color === c ? '3px solid var(--gold)' : 'none' }} />
        ))}
        <input type="range" min={1} max={12} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 100 }} aria-label="width" />
        <button type="button" className="secondary small" onClick={clear}>{t('compose.clear')}</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="secondary grow" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="button" className="grow" onClick={() => ref.current!.toBlob((b) => b && onSave(b), 'image/png')}>{t('common.save')}</button>
      </div>
    </div>
  );
}

/** Голосовое письмо (MediaRecorder), длина ограничена грузоподъёмностью курьера. */
export function VoiceRecorder({ maxSec, onSave }: { maxSec: number; onSave: (blob: Blob, sec: number) => void }) {
  const { t } = useT();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [sec, setSec] = useState(0);
  const timer = useRef<number | null>(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((x) => x.stop());
      if (timer.current) clearInterval(timer.current);
      onSave(new Blob(chunks, { type: r.mimeType || 'audio/webm' }), Math.max(1, Math.round((Date.now() - started) / 1000)));
      setRec(null);
      setSec(0);
    };
    r.start();
    setRec(r);
    timer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      setSec(s);
      if (s >= maxSec) r.stop();
    }, 250);
  }

  if (!('MediaRecorder' in window)) return null;
  return rec ? (
    <button type="button" onClick={() => rec.stop()}>■ {t('compose.stop')} {sec}/{maxSec} s</button>
  ) : (
    <button type="button" className="secondary" onClick={start}>● {t('compose.record')} ({Math.round(maxSec / 60)} min)</button>
  );
}
