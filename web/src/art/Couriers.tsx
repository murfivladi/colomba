import type { ReactElement } from 'react';

/**
 * Курьеры Colomba — единый стиль: тёплая сепия, контур чернилами, немного сургучно-красного.
 * viewBox 0 0 100 100.
 */
const INK = '#3b2a1a';
const S = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

const ART: Record<string, ReactElement> = {
  pigeon: (
    <g {...S}>
      <ellipse cx="50" cy="60" rx="26" ry="18" fill="#9aa3ad" />
      <path d="M30 58 C18 52 14 40 22 36 C30 46 40 50 48 52 Z" fill="#7f8994" />
      <path d="M62 50 C70 40 70 30 64 26 C58 24 54 30 56 38 C57 44 58 48 62 50 Z" fill="#9aa3ad" />
      <path d="M58 40 C60 44 66 46 70 44" fill="none" stroke="#5b8a6a" strokeWidth="3" />
      <circle cx="63" cy="31" r="2" fill={INK} />
      <path d="M68 32 L76 34 L68 36 Z" fill="#c9a26b" />
      <path d="M76 62 L92 58 L88 70 Z" fill="#7f8994" />
      <path d="M44 76 L42 86 M54 76 L56 86" />
      <rect x="40" y="80" width="10" height="6" rx="2" fill="#f2e3c2" />
      <path d="M41 83 H49" stroke="#8c2a1d" strokeWidth="1.4" />
    </g>
  ),
  falcon: (
    <g {...S}>
      <path d="M50 30 C66 30 72 46 70 62 C68 76 58 84 50 84 C42 84 32 76 30 62 C28 46 34 30 50 30 Z" fill="#a67c52" />
      <path d="M38 50 C42 64 58 64 62 50 C60 72 40 72 38 50 Z" fill="#efe1c4" />
      <path d="M42 40 C46 36 54 36 58 40" fill="none" />
      <circle cx="44" cy="42" r="3" fill="#f6d36b" /><circle cx="56" cy="42" r="3" fill="#f6d36b" />
      <circle cx="44" cy="42" r="1.3" fill={INK} /><circle cx="56" cy="42" r="1.3" fill={INK} />
      <path d="M47 47 Q50 54 53 47 Q50 49 47 47 Z" fill="#e0b24a" />
      <path d="M30 56 C16 50 10 62 14 74 C22 70 28 66 32 66 Z M70 56 C84 50 90 62 86 74 C78 70 72 66 68 66 Z" fill="#8a6440" />
      <path d="M40 54 l2 4 M46 58 l2 4 M54 58 l2 4 M60 54 l-2 4" strokeWidth="1.5" />
      <rect x="45" y="84" width="10" height="5" rx="2" fill="#f2e3c2" />
    </g>
  ),
  albatross: (
    <g {...S}>
      <path d="M4 46 C24 38 38 42 48 50 C58 42 76 38 96 46 C78 48 62 54 52 60 L48 60 C38 54 22 48 4 46 Z" fill="#f4efe4" />
      <path d="M4 46 C14 44 22 44 30 45 M96 46 C86 44 78 44 70 45" stroke="#3b3b3b" strokeWidth="3" />
      <ellipse cx="50" cy="58" rx="12" ry="8" fill="#fbf7ee" />
      <circle cx="58" cy="52" r="6" fill="#fbf7ee" />
      <path d="M63 52 L76 56 L63 55 Z" fill="#e7c76a" />
      <circle cx="59" cy="51" r="1.2" fill={INK} />
      <rect x="40" y="62" width="12" height="7" rx="3" fill="#6d4a2a" />
      <path d="M10 82 C20 78 30 86 40 82 C50 78 60 86 70 82 C80 78 90 86 96 82" fill="none" stroke="#5f7f8f" />
    </g>
  ),
  owl: (
    <g {...S}>
      <path d="M28 34 L34 22 L42 32 Q50 28 58 32 L66 22 L72 34 C80 48 78 78 50 84 C22 78 20 48 28 34 Z" fill="#8b6b4a" />
      <ellipse cx="50" cy="66" rx="16" ry="14" fill="#e9d6b0" />
      <circle cx="40" cy="44" r="9" fill="#f3e7cf" /><circle cx="60" cy="44" r="9" fill="#f3e7cf" />
      <circle cx="40" cy="44" r="4" fill="#e9b949" /><circle cx="60" cy="44" r="4" fill="#e9b949" />
      <circle cx="40" cy="44" r="2" fill={INK} /><circle cx="60" cy="44" r="2" fill={INK} />
      <path d="M47 52 L50 58 L53 52 Z" fill="#c9952f" />
      <path d="M42 64 q2 3 4 0 M48 68 q2 3 4 0 M54 64 q2 3 4 0" strokeWidth="1.4" fill="none" />
      <path d="M70 14 a8 8 0 1 0 8 10 a6 6 0 1 1 -8 -10 Z" fill="#f6d36b" />
      <rect x="40" y="82" width="20" height="10" fill="#efe2c4" />
      <circle cx="50" cy="87" r="3" fill="#8c2a1d" stroke="none" />
    </g>
  ),
  snail: (
    <g {...S}>
      <path d="M12 76 C12 70 18 68 26 68 L74 68 C82 68 88 74 88 78 L16 80 C13 80 12 78 12 76 Z" fill="#c9b07e" />
      <path d="M20 68 C14 60 18 50 22 46 M22 46 L18 34 M24 46 L30 36" fill="none" />
      <circle cx="18" cy="33" r="2.4" fill={INK} /><circle cx="30" cy="35" r="2.4" fill={INK} />
      <circle cx="56" cy="50" r="22" fill="#b5703c" />
      <path d="M56 50 m-14 0 a14 14 0 1 1 28 0 a10 10 0 1 1 -20 0 a6 6 0 1 1 12 0 a3 3 0 1 1 -6 0" fill="none" stroke="#6d3f1d" />
      <path d="M50 24 C60 18 72 22 74 30 C66 32 58 30 50 24 Z" fill="#7fa35a" />
      <path d="M52 25 C60 25 66 27 72 30" fill="none" strokeWidth="1.2" />
    </g>
  ),
  turtle: (
    <g {...S}>
      <ellipse cx="50" cy="58" rx="30" ry="20" fill="#7b8f4e" />
      <path d="M30 56 L40 46 L60 46 L70 56 L60 66 L40 66 Z" fill="#94a862" />
      <path d="M40 46 L36 40 M60 46 L64 40 M40 66 L34 72 M60 66 L66 72" />
      <path d="M80 56 C88 52 94 54 94 58 C94 62 88 64 80 60" fill="#a8b77a" />
      <circle cx="89" cy="56" r="1.6" fill={INK} />
      <path d="M26 72 l-6 8 M74 72 l6 8 M28 46 l-6 -6 M72 46 l6 -6" strokeWidth="5" stroke="#a8b77a" />
      <path d="M38 34 L62 34 L60 44 L40 44 Z" fill="#efe2c4" />
      <path d="M40 38 H60" stroke="#8c2a1d" strokeWidth="1.4" />
    </g>
  ),
  dogs: (
    <g {...S}>
      <path d="M8 74 L60 74 L64 66 L14 66 Z" fill="#8a5a33" />
      <rect x="18" y="52" width="26" height="14" rx="2" fill="#5b6b3a" />
      <text x="31" y="62" fontSize="7" textAnchor="middle" fill="#f3e7cf" stroke="none" fontFamily="serif">POST</text>
      <path d="M60 70 L72 62" />
      <path d="M70 62 C70 52 80 48 88 50 L94 44 L94 54 C96 60 92 66 86 66 L74 66 Z" fill="#d9d4c7" />
      <circle cx="88" cy="54" r="1.4" fill={INK} />
      <path d="M74 66 l-2 10 M84 66 l2 10" />
      <path d="M70 60 C64 56 62 50 64 46" fill="none" />
      <path d="M8 80 H92" stroke="#c9d6dc" strokeWidth="3" />
    </g>
  ),
  dolphin: (
    <g {...S}>
      <path d="M12 64 C24 40 54 30 76 40 C84 44 90 48 94 50 C88 52 84 52 80 50 C80 60 70 70 54 72 L48 82 L44 72 C30 72 20 70 12 64 Z" fill="#7d97a8" />
      <path d="M24 62 C40 66 58 64 74 52" fill="none" stroke="#e8eef0" strokeWidth="3" />
      <circle cx="78" cy="44" r="1.6" fill={INK} />
      <path d="M50 34 L56 22 L62 36" fill="#7d97a8" />
      <rect x="30" y="50" width="14" height="8" rx="4" fill="#d9b25a" />
      <path d="M4 86 C16 80 28 90 40 86 C52 82 64 90 76 86 C84 83 90 86 96 86" fill="none" stroke="#5f7f8f" />
    </g>
  ),
  horse: (
    <g {...S}>
      <path d="M22 50 C24 40 40 38 56 40 L66 26 L70 18 L74 26 C80 30 84 38 82 44 L76 46 L72 40 L68 52 C68 60 62 64 56 64 L30 64 C24 64 20 58 22 50 Z" fill="#8a5a33" />
      <path d="M66 26 C60 30 58 36 58 42" fill="none" stroke="#4a2f19" strokeWidth="4" />
      <circle cx="74" cy="32" r="1.4" fill={INK} />
      <path d="M28 64 l-4 20 M36 64 l0 20 M54 64 l2 20 M62 62 l6 20" strokeWidth="4" />
      <path d="M22 50 C12 50 8 60 10 70" fill="none" strokeWidth="4" stroke="#4a2f19" />
      <path d="M38 36 C40 28 46 26 50 30 C52 34 50 38 46 40" fill="#2e4a62" />
      <rect x="38" y="44" width="14" height="10" fill="#efe2c4" />
      <circle cx="45" cy="49" r="2.6" fill="#8c2a1d" stroke="none" />
    </g>
  ),
  sailboat: (
    <g {...S}>
      <path d="M14 66 L86 66 L76 80 L24 80 Z" fill="#7a4e2d" />
      <path d="M50 16 L50 66" />
      <path d="M52 20 C68 30 74 46 72 60 L52 60 Z" fill="#f4efe4" />
      <path d="M48 24 C36 34 30 48 30 60 L48 60 Z" fill="#efe6d2" />
      <path d="M50 16 L62 20 L50 24" fill="#8c2a1d" />
      <path d="M6 86 C18 80 30 90 42 86 C54 82 66 90 78 86 C86 83 92 86 96 86" fill="none" stroke="#5f7f8f" />
    </g>
  ),
  airship: (
    <g {...S}>
      <ellipse cx="50" cy="40" rx="40" ry="16" fill="#c9b9a0" />
      <path d="M16 40 H84 M22 32 C40 30 60 30 78 32 M22 48 C40 50 60 50 78 48" fill="none" strokeWidth="1.2" />
      <path d="M86 40 L96 30 L96 50 Z" fill="#a8977c" />
      <path d="M40 56 L42 64 L60 64 L62 56" fill="none" />
      <rect x="38" y="62" width="26" height="9" rx="2" fill="#7a4e2d" />
      <circle cx="44" cy="66" r="1.5" fill="#f6d36b" /><circle cx="51" cy="66" r="1.5" fill="#f6d36b" /><circle cx="58" cy="66" r="1.5" fill="#f6d36b" />
      <text x="50" y="44" fontSize="8" textAnchor="middle" fill="#8c2a1d" stroke="none" fontFamily="serif" fontWeight="bold">AIR MAIL</text>
    </g>
  ),
  bottle: (
    <g {...S}>
      <path d="M40 18 H56 V30 C66 36 70 46 70 58 V80 C70 86 66 90 60 90 H36 C30 90 26 86 26 80 V58 C26 46 30 36 40 30 Z" fill="#a9c8b8" fillOpacity="0.8" transform="rotate(-25 48 54)" />
      <rect x="40" y="10" width="14" height="10" rx="2" fill="#b5895a" transform="rotate(-25 48 54)" />
      <path d="M38 48 C44 44 54 46 56 52 C54 60 44 62 38 58 Z" fill="#f2e3c2" transform="rotate(-25 48 54)" />
      <path d="M41 51 H53 M41 55 H51" strokeWidth="1" transform="rotate(-25 48 54)" />
      <path d="M4 84 C16 78 28 88 40 84 C52 80 64 88 76 84 C84 81 90 84 96 84" fill="none" stroke="#5f7f8f" />
    </g>
  ),
  post: (
    <g {...S}>
      <rect x="18" y="30" width="64" height="44" rx="4" fill="#efe2c4" />
      <path d="M18 34 L50 56 L82 34" fill="none" />
      <rect x="62" y="36" width="14" height="16" fill="#8c2a1d" />
      <path d="M64 38 h10 v12 h-10 z" fill="none" stroke="#f3e7cf" strokeWidth="1" />
      <circle cx="40" cy="62" r="9" fill="none" stroke="#2e4a62" strokeWidth="1.6" />
      <path d="M33 62 H47 M36 58 H44 M36 66 H44" stroke="#2e4a62" strokeWidth="1" />
      <path d="M26 84 L74 84 M30 80 C30 76 34 74 38 74 M70 80 C70 76 66 74 62 74" fill="none" />
    </g>
  ),
  reindeer: (
    <g {...S}>
      <path d="M26 52 C28 44 40 42 56 44 L66 34 L72 40 C76 44 76 50 72 52 L68 54 L66 60 C64 64 58 66 52 66 L34 66 C28 66 24 60 26 52 Z" fill="#a0764d" />
      <path d="M66 34 C62 24 56 22 52 16 M60 26 L54 26 M68 32 C72 22 80 20 84 14 M76 22 L82 24" fill="none" stroke="#6b4a2a" strokeWidth="2.6" />
      <circle cx="74" cy="48" r="3" fill="#c0392b" />
      <circle cx="68" cy="42" r="1.3" fill={INK} />
      <path d="M32 66 l-2 16 M40 66 l0 16 M54 66 l2 16 M62 64 l4 16" strokeWidth="3.4" />
      <rect x="36" y="46" width="14" height="10" fill="#efe2c4" />
      <path d="M38 48 h10" stroke="#1f5a3a" strokeWidth="1.4" />
      <circle cx="30" cy="46" r="1.4" fill="#f6d36b" /><circle cx="34" cy="44" r="1.4" fill="#f6d36b" />
    </g>
  ),
  stork: (
    <g {...S}>
      <path d="M28 44 C38 36 58 36 70 42 C76 46 74 54 66 56 L36 56 C28 56 22 50 28 44 Z" fill="#f6f2ea" />
      <path d="M36 44 C46 40 58 40 66 44 L60 52 L40 52 Z" fill="#2b2b2b" />
      <path d="M70 42 C74 34 74 26 70 20" fill="none" strokeWidth="3" stroke="#f6f2ea" />
      <path d="M70 20 C72 16 76 16 78 18" fill="#f6f2ea" />
      <path d="M78 18 L94 22 L78 22 Z" fill="#d9542b" />
      <circle cx="74" cy="18" r="1.2" fill={INK} />
      <path d="M46 56 L42 86 M54 56 L56 86" stroke="#d9542b" strokeWidth="2.4" />
      <path d="M16 62 C16 56 26 54 30 60 C32 66 26 72 20 70 C17 69 16 66 16 62 Z" fill="#efe2c4" />
      <path d="M22 58 L28 50" />
    </g>
  ),
};

export function CourierArt({ code, size = 64, title }: { code: string; size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title ?? code} className="art">
      {ART[code] ?? ART.pigeon}
    </svg>
  );
}

export const COURIER_CODES = Object.keys(ART);
