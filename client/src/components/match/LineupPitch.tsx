import React from 'react';
import { LineupPlayer } from '../../types';
import { TeamBadge } from '../ui/TeamBadge';

// ---------------------------------------------------------------------------
// FotMob-style combined line-up board: one dark pitch, home on the left half,
// away on the right (mirrored), players as circle avatars with names below.
//
// NOTE FOR MAINTAINERS: slotFor() / layout() / detectFormation() are mirrored
// in bot/src/lineup.ts (the Discord image renderer) — keep the two in sync.
// ---------------------------------------------------------------------------

/** Position code -> slot on a team's own half, in % (x across, y towards goal). */
const SLOTS: Record<string, [number, number]> = {
  GK: [50, 93],
  CB: [50, 79], LCB: [33, 79], RCB: [67, 79], LB: [14, 73], RB: [86, 73],
  LWB: [11, 65], RWB: [89, 65], CD: [50, 79],
  CDM: [50, 63], DM: [50, 63], CM: [50, 53], LCM: [29, 53], RCM: [71, 53],
  LM: [13, 54], RM: [87, 54], M: [50, 53],
  CAM: [50, 43], AM: [50, 43], SS: [50, 34], CF: [50, 25],
  LW: [15, 26], RW: [85, 26], LF: [31, 30], RF: [69, 30], ST: [50, 14],
};

function slotFor(pos: string): [number, number] {
  const key = pos.toUpperCase().replace(/[^A-Z]/g, '');
  if (SLOTS[key]) return SLOTS[key];
  if (/^[LR]/.test(key)) {
    const base = SLOTS[key.slice(1)];
    if (base) {
      const x = Math.min(87, Math.max(13, base[0] + (key[0] === 'L' ? -24 : 24)));
      return [x, base[1]];
    }
  }
  if (key.includes('GK') || key.includes('KEEPER')) return SLOTS.GK;
  if (/M$/.test(key)) return [50, 53];
  if (/[TF]$/.test(key) || key.includes('STR')) return [50, 25];
  if (/B$/.test(key) || key.includes('DEF')) return [50, 73];
  return [50, 43];
}

/** Spacing constants in % (must match the bot renderer). */
const BAND_Y_TOL = 8;
const MIN_GAP_X = 25;
const X_SPAN: [number, number] = [10, 90];

interface Placed {
  p: LineupPlayer;
  x: number;
  y: number;
}

/**
 * Places players without overlap: players that resolve to (roughly) the same
 * line of the pitch are spread along that line while keeping their order.
 */
function layout(players: LineupPlayer[]): Placed[] {
  const placed: Placed[] = players.map(p => {
    const [x, y] = slotFor(p.pos);
    return { p, x, y };
  });

  type Band = { cy: number; items: Placed[] };
  const bands: Band[] = [];
  for (const it of placed) {
    const band = bands.find(b => Math.abs(b.cy - it.y) <= BAND_Y_TOL);
    if (band) {
      band.items.push(it);
      band.cy = band.items.reduce((s, i) => s + i.y, 0) / band.items.length;
    } else {
      bands.push({ cy: it.y, items: [it] });
    }
  }

  for (const band of bands) {
    band.items.sort((a, b) => a.x - b.x);
    const n = band.items.length;
    const span = X_SPAN[1] - X_SPAN[0];
    let xs: number[];
    if (n * MIN_GAP_X > span) {
      xs = band.items.map((_, i) => X_SPAN[0] + (span * i) / Math.max(1, n - 1));
    } else {
      xs = band.items.map(i => i.x);
      for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i], xs[i - 1] + MIN_GAP_X);
      xs[n - 1] = Math.min(xs[n - 1], X_SPAN[1]);
      for (let i = n - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - MIN_GAP_X);
      xs[0] = Math.max(xs[0], X_SPAN[0]);
    }
    band.items.forEach((it, i) => {
      it.x = xs[i];
    });
  }

  return placed;
}

/**
 * Rotates a team's own-half layout onto one side of the shared pitch:
 * home attacks right (own goal at the left edge), away is mirrored.
 */
function halfPlaced(players: LineupPlayer[], side: 'home' | 'away'): Placed[] {
  return layout(players).map(({ p, x, y }) => ({
    p,
    x: side === 'home' ? 50 - y * 0.45 : 50 + y * 0.45,
    y: 12 + (x / 100) * 76,
  }));
}

/**
 * Derives a formation string like "3-1-2"; null unless it's a complete
 * starting seven.
 */
function detectFormation(players: LineupPlayer[]): string | null {
  if (players.length !== 7) return null;
  let def = 0, mid = 0, att = 0;
  for (const p of players) {
    const [, y] = slotFor(p.pos);
    const key = p.pos.toUpperCase().replace(/[^A-Z]/g, '');
    if (key === 'GK') continue;
    if (y >= 70) def++;
    else if (y >= 45) mid++;
    else att++;
  }
  if (def + mid + att !== 6) return null;
  return `${def}-${mid}-${att}`;
}

interface PlayerDotProps {
  placed: Placed;
  /** The player's club — its badge fills the avatar circle. */
  team: string;
}

const PlayerDot: React.FC<PlayerDotProps> = ({ placed, team }) => (
  <div
    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
    style={{ left: `${placed.x}%`, top: `${placed.y}%` }}
  >
    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-surface3 to-surface2 ring-2 ring-white/20 shadow-lg sm:h-12 sm:w-12">
      <TeamBadge name={team} size={20} className="sm:hidden" />
      <TeamBadge name={team} size={28} className="hidden sm:inline-flex" />
    </span>
    <span className="max-w-[68px] truncate rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold leading-tight text-white sm:max-w-[88px] sm:text-[11px]">
      {placed.p.name.replace(/^@+/, '')}
    </span>
  </div>
);

export const LineupPitch: React.FC<{
  homeTeam: string;
  awayTeam: string;
  homePlayers: LineupPlayer[];
  awayPlayers: LineupPlayer[];
}> = ({ homeTeam, awayTeam, homePlayers, awayPlayers }) => {
  const homeFormation = detectFormation(homePlayers);
  const awayFormation = detectFormation(awayPlayers);
  const home = halfPlaced(homePlayers, 'home');
  const away = halfPlaced(awayPlayers, 'away');

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
      {/* header: home badge + name + formation … formation + name + away badge */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface2 px-3 py-2.5 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <TeamBadge name={homeTeam} size={24} className="shrink-0" />
          <span className="truncate text-[13px] font-extrabold text-txt sm:text-sm">{homeTeam}</span>
          <span className="tnum shrink-0 text-xs font-bold text-muted sm:text-sm">
            {homeFormation ?? (homePlayers.length > 0 ? `${homePlayers.length} sel` : '')}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <span className="tnum shrink-0 text-xs font-bold text-muted sm:text-sm">
            {awayFormation ?? (awayPlayers.length > 0 ? `${awayPlayers.length} sel` : '')}
          </span>
          <span className="truncate text-[13px] font-extrabold text-txt sm:text-sm">{awayTeam}</span>
          <TeamBadge name={awayTeam} size={24} className="shrink-0" />
        </div>
      </div>

      {/* the pitch */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#16191f] sm:aspect-[16/9]">
        {/* subtle turf vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 75% 65% at 50% 50%, rgba(255,255,255,0.015) 45%, rgba(0,0,0,0.28) 100%)',
          }}
        />
        {/* markings */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <g fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.35" vectorEffect="non-scaling-stroke">
            {/* touchlines */}
            <rect x="1" y="3" width="98" height="94" strokeWidth="0.4" />
            {/* halfway line + centre circle + spot */}
            <line x1="50" y1="3" x2="50" y2="97" strokeWidth="0.4" />
            <circle cx="50" cy="50" r="13" />
            {/* home (left) boxes */}
            <rect x="1" y="22" width="15" height="56" />
            <rect x="1" y="36.5" width="5.5" height="27" />
            {/* away (right) boxes */}
            <rect x="84" y="22" width="15" height="56" />
            <rect x="93.5" y="36.5" width="5.5" height="27" />
            {/* penalty arcs */}
            <path d="M 16 41 A 9 9 0 0 1 16 59" />
            <path d="M 84 41 A 9 9 0 0 0 84 59" />
          </g>
          <circle cx="50" cy="50" r="0.6" fill="rgba(255,255,255,0.18)" />
        </svg>

        {/* players */}
        {home.map((placed, i) => (
          <PlayerDot key={`h_${placed.p.pos}_${placed.p.name}_${i}`} placed={placed} team={homeTeam} />
        ))}
        {away.map((placed, i) => (
          <PlayerDot key={`a_${placed.p.pos}_${placed.p.name}_${i}`} placed={placed} team={awayTeam} />
        ))}
      </div>
    </div>
  );
};

export default LineupPitch;
