import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';

// ---------------------------------------------------------------------------
// /generate-lineup support: parse a "POS - Name" message and render a
// professional tactical-board lineup image.
//
// NOTE FOR MAINTAINERS: slotFor() / layout() / detectFormation() are mirrored
// in client/src/components/match/LineupPitch.tsx — keep the two in sync.
// ---------------------------------------------------------------------------

export interface LineupPlayer {
  pos: string;
  name: string;
}

/** Position code -> slot on the pitch in % (x, y). Attacking upwards. */
const SLOTS: Record<string, [number, number]> = {
  GK: [50, 93],
  CB: [50, 79], LCB: [33, 79], RCB: [67, 79], LB: [14, 73], RB: [86, 73],
  LWB: [11, 65], RWB: [89, 65], CD: [50, 79],
  CDM: [50, 63], DM: [50, 63], CM: [50, 53], LCM: [29, 53], RCM: [71, 53],
  LM: [13, 54], RM: [87, 54], M: [50, 53],
  CAM: [50, 43], AM: [50, 43], SS: [50, 34], CF: [50, 25],
  LW: [15, 26], RW: [85, 26], LF: [31, 30], RF: [69, 30], ST: [50, 14],
};

/**
 * Resolves ANY position code to a sensible pitch slot. Known codes use their
 * exact slot; unknown ones are derived from prefixes/suffixes so things like
 * RST, LCM, RDM, RWB all land where you'd expect instead of stacking centre.
 */
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

/** Spacing constants in % of pitch width/height (mirrored on the website). */
const BAND_Y_TOL = 8;   // players within this vertical distance share a "line"
const MIN_GAP_X = 25;   // minimum horizontal distance between card centres
const X_SPAN: [number, number] = [10, 90];

interface Placed {
  p: LineupPlayer;
  x: number;
  y: number;
}

/**
 * Places players without overlap: players that resolve to (roughly) the same
 * line of the pitch are spread along that line while keeping their order, so
 * tactical shape stays recognizable. Cards never leave the pitch bounds.
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
      // crowded line: distribute evenly across the full width
      xs = band.items.map((_, i) => X_SPAN[0] + (span * i) / Math.max(1, n - 1));
    } else {
      xs = band.items.map(i => i.x);
      // forward pass: enforce min gap left -> right
      for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i], xs[i - 1] + MIN_GAP_X);
      // clamp to right bound
      xs[n - 1] = Math.min(xs[n - 1], X_SPAN[1]);
      // backward pass: push back left while respecting gaps
      for (let i = n - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - MIN_GAP_X);
      xs[0] = Math.max(xs[0], X_SPAN[0]);
    }
    band.items.forEach((it, i) => { it.x = xs[i]; });
  }

  return placed;
}

/**
 * Derives a formation string like "3-1-2" from resolved positions:
 * defenders / midfielders / attackers by pitch line, excluding the GK.
 * Returns null when the lineup doesn't look like a complete starting seven,
 * so callers can show "<n> Players Selected" instead of an invented formation.
 */
export function detectFormation(players: LineupPlayer[]): string | null {
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

/**
 * Parses a multi-line message like:
 *   GK - @user
 *   ST - @user
 * Accepts "-", "–", "=" or ":" separators, optional numbering, code fences.
 * `resolve` maps a raw token (e.g. "<@123456789>") to a display name.
 */
export function parseLineupText(text: string, resolve: (token: string) => string): { players: LineupPlayer[]; error?: string } {
  const cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const players: LineupPlayer[] = [];
  for (const line of lines) {
    if (/^cancel$/i.test(line)) return { players: [], error: 'cancelled' };
    const m = line.match(/^(?:\d+[\).]\s*)?([A-Za-z]{1,5})\s*[-–—=:]\s*(.+)$/);
    if (!m) continue;
    const pos = m[1].toUpperCase();
    let name = m[2].trim();
    name = name.replace(/<@!?(\d+)>/g, (_, id) => resolve(`<@${id}>`) || 'player');
    name = name.replace(/^@/, '').replace(/["`*]/g, '').trim();
    if (!name) continue;
    players.push({ pos, name });
    if (players.length >= 7) break;
  }
  if (players.length === 0) {
    return { players: [], error: 'Could not read any lines — use `POSITION - NAME`, e.g. `GK - @username`.' };
  }
  return { players };
}

// ---------------------------------------------------------------------------
// Tactical board image
// ---------------------------------------------------------------------------

try {
  GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\arialbd.ttf', 'Arial Bold');
  GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\arial.ttf', 'Arial');
} catch {
  /* fall back to whatever default font is available */
}

// crest palette — mirrors client/src/components/ui/Crest.tsx
const PALETTES: [string, string][] = [
  ['#e0245e', '#7d1030'], ['#2f80ed', '#174e8c'], ['#27ae60', '#14683b'],
  ['#f2994a', '#a35613'], ['#9b51e0', '#5b2d86'], ['#eb5757', '#962c2c'],
  ['#219653', '#0f5a31'], ['#f2c94c', '#9c7a10'], ['#56ccf2', '#1a7fa8'],
  ['#bb6bd9', '#6f3483'], ['#ff8a65', '#b34a26'], ['#4fc3f7', '#18708f'],
  ['#aed581', '#5f8534'], ['#ffb74d', '#a3641c'], ['#e57373', '#953f3f'],
  ['#7986cb', '#3f4f96'],
];

function crestFor(name: string): { bg: string; abbr: string } {
  let h = 2166136261;
  const lower = name.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    h ^= lower.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  const abbr = words.length >= 2
    ? words.slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'FC';
  return { bg: PALETTES[(h >>> 0) % PALETTES.length][0], abbr };
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// deterministic PRNG so speckle texture is stable between renders
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 820;
const H = 1010;
const HEADER_H = 116;
const PX = 24;             // pitch left
const PY = HEADER_H + 16;  // pitch top
const PW = W - PX * 2;     // 772
const PH = 850;            // compact ratio ~1:1.10

export async function buildLineupImage(
  sideLabel: string,
  teamName: string,
  matchLabel: string,
  players: LineupPlayer[],
  badgeUrl?: string | null
): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ----- page background -----------------------------------------------------
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, W, H);

  // ----- header --------------------------------------------------------------
  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H + 0.5);
  ctx.lineTo(W, HEADER_H + 0.5);
  ctx.stroke();

  // brand row
  ctx.textAlign = 'left';
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 21px "Arial Bold", Arial';
  ctx.fillText('BEYOND90', 26, 38);

  // match pill (top right)
  ctx.font = 'bold 13px "Arial Bold", Arial';
  const ml = matchLabel.toUpperCase();
  const mlw = ctx.measureText(ml).width + 28;
  roundRect(ctx, W - 26 - mlw, 18, mlw, 28, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  ctx.fillStyle = '#8a93a6';
  ctx.textAlign = 'center';
  ctx.fillText(ml, W - 26 - mlw / 2, 36);

  // divider under brand row
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(26, 58.5);
  ctx.lineTo(W - 26, 58.5);
  ctx.stroke();

  // team row: crest + name + formation badge
  const crest = crestFor(teamName);
  const cr = 21;
  const ccx = 26 + cr;
  const ccy = 87;

  // real club badge when available — drawn bare with no background; initials
  // in a colored circle are the fallback
  let badgeDrawn = false;
  if (badgeUrl) {
    try {
      const img = await loadImage(badgeUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ccx, ccy, cr, 0, Math.PI * 2);
      ctx.clip();
      // contain (not cover) so club crests never get cropped
      const scale = Math.min((cr * 2) / img.width, (cr * 2) / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, ccx - dw / 2, ccy - dh / 2, dw, dh);
      ctx.restore();
      badgeDrawn = true;
    } catch {
      /* network/format issue — fall back to initials */
    }
  }
  if (!badgeDrawn) {
    ctx.beginPath();
    ctx.arc(ccx, ccy, cr, 0, Math.PI * 2);
    ctx.fillStyle = crest.bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "Arial Bold", Arial';
    ctx.textAlign = 'center';
    ctx.fillText(crest.abbr.slice(0, 3), ccx, ccy + 5);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 27px "Arial Bold", Arial';
  let tn = teamName;
  while (ctx.measureText(tn).width > 400 && tn.length > 3) tn = tn.slice(0, -2);
  if (tn !== teamName) tn += '…';
  ctx.fillText(tn, 82, 96);

  // formation badge (or player count when incomplete)
  const formation = detectFormation(players);
  ctx.textAlign = 'center';
  if (formation) {
    const ftxt = formation;
    ctx.font = 'bold 24px "Arial Bold", Arial';
    const fw = ctx.measureText(ftxt).width + 40;
    roundRect(ctx, W - 26 - fw, 66, fw, 42, 12);
    ctx.fillStyle = 'rgba(34,197,94,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34,197,94,0.45)';
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.fillText(ftxt, W - 26 - fw / 2, 94);
  } else {
    const ftxt = `${players.length} SELECTED`;
    ctx.font = 'bold 14px "Arial Bold", Arial';
    const fw = ctx.measureText(ftxt).width + 32;
    roundRect(ctx, W - 26 - fw, 74, fw, 30, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    ctx.fillStyle = '#8a93a6';
    ctx.fillText(ftxt, W - 26 - fw / 2, 93);
  }

  // ----- pitch ----------------------------------------------------------------
  // grass base + mowing stripes
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#12572e' : '#0f4d28';
    ctx.fillRect(PX, PY + (PH / 8) * i, PW, PH / 8);
  }
  // subtle grass speckle texture
  const rnd = mulberry32(7);
  for (let i = 0; i < 420; i++) {
    const sx = PX + rnd() * PW;
    const sy = PY + rnd() * PH;
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(sx, sy, 2, 2);
  }
  // vignette for depth
  const vg = ctx.createRadialGradient(
    PX + PW / 2, PY + PH / 2, PH * 0.28,
    PX + PW / 2, PY + PH / 2, PH * 0.72
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = vg;
  ctx.fillRect(PX, PY, PW, PH);

  // markings
  const u = PW / 68;                 // one metre (width-wise) in px
  const sy = PH / 75;                // vertical compression factor
  const circRy = 9.15 * u * (75 / 105); // circle vertical radius after compression
  const line = 'rgba(255,255,255,0.34)';
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.5;

  // boundary + halfway + centre
  ctx.strokeRect(PX + 1, PY + 1, PW - 2, PH - 2);
  ctx.beginPath();
  ctx.moveTo(PX, PY + PH / 2);
  ctx.lineTo(PX + PW, PY + PH / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(PX + PW / 2, PY + PH / 2, 9.15 * u, circRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(PX + PW / 2, PY + PH / 2, 4, 0, Math.PI * 2);
  ctx.fillStyle = line;
  ctx.fill();

  const boxW = 40.3 * u;
  const boxD = (16.5 / 105) * 75 * sy;
  const sixW = 18.3 * u;
  const sixD = (5.5 / 105) * 75 * sy;
  const spotY = (11 / 105) * 75 * sy;
  const goalW = 7.32 * u;
  const goalD = (2 / 105) * 75 * sy;
  const cxm = PX + PW / 2;

  for (const top of [true, false]) {
    const edge = top ? PY : PY + PH;
    const dir = top ? 1 : -1;
    // penalty box + six-yard box
    ctx.strokeRect(cxm - boxW / 2, top ? PY : PY + PH - boxD, boxW, boxD);
    ctx.strokeRect(cxm - sixW / 2, top ? PY : PY + PH - sixD, sixW, sixD);
    // penalty spot
    ctx.beginPath();
    ctx.arc(cxm, edge + dir * spotY, 3, 0, Math.PI * 2);
    ctx.fill();
    // penalty arc ("D") — only the part outside the box, via clip
    ctx.save();
    ctx.beginPath();
    if (top) ctx.rect(PX, PY + boxD, PW, PH / 2 - boxD);
    else ctx.rect(PX, PY + PH / 2, PW, PH / 2 - boxD);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cxm, edge + dir * spotY, 9.15 * u, circRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // goal
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(cxm - goalW / 2, top ? PY - goalD : PY + PH, goalW, goalD);
    ctx.strokeRect(cxm - goalW / 2, top ? PY - goalD : PY + PH, goalW, goalD);
    ctx.lineWidth = 2.5;
  }
  // corner arcs
  for (const [ax, ay, a0] of [
    [PX, PY, 0], [PX + PW, PY, Math.PI / 2],
    [PX + PW, PY + PH, Math.PI], [PX, PY + PH, -Math.PI / 2],
  ] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(ax, ay, 11, a0, a0 + Math.PI / 2);
    ctx.stroke();
  }

  // ----- player cards -----------------------------------------------------------
  const CARD_W = 190;
  const CARD_H = 60;
  for (const { p, x, y } of layout(players)) {
    const cx = PX + (PW * x) / 100;
    const cy = PY + (PH * y) / 100;
    const left = Math.min(Math.max(cx - CARD_W / 2, PX + 5), PX + PW - CARD_W - 5);
    const top = Math.min(Math.max(cy - CARD_H / 2, PY + 5), PY + PH - CARD_H - 5);
    const isGK = p.pos.toUpperCase().replace(/[^A-Z]/g, '') === 'GK';

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(7,10,15,0.92)';
    roundRect(ctx, left, top, CARD_W, CARD_H, 12);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, left, top, CARD_W, CARD_H, 12);
    ctx.stroke();

    // accent bar on the left edge
    ctx.fillStyle = isGK ? '#fbbf24' : '#22c55e';
    roundRect(ctx, left + 8, top + 12, 3.5, CARD_H - 24, 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = isGK ? '#fbbf24' : '#22c55e';
    ctx.font = 'bold 13px "Arial Bold", Arial';
    ctx.fillText(p.pos.slice(0, 6), left + CARD_W / 2 + 2, top + 23);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px "Arial Bold", Arial';
    let nm = p.name;
    while (ctx.measureText(nm).width > CARD_W - 24 && nm.length > 2) nm = nm.slice(0, -2);
    if (nm !== p.name) nm += '…';
    ctx.fillText(nm, left + CARD_W / 2 + 2, top + 46);
    ctx.textAlign = 'left';
  }

  return canvas.encode('png');
}
