// ---------------------------------------------------------------------------
// Data access layer. All data comes live from the Express API (server/).
// In dev, Vite proxies /api -> http://localhost:4000 (see vite.config.ts).
// ---------------------------------------------------------------------------

import { Club, League, LineupPlayer, Match, MatchView, StandingsTable, Team } from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new Error('Cannot reach the Beyond90 server — is `npm run dev` running?');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getMatches: () => request<Match[]>('/matches'),
  getMatch: (id: number | string) => request<Match>(`/matches/${id}`),
  getLeagues: () => request<League[]>('/leagues'),
  getTeams: () => request<Team[]>('/teams'),
  getClubs: () => request<Club[]>('/clubs'),
  getStandings: () => request<StandingsTable[]>('/standings'),
};

/** Accent-insensitive, case-insensitive normalization for search. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Derives how a match should be displayed at a point in time:
 * - finished  → status is 'finished'
 * - upcoming  → kick-off in the future
 * - live      → kick-off was in the past, in play or at half time ('ht')
 */
export function viewOf(match: Match, now: number = Date.now()): MatchView {
  if (match.status === 'finished') return { match, phase: 'finished' };
  if (match.status === 'ht') return { match, phase: 'live' };
  const started = now >= new Date(match.startTime).getTime();
  return { match, phase: started ? 'live' : 'upcoming' };
}

/** Score a match currently stands at — HT score while status is 'ht'. */
export function currentScore(match: Match): { home: number; away: number } {
  if (match.status === 'ht') {
    return {
      home: match.homeHtScore ?? match.homeScore,
      away: match.awayHtScore ?? match.awayScore,
    };
  }
  return { home: match.homeScore, away: match.awayScore };
}

export function searchMatches(matches: Match[], query: string): Match[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  return matches.filter(m => fold(`${m.homeTeam} ${m.awayTeam}`).includes(q));
}

export interface LeagueGroup {
  league: League | null; // null → legacy matches without a league ("Other")
  list: Match[];
}

/** Groups matches into one section per league, alphabetically; league-less last. */
export function groupByLeague(matches: Match[]): LeagueGroup[] {
  const map = new Map<string, LeagueGroup>();
  for (const m of matches) {
    const key = m.league ? `l${m.league.id}` : 'none';
    const group = map.get(key) ?? { league: m.league ?? null, list: [] };
    group.list.push(m);
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => {
    if (!a.league) return 1;
    if (!b.league) return -1;
    return a.league.name.localeCompare(b.league.name);
  });
}

/** All descendants (children, grandchildren…) of a league, from the flat list. */
export function descendantLeagues(leagueId: number, all: League[]): League[] {
  const byParent = new Map<number, League[]>();
  for (const l of all) {
    if (l.parentId == null) continue;
    const siblings = byParent.get(l.parentId) ?? [];
    siblings.push(l);
    byParent.set(l.parentId, siblings);
  }
  const out: League[] = [];
  const walk = (id: number) => {
    for (const child of byParent.get(id) ?? []) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(leagueId);
  return out;
}

/** League chain above a club, nearest first — e.g. "LaLiga · EFC". */
export function teamSubline(team: Team, all: League[]): string {
  const chain: string[] = [];
  const seen = new Set<number>();
  let cur = all.find(l => l.id === team.leagueId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur.name);
    cur = all.find(l => l.id === cur!.parentId);
  }
  return chain.join(' · ');
}

/** Ancestor chain above a league (excluding itself), nearest first — "EFC" or "". */
export function leaguePath(league: League, all: League[]): string {
  const parts: string[] = [];
  const seen = new Set<number>([league.id]);
  let cur = all.find(l => l.id === league.parentId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.push(cur.name);
    cur = all.find(l => l.id === cur!.parentId);
  }
  return parts.join(' · ');
}

/**
 * The line under a league name. Container leagues only show how many leagues
 * sit inside them; plain leagues show team and match counts, zero hidden.
 */
export function leagueSubline(league: League, all: League[]): string {
  const kids = descendantLeagues(league.id, all);
  if (kids.length > 0) return `${kids.length} league${kids.length === 1 ? '' : 's'}`;
  const teams = league.teamCount ?? 0;
  const matches = league.matchCount ?? 0;
  const parts: string[] = [];
  if (teams > 0) parts.push(`${teams} team${teams === 1 ? '' : 's'}`);
  if (matches > 0) parts.push(`${matches} match${matches === 1 ? '' : 'es'}`);
  return parts.join(' · ');
}

/** Safely parses a stored lineup JSON string into players. */
export function parseLineup(raw?: string | null): LineupPlayer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is LineupPlayer => typeof p?.pos === 'string' && typeof p?.name === 'string');
  } catch {
    return [];
  }
}
