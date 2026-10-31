import type { ReactElement } from 'react';

const INK = '#3b2a1a';
const S = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** Талисман: старый голубь-почтмейстер в фуражке, винтажной почтовой форме и пенсне. */
export function Postmaster({ size = 140 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Postmaster">
      <g {...S}>
        <path d="M30 112 C30 84 40 72 60 72 C80 72 90 84 90 112 Z" fill="#2e4a62" />
        <path d="M60 72 L52 112 M60 72 L68 112" stroke="#22384a" />
        <circle cx="60" cy="88" r="2" fill="#d9b25a" /><circle cx="60" cy="98" r="2" fill="#d9b25a" /><circle cx="60" cy="108" r="2" fill="#d9b25a" />
        <path d="M44 76 L60 84 L76 76" fill="none" stroke="#d9b25a" strokeWidth="1.6" />
        <ellipse cx="60" cy="52" rx="24" ry="22" fill="#a4acb5" />
        <path d="M46 66 C52 72 68 72 74 66" fill="none" stroke="#5b8a6a" strokeWidth="4" />
        <path d="M34 34 C40 20 80 20 86 34 L84 38 L36 38 Z" fill="#2e4a62" />
        <rect x="32" y="36" width="56" height="6" rx="2" fill="#1d3142" />
        <path d="M40 42 C50 46 70 46 80 42 L84 46 C70 50 50 50 36 46 Z" fill="#1d3142" />
        <circle cx="60" cy="30" r="4" fill="#d9b25a" />
        <path d="M57 30 L63 30 M60 27 L60 33" stroke="#8c2a1d" strokeWidth="1.2" />
        <circle cx="50" cy="54" r="6" fill="#f3e7cf" fillOpacity="0.6" /><circle cx="70" cy="54" r="6" fill="#f3e7cf" fillOpacity="0.6" />
        <path d="M56 54 L64 54" />
        <path d="M76 54 C84 56 86 62 84 70" fill="none" strokeWidth="1.2" />
        <circle cx="50" cy="54" r="1.8" fill={INK} /><circle cx="70" cy="54" r="1.8" fill={INK} />
        <path d="M55 60 L60 68 L65 60 Z" fill="#c9a26b" />
        <path d="M44 48 L48 47 M76 48 L72 47" strokeWidth="1.6" />
        <path d="M92 90 L108 84 L108 104 L92 110 Z" fill="#efe2c4" />
        <path d="M92 90 L100 98 L108 84" fill="none" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

/** Роза ветров для карты. */
export function Compass({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g stroke={INK} strokeWidth="1" fill="none">
        <circle cx="50" cy="50" r="40" />
        <circle cx="50" cy="50" r="34" strokeDasharray="2 3" />
      </g>
      <path d="M50 8 L56 50 L50 92 L44 50 Z" fill="#8c2a1d" stroke={INK} strokeWidth="1" />
      <path d="M8 50 L50 44 L92 50 L50 56 Z" fill="#efe2c4" stroke={INK} strokeWidth="1" />
      <path d="M22 22 L52 48 L78 78 L48 52 Z" fill="#c9b38c" stroke={INK} strokeWidth="0.6" opacity="0.7" />
      <path d="M78 22 L52 52 L22 78 L48 48 Z" fill="#c9b38c" stroke={INK} strokeWidth="0.6" opacity="0.7" />
      <text x="50" y="7" fontSize="9" textAnchor="middle" fill={INK} fontFamily="serif" fontWeight="bold">N</text>
    </svg>
  );
}

/** Почтовая станция: голубятня, конюшня, причал, почтовый ящик. Координаты мест — в процентах. */
export const STATION_SPOTS: Record<string, { x: number; y: number; area: 'dovecote' | 'stable' | 'pier' | 'mailbox' }> = {
  pigeon: { x: 18, y: 36, area: 'dovecote' },
  falcon: { x: 30, y: 30, area: 'dovecote' },
  owl: { x: 8, y: 30, area: 'dovecote' },
  stork: { x: 40, y: 22, area: 'dovecote' },
  albatross: { x: 86, y: 40, area: 'pier' },
  snail: { x: 40, y: 92, area: 'stable' },
  turtle: { x: 62, y: 94, area: 'pier' },
  dogs: { x: 30, y: 78, area: 'stable' },
  reindeer: { x: 18, y: 80, area: 'stable' },
  horse: { x: 48, y: 72, area: 'stable' },
  dolphin: { x: 92, y: 88, area: 'pier' },
  sailboat: { x: 80, y: 70, area: 'pier' },
  bottle: { x: 72, y: 90, area: 'pier' },
  airship: { x: 68, y: 18, area: 'dovecote' },
  post: { x: 60, y: 58, area: 'mailbox' },
};

export function StationScene() {
  return (
    <svg viewBox="0 0 400 260" className="scene" role="img" aria-label="Почтовая станция">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0e2c2" />
          <stop offset="1" stopColor="#e6d1a4" />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill="url(#sky)" />
      <circle cx="330" cy="40" r="18" fill="#f2d48a" opacity="0.7" />
      <path d="M0 150 C80 135 160 150 240 140 L300 145 L300 260 L0 260 Z" fill="#cdb682" />
      <path d="M300 150 C330 148 370 152 400 150 L400 260 L300 260 Z" fill="#a9bdb3" />
      <path d="M300 170 C320 166 340 174 360 170 C380 166 390 172 400 170 M300 200 C320 196 340 204 360 200 C380 196 390 202 400 200 M300 232 C320 228 340 236 360 232 C380 228 390 234 400 232" stroke="#7d9aa0" fill="none" strokeWidth="1.5" />
      <g {...S}>
        {/* голубятня */}
        <path d="M30 150 L30 80 L70 80 L70 150" fill="#d6b98a" />
        <path d="M22 82 L50 56 L78 82 Z" fill="#8c2a1d" />
        <rect x="38" y="92" width="10" height="10" fill="#3b2a1a" /><rect x="52" y="92" width="10" height="10" fill="#3b2a1a" />
        <rect x="38" y="110" width="10" height="10" fill="#3b2a1a" /><rect x="52" y="110" width="10" height="10" fill="#3b2a1a" />
        <path d="M34 104 H66 M34 122 H66" />
        {/* конюшня */}
        <path d="M90 200 L90 160 L190 160 L190 200" fill="#b8875a" />
        <path d="M84 162 L140 132 L196 162 Z" fill="#7a4e2d" />
        <rect x="120" y="170" width="40" height="30" fill="#6d4426" />
        <path d="M120 170 L160 200 M160 170 L120 200" stroke="#3b2a1a" strokeWidth="1.5" />
        {/* почтовое отделение с ящиком */}
        <rect x="210" y="118" width="70" height="52" fill="#efe2c4" />
        <path d="M204 120 L245 96 L286 120 Z" fill="#2e4a62" />
        <rect x="222" y="128" width="46" height="12" fill="#8c2a1d" />
        <text x="245" y="137" fontSize="9" textAnchor="middle" fill="#f3e7cf" stroke="none" fontFamily="serif" fontWeight="bold">POSTA · ПОЧТА</text>
        <rect x="238" y="148" width="14" height="22" fill="#6d4426" />
        <rect x="262" y="150" width="12" height="16" rx="2" fill="#8c2a1d" />
        {/* причал */}
        <path d="M290 186 L380 186 L380 192 L290 192 Z" fill="#8a5a33" />
        <path d="M300 192 V214 M330 192 V214 M360 192 V214" />
      </g>
    </svg>
  );
}

/** Как выглядит письмо у курьера: свиток, конверт с печатью, записка в бутылке… */
const LOOKS: Record<string, ReactElement> = {
  scroll_leg: <g {...S}><rect x="14" y="20" width="72" height="36" rx="18" fill="#f2e3c2" /><path d="M30 38 H70" stroke="#8c2a1d" strokeWidth="3" /></g>,
  tiny_scroll: <g {...S}><rect x="30" y="28" width="40" height="18" rx="9" fill="#f2e3c2" /><path d="M40 37 H60" stroke="#8c2a1d" strokeWidth="2" /></g>,
  scroll_case: <g {...S}><rect x="10" y="26" width="80" height="24" rx="12" fill="#7a4e2d" /><rect x="12" y="30" width="14" height="16" rx="4" fill="#d9b25a" /></g>,
  sealed_envelope: <g {...S}><rect x="10" y="14" width="80" height="50" rx="3" fill="#efe2c4" /><path d="M10 16 L50 44 L90 16" fill="none" /><circle cx="50" cy="44" r="8" fill="#8c2a1d" /></g>,
  leaf_shell: <g {...S}><path d="M18 52 C20 22 70 10 86 18 C80 46 50 62 18 52 Z" fill="#a8c47a" /><path d="M20 52 C40 40 60 28 84 20" fill="none" /></g>,
  shell_bundle: <g {...S}><rect x="18" y="20" width="64" height="36" rx="6" fill="#efe2c4" /><path d="M18 38 H82 M50 20 V56" stroke="#5b6b3a" strokeWidth="3" /></g>,
  mail_bag: <g {...S}><path d="M20 22 H80 L74 62 H26 Z" fill="#5b6b3a" /><text x="50" y="47" fontSize="12" textAnchor="middle" fill="#f3e7cf" stroke="none" fontFamily="serif">POST</text></g>,
  capsule: <g {...S}><rect x="12" y="26" width="76" height="24" rx="12" fill="#d9b25a" /><path d="M50 26 V50" /></g>,
  wax_packet: <g {...S}><rect x="12" y="14" width="76" height="48" fill="#e7d5ad" /><path d="M12 38 H88 M50 14 V62" stroke="#7a4e2d" strokeWidth="2" /><circle cx="50" cy="38" r="9" fill="#8c2a1d" /></g>,
  oilcloth_packet: <g {...S}><rect x="12" y="14" width="76" height="48" rx="4" fill="#4a5a4a" /><path d="M12 38 H88 M50 14 V62" stroke="#c9b38c" strokeWidth="2" /></g>,
  airmail: <g {...S}><rect x="10" y="14" width="80" height="50" fill="#f6f1e6" /><path d="M10 14 h80 v50 h-80 z" fill="none" stroke="#8c2a1d" strokeWidth="4" strokeDasharray="8 6" /><path d="M10 16 L50 42 L90 16" fill="none" /></g>,
  bottle_note: <g {...S}><path d="M20 30 H64 C76 30 84 36 84 40 C84 44 76 50 64 50 H20 Z" fill="#a9c8b8" fillOpacity="0.8" /><rect x="84" y="35" width="8" height="10" fill="#b5895a" /><path d="M28 36 C40 32 52 34 58 40 C52 46 40 48 28 44 Z" fill="#f2e3c2" /></g>,
  stamped_envelope: <g {...S}><rect x="10" y="14" width="80" height="50" rx="3" fill="#efe2c4" /><path d="M10 16 L50 44 L90 16" fill="none" /><rect x="68" y="20" width="16" height="18" fill="#8c2a1d" /><circle cx="64" cy="34" r="9" fill="none" stroke="#2e4a62" strokeWidth="1.4" /></g>,
  sleigh_bag: <g {...S}><path d="M22 20 H78 L72 60 H28 Z" fill="#8c2a1d" /><circle cx="50" cy="40" r="6" fill="#d9b25a" /></g>,
  cloth_bundle: <g {...S}><path d="M20 30 C30 12 70 12 80 30 C84 50 70 62 50 62 C30 62 16 50 20 30 Z" fill="#f2e3c2" /><path d="M42 18 L50 30 L58 18" fill="none" /></g>,
};

export function LetterLook({ look, size = 64 }: { look: string | null | undefined; size?: number }) {
  return (
    <svg viewBox="0 0 100 76" width={size} height={(size * 76) / 100} className="look" aria-hidden="true">
      {LOOKS[look ?? 'stamped_envelope'] ?? LOOKS.stamped_envelope}
    </svg>
  );
}

/** Марка с зубцами. data.svg — мотив, data.color — цвет. */
const MOTIFS: Record<string, ReactElement> = {
  dove: <path d="M20 44 C26 30 40 28 48 34 L56 26 L54 36 C60 44 52 56 38 54 C30 54 24 50 20 44 Z" fill="#fff8ec" />,
  postmaster: <g><circle cx="40" cy="38" r="12" fill="#fff8ec" /><rect x="26" y="24" width="28" height="7" fill="#fff8ec" /></g>,
  owl: <g fill="#fff8ec"><ellipse cx="40" cy="42" rx="13" ry="15" /><circle cx="35" cy="36" r="4" fill="#3b2a1a" /><circle cx="45" cy="36" r="4" fill="#3b2a1a" /></g>,
  ship: <g fill="#fff8ec"><path d="M24 50 H56 L50 58 H30 Z" /><path d="M40 22 V50 M42 24 C52 32 54 42 52 48 H42 Z" /></g>,
  fir: <path d="M40 18 L54 40 H46 L56 56 H24 L34 40 H26 Z" fill="#fff8ec" />,
  star: <path d="M40 18 L46 34 L62 34 L49 44 L54 60 L40 50 L26 60 L31 44 L18 34 L34 34 Z" fill="#fff8ec" />,
  mimosa: <g fill="#f6d36b"><circle cx="34" cy="34" r="5" /><circle cx="44" cy="30" r="5" /><circle cx="46" cy="42" r="5" /><circle cx="36" cy="46" r="5" /></g>,
  sun: <g fill="#fff8ec"><circle cx="40" cy="40" r="10" /><path d="M40 18 V26 M40 54 V62 M18 40 H26 M54 40 H62 M25 25 L30 30 M50 50 L55 55 M55 25 L50 30 M30 50 L25 55" stroke="#fff8ec" strokeWidth="3" /></g>,
  heart: <path d="M40 58 C20 44 22 26 32 26 C36 26 40 30 40 34 C40 30 44 26 48 26 C58 26 60 44 40 58 Z" fill="#fff8ec" />,
};

export function Stamp({ data, size = 56 }: { data?: { svg?: string; color?: string } | null; size?: number }) {
  const color = data?.color ?? '#8c2a1d';
  const teeth = [];
  for (let i = 0; i <= 10; i++) {
    teeth.push(<circle key={`t${i}`} cx={i * 8} cy="0" r="2.6" fill="var(--card, #fbf4e4)" />);
    teeth.push(<circle key={`b${i}`} cx={i * 8} cy="80" r="2.6" fill="var(--card, #fbf4e4)" />);
    teeth.push(<circle key={`l${i}`} cx="0" cy={i * 8} r="2.6" fill="var(--card, #fbf4e4)" />);
    teeth.push(<circle key={`r${i}`} cx="80" cy={i * 8} r="2.6" fill="var(--card, #fbf4e4)" />);
  }
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
      <rect x="0" y="0" width="80" height="80" fill="#fbf4e4" />
      <rect x="6" y="6" width="68" height="68" fill={color} />
      <rect x="9" y="9" width="62" height="62" fill="none" stroke="#fff8ec" strokeWidth="1" />
      {MOTIFS[data?.svg ?? 'dove'] ?? MOTIFS.dove}
      <text x="40" y="70" fontSize="8" textAnchor="middle" fill="#fff8ec" fontFamily="serif">COLOMBA</text>
      {teeth}
    </svg>
  );
}

export function AppIcon({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#8c2a1d" />
      <path d="M12 40 C18 24 34 22 42 28 L50 20 L48 32 C54 40 46 52 32 50 C22 50 15 46 12 40 Z" fill="#f3e7cf" />
      <circle cx="42" cy="30" r="1.6" fill="#3b2a1a" />
      <rect x="22" y="44" width="12" height="7" rx="2" fill="#efe2c4" stroke="#3b2a1a" strokeWidth="1" />
    </svg>
  );
}
