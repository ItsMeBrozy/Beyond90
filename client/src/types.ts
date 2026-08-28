// ---------------------------------------------------------------------------
// Domain types — these match the REST API served by the Express/Prisma server
// (see server/src/index.ts). Everything on the site comes from that API; there
// is no mock data anywhere in the client.
// ---------------------------------------------------------------------------

export type MatchStatus = 'scheduled' | 'ht' | 'finished';

export interface League {
  id: number;
  emoji: string;
  name: string;
  matchCount?: number;
  teamCount?: number;
  parentId?: number | null; // set when this league lives inside another league
}

/** A club registered in a league via /addteam on Discord. */
export interface Team {
  id: number;
  name: string;
  emoji?: string; // badge; '' for teams added before emojis were required
  leagueId: number;
  league?: League;
}

/** A club in the home-sidebar directory (added via /add-club on Discord). */
export interface Club {
  id: number;
  emoji: string;
  name: string;
  invite: string; // Discord invite URL for the club's own server
}

export type FormResult = 'W' | 'D' | 'L';

/** One row of a league standings table. */
export interface StandingRow {
  position: number;
  team: string;
  emoji?: string; // club badge; missing for names that never got a /addteam entry
  teamId?: number | null; // registered club's id — links its table row to /team/:id
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: FormResult[]; // most recent first
  // Manual adjustments layered on top of the auto-computed table
  extraWon?: number;
  extraDrawn?: number;
  extraLost?: number;
  extraGoalsFor?: number;
  extraGoalsAgainst?: number;
  extraPoints?: number;
}

/** A league's standings table (from GET /standings). */
export interface StandingsTable {
  league: League;
  rows: StandingRow[];
}

export interface Match {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startTime: string; // ISO date string
  homeScore: number;
  awayScore: number;
  homeHtScore?: number | null; // half-time score (null until /halftime runs)
  awayHtScore?: number | null;
  status: MatchStatus;
  homeLineup?: string | null; // JSON: [{pos, name}]
  awayLineup?: string | null; // JSON: [{pos, name}]
  league?: League | null;
}

/** One slot in a starting lineup (from /generate-lineup on Discord). */
export interface LineupPlayer {
  pos: string;
  name: string;
}

/** How a match should be displayed right now, derived from startTime/status. */
export type MatchPhase = 'upcoming' | 'live' | 'finished';

export interface MatchView {
  match: Match;
  phase: MatchPhase;
}

/** A news post filed under a league (from /news on Discord). */
export interface News {
  id: number;
  leagueId: number;
  content: string; // raw text with Discord-style formatting (**bold**, - bullets, # headings…)
  images: string; // JSON string array of image URLs
  author: string;
  createdAt: string; // ISO date string
  league?: League | null;
}
