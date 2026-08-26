import React from 'react';

// ---------------------------------------------------------------------------
// Generated club crest. Works from just a team name: initials + deterministic
// colors hashed from the name, so any team added via the Discord bot gets a
// consistent, decent-looking crest with zero configuration.
// ---------------------------------------------------------------------------

/** Curated two-tone palettes (primary, secondary) — hand-picked to look good. */
const PALETTES: [string, string][] = [
  ['#e0245e', '#7d1030'],
  ['#2f80ed', '#174e8c'],
  ['#27ae60', '#14683b'],
  ['#f2994a', '#a35613'],
  ['#9b51e0', '#5b2d86'],
  ['#eb5757', '#962c2c'],
  ['#219653', '#0f5a31'],
  ['#f2c94c', '#9c7a10'],
  ['#56ccf2', '#1a7fa8'],
  ['#bb6bd9', '#6f3483'],
  ['#ff8a65', '#b34a26'],
  ['#4fc3f7', '#18708f'],
  ['#aed581', '#5f8534'],
  ['#ffb74d', '#a3641c'],
  ['#e57373', '#953f3f'],
  ['#7986cb', '#3f4f96'],
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function crestAbbr(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'FC';
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

interface CrestProps {
  name: string;
  size?: number;
  className?: string;
}

export const Crest: React.FC<CrestProps> = ({ name, size = 32, className }) => {
  const hash = hashString(name.toLowerCase());
  const [primary, secondary] = PALETTES[hash % PALETTES.length];
  const abbr = crestAbbr(name);
  const ink = luminance(primary) > 0.62 ? '#10131a' : '#ffffff';
  const id = `crest_${hash.toString(36)}_${abbr}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={name}
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <clipPath id={`${id}_clip`}>
          <path d="M32 3 L57 12 V33 C57 47 46.5 56.8 32 61 C17.5 56.8 7 47 7 33 V12 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}_clip)`}>
        <rect x="0" y="0" width="64" height="64" fill={primary} />
        <path d="M0 44 L64 14 V34 L0 64 Z" fill={secondary} opacity="0.92" />
        <circle cx="32" cy="30" r="21" fill={ink} opacity="0.08" />
      </g>
      <path
        d="M32 3 L57 12 V33 C57 47 46.5 56.8 32 61 C17.5 56.8 7 47 7 33 V12 Z"
        fill="none"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth="1.6"
      />
      <text
        x="32"
        y={abbr.length > 2 ? 35 : 36}
        textAnchor="middle"
        fontSize={abbr.length > 2 ? 16 : 19}
        fontWeight="800"
        fill={ink}
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing="0.5"
      >
        {abbr.slice(0, 4)}
      </text>
    </svg>
  );
};
