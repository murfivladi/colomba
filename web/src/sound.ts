/**
 * Звуки курьеров, синтезированные Web Audio: взмах крыльев, стук копыт, лай упряжки,
 * гудок парохода, всплеск бутылки. Без файлов — ничего не нужно хранить и лицензировать.
 */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundsEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(c: AudioContext, dur: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  return s;
}

function burst(c: AudioContext, t: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
  const n = noise(c, dur);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(c.destination);
  n.start(t);
  n.stop(t + dur);
}

function tone(c: AudioContext, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.05, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS: Record<string, (c: AudioContext, t: number) => void> = {
  wings: (c, t) => { for (let i = 0; i < 5; i++) burst(c, t + i * 0.11, 0.09, 900, 0.8, 0.35); },
  falcon: (c, t) => { tone(c, t, 0.35, 2600, 1800, 0.12, 'triangle'); tone(c, t + 0.4, 0.3, 2500, 1700, 0.1, 'triangle'); },
  seabird: (c, t) => { tone(c, t, 0.25, 1400, 900, 0.12, 'sawtooth'); tone(c, t + 0.3, 0.3, 1500, 800, 0.1, 'sawtooth'); },
  owl: (c, t) => { tone(c, t, 0.35, 420, 380, 0.25); tone(c, t + 0.5, 0.6, 400, 340, 0.25); },
  snail: (c, t) => { burst(c, t, 0.8, 300, 3, 0.15, 'lowpass'); },
  turtle: (c, t) => { burst(c, t, 0.5, 200, 2, 0.2, 'lowpass'); burst(c, t + 0.6, 0.4, 250, 2, 0.15, 'lowpass'); },
  bark: (c, t) => { for (let i = 0; i < 3; i++) { tone(c, t + i * 0.22, 0.12, 520, 300, 0.25, 'square'); burst(c, t + i * 0.22, 0.1, 1200, 1, 0.2); } },
  dolphin: (c, t) => { for (let i = 0; i < 6; i++) tone(c, t + i * 0.06, 0.05, 5000 + i * 300, 7000, 0.05, 'sine'); },
  hooves: (c, t) => { for (let i = 0; i < 8; i++) burst(c, t + i * 0.13 + (i % 2) * 0.04, 0.05, 1800, 4, 0.5, 'highpass'); },
  horn: (c, t) => { tone(c, t, 1.2, 110, 108, 0.3, 'sawtooth'); tone(c, t, 1.2, 165, 162, 0.15, 'sawtooth'); },
  engine: (c, t) => { burst(c, t, 1.2, 120, 6, 0.35, 'bandpass'); },
  splash: (c, t) => { burst(c, t, 0.5, 2500, 0.6, 0.4, 'highpass'); tone(c, t + 0.05, 0.25, 800, 200, 0.1); },
  post_horn: (c, t) => { tone(c, t, 0.25, 523, 523, 0.18, 'triangle'); tone(c, t + 0.28, 0.25, 659, 659, 0.18, 'triangle'); tone(c, t + 0.56, 0.45, 784, 784, 0.18, 'triangle'); },
  bells: (c, t) => { for (let i = 0; i < 4; i++) tone(c, t + i * 0.15, 0.4, 1568 - i * 100, 1500 - i * 100, 0.08, 'sine'); },
  stork: (c, t) => { for (let i = 0; i < 10; i++) burst(c, t + i * 0.05, 0.03, 2200, 6, 0.3, 'bandpass'); },
  open: (c, t) => { burst(c, t, 0.35, 3000, 0.7, 0.2, 'highpass'); },
};

const BY_COURIER: Record<string, string> = {
  pigeon: 'wings', falcon: 'falcon', albatross: 'seabird', owl: 'owl', snail: 'snail', turtle: 'turtle', dogs: 'bark',
  dolphin: 'dolphin', horse: 'hooves', sailboat: 'horn', airship: 'engine', bottle: 'splash', post: 'post_horn',
  reindeer: 'bells', stork: 'stork',
};

export function playCourier(code: string | null | undefined) {
  play(BY_COURIER[code ?? 'pigeon'] ?? 'wings');
}

export function play(name: string) {
  const c = ac();
  if (!c) return;
  SOUNDS[name]?.(c, c.currentTime + 0.02);
}
