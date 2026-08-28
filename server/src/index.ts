import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// All data + live-update endpoints live under /api. The built React site (served
// at /) issues every request — including its SSE stream — to /api/…, so mounting
// the routes here keeps production and development (Vite proxy) aligned.
const api = express.Router();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function parseTeamName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40) return null;
  return trimmed;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  return n;
}

function parseId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const STATUSES = ['scheduled', 'ht', 'finished'];

// /friendlymatch files its games under this auto-created league; exhibition
// games don't earn a standings table, so it's skipped in GET /standings
const FRIENDLY_LEAGUE_NAME = 'Friendly Matches';

// ---------------------------------------------------------------------------
// Live updates — Server-Sent Events stream. Every mutation calls
// notifyChange() so open website tabs refetch instantly (no manual refresh).
// ---------------------------------------------------------------------------

const sseClients = new Set<Response>();

function notifyChange(): void {
  for (const client of sseClients) {
    try {
      client.write('data: changed\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}

api.get('/events', (req: Request, res: Response) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  sseClients.add(res);
  // ping keeps proxies from idling the connection out
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* closed */
    }
  }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

function parseLeagueName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40) return null;
  return trimmed;
}

function parseEmoji(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // custom Discord emoji, e.g. <:partyparrot:123456789012345678> or animated <a:...:...>
  if (/^<a?:\w+:\d+>$/.test(trimmed)) return trimmed;
  // unicode emoji: up to 4 grapheme clusters (flags, ZWJ sequences)
  const graphemes = [...trimmed];
  if (graphemes.length === 0 || graphemes.length > 4 || trimmed.length > 16) return null;
  return trimmed;
}

// club directory entries link to the club's own Discord server
function parseInvite(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > 300) return null;
  // discord.gg/xyz, discord.com/invite/xyz (+ optional query string)
  return /^https:\/\/(www\.)?(discord\.gg\/\w+|discord\.com\/invite\/\w+)(\?\S*)?$/i.test(trimmed) ? trimmed : null;
}

const includeLeague = { league: true };

// List all matches (earliest first)
api.get('/matches', async (_req: Request, res: Response) => {
  try {
    const matches = await prisma.match.findMany({ orderBy: { startTime: 'asc' }, include: includeLeague });
    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Get a single match
api.get('/matches/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid match id' });
  try {
    const match = await prisma.match.findUnique({ where: { id }, include: includeLeague });
    if (!match) return res.status(404).json({ error: `Match ${id} not found` });
    res.json(match);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

// Add a match
api.post('/matches', async (req: Request, res: Response) => {
  const homeTeam = parseTeamName(req.body?.homeTeam);
  const awayTeam = parseTeamName(req.body?.awayTeam);
  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ error: 'homeTeam and awayTeam are required (max 40 characters each)' });
  }
  const startTime = parseDate(req.body?.startTime);
  if (!startTime) {
    return res.status(400).json({ error: 'startTime is required and must be a valid date (e.g. 2026-08-30T18:00:00Z)' });
  }

  const leagueId = parseId(req.body?.leagueId);
  if (leagueId == null) {
    return res.status(400).json({ error: 'leagueId is required — create a league first with /addleague' });
  }
  try {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ error: `League ${leagueId} not found` });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to look up league' });
  }

  let status = typeof req.body?.status === 'string' ? req.body.status : 'scheduled';
  if (!STATUSES.includes(status)) status = 'scheduled';

  let homeScore = req.body?.homeScore === undefined || req.body?.homeScore === null ? 0 : parseScore(req.body.homeScore);
  let awayScore = req.body?.awayScore === undefined || req.body?.awayScore === null ? 0 : parseScore(req.body.awayScore);
  if (homeScore === null || awayScore === null) {
    return res.status(400).json({ error: 'homeScore/awayScore must be whole numbers between 0 and 999' });
  }

  try {
    const match = await prisma.match.create({
      data: { homeTeam, awayTeam, startTime, homeScore, awayScore, status, leagueId },
      include: includeLeague,
    });
    notifyChange();
    res.status(201).json(match);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create match' });
  }
});

// Update a match (score, kickoff time, or status)
api.patch('/matches/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid match id' });

  const data: Record<string, unknown> = {};

  if (req.body?.startTime !== undefined) {
    const startTime = parseDate(req.body.startTime);
    if (!startTime) return res.status(400).json({ error: 'startTime must be a valid date' });
    data.startTime = startTime;
  }
  if (req.body?.homeScore !== undefined) {
    const s = parseScore(req.body.homeScore);
    if (s === null) return res.status(400).json({ error: 'homeScore must be a whole number between 0 and 999' });
    data.homeScore = s;
  }
  if (req.body?.awayScore !== undefined) {
    const s = parseScore(req.body.awayScore);
    if (s === null) return res.status(400).json({ error: 'awayScore must be a whole number between 0 and 999' });
    data.awayScore = s;
  }
  if (req.body?.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: "status must be 'scheduled', 'ht' or 'finished'" });
    }
    data.status = req.body.status;
  }
  for (const field of ['homeHtScore', 'awayHtScore'] as const) {
    if (req.body?.[field] !== undefined) {
      if (req.body[field] === null) {
        data[field] = null; // explicit clear
      } else {
        const s = parseScore(req.body[field]);
        if (s === null) return res.status(400).json({ error: `${field} must be a whole number between 0 and 999 (or null)` });
        data[field] = s;
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return res
      .status(400)
      .json({ error: 'Nothing to update — send startTime, homeScore, awayScore, homeHtScore, awayHtScore or status' });
  }

  try {
    const match = await prisma.match.update({ where: { id }, data });
    notifyChange();
    res.json(match);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: `Match ${id} not found` });
    res.status(500).json({ error: 'Failed to update match' });
  }
});

// Save a lineup (home or away) for a match
api.post('/matches/:id/lineup', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid match id' });

  const side = req.body?.side;
  if (side !== 'home' && side !== 'away') {
    return res.status(400).json({ error: "side must be 'home' or 'away'" });
  }
  const players = req.body?.players;
  if (!Array.isArray(players) || players.length > 7) {
    return res.status(400).json({ error: 'players must be an array with at most 11 entries' });
  }
  for (const p of players) {
    if (
      typeof p?.pos !== 'string' || !p.pos.trim() || p.pos.length > 6 ||
      typeof p?.name !== 'string' || !p.name.trim() || p.name.length > 40
    ) {
      return res.status(400).json({ error: 'each player needs a pos (max 6 chars) and name (max 40 chars)' });
    }
  }

  const column = side === 'home' ? 'homeLineup' : 'awayLineup';
  try {
    const match = await prisma.match.update({
      where: { id },
      data: { [column]: players.length > 0 ? JSON.stringify(players.map((p: any) => ({ pos: String(p.pos).toUpperCase(), name: String(p.name).trim() }))) : null },
    });
    notifyChange();
    res.json(match);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: `Match ${id} not found` });
    res.status(500).json({ error: 'Failed to save lineup' });
  }
});

// Delete a match
api.delete('/matches/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid match id' });
  try {
    await prisma.match.delete({ where: { id } });
    notifyChange();
    res.status(204).send();
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: `Match ${id} not found` });
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

// List all leagues (with match and team counts)
api.get('/leagues', async (_req: Request, res: Response) => {
  try {
    const leagues = await prisma.league.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { matches: true, teamLinks: true } } },
    });
    res.json(leagues.map(l => ({ ...l, matchCount: l._count.matches, teamCount: l._count.teamLinks, _count: undefined })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

// Create a league (optionally nested inside another league)
api.post('/leagues', async (req: Request, res: Response) => {
  const emoji = parseEmoji(req.body?.emoji);
  const name = parseLeagueName(req.body?.name);
  if (!emoji) return res.status(400).json({ error: 'emoji is required (a single emoji like 🏆, or a custom Discord emoji)' });
  if (!name) return res.status(400).json({ error: 'name is required (max 40 characters)' });

  let parentId: number | null = null;
  if (req.body?.parentId !== undefined && req.body?.parentId !== null) {
    parentId = parseId(req.body.parentId);
    if (parentId == null) return res.status(400).json({ error: 'parentId must be a valid league id' });
    try {
      const parent = await prisma.league.findUnique({ where: { id: parentId } });
      if (!parent) return res.status(404).json({ error: `Parent league ${parentId} not found` });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to look up parent league' });
    }
  }

  try {
    const existing = await prisma.league.findUnique({ where: { name } });
    if (existing) return res.status(409).json({ error: `League "${name}" already exists` });
    const league = await prisma.league.create({ data: { emoji, name, ...(parentId ? { parentId } : {}) } });
    notifyChange();
    res.status(201).json(league);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// Edit a league's name and/or emoji
api.put('/leagues/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid league id' });

  const data: { name?: string; emoji?: string } = {};
  if (req.body?.name !== undefined) {
    const name = parseLeagueName(req.body.name);
    if (!name) return res.status(400).json({ error: 'name must be 1-40 characters' });
    data.name = name;
  }
  if (req.body?.emoji !== undefined) {
    const emoji = parseEmoji(req.body.emoji);
    if (!emoji) return res.status(400).json({ error: 'emoji is required (a single emoji like 🏆, or a custom Discord emoji)' });
    data.emoji = emoji;
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Provide at least a name or emoji to update' });

  try {
    const league = await prisma.league.update({ where: { id }, data });
    notifyChange();
    res.json(league);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: `League ${id} not found` });
    if (e?.code === 'P2002') return res.status(409).json({ error: 'A league with that name already exists' });
    res.status(500).json({ error: 'Failed to update league' });
  }
});

// Delete a league (its matches stay but lose their league)
api.delete('/leagues/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid league id' });
  try {
    await prisma.league.delete({ where: { id } });
    notifyChange();
    res.status(204).send();
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: `League ${id} not found` });
    res.status(500).json({ error: 'Failed to delete league' });
  }
});

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

// List all teams (with their league)
api.get('/teams', async (_req: Request, res: Response) => {
  try {
    const teams = await prisma.team.findMany({ orderBy: { createdAt: 'asc' }, include: { league: { include: { parent: true } } } });
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Add a team to a league
api.post('/teams', async (req: Request, res: Response) => {
  const name = parseTeamName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name is required (max 40 characters)' });
  const emoji = parseEmoji(req.body?.emoji);
  if (!emoji) return res.status(400).json({ error: 'emoji is required — one unicode or custom Discord emoji' });
  const leagueId = parseId(req.body?.leagueId);
  if (leagueId == null) return res.status(400).json({ error: 'leagueId is required — pick a league' });

  try {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ error: `League ${leagueId} not found` });
    const members = await prisma.teamLeague.findMany({ where: { leagueId }, include: { team: true } });
    const clash = members.find(m => m.team.name.toLowerCase() === name.toLowerCase());
    if (clash) return res.status(409).json({ error: `${name} is already in ${league.name}` });
    const team = await prisma.team.create({
      data: { name, emoji, leagueId, teamLinks: { create: [{ leagueId }] } },
      include: { league: true },
    });
    notifyChange();
    res.status(201).json(team);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// Edit an existing team (badge and/or name)
api.patch('/teams/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid team id' });

  const updates: { name?: string; emoji?: string } = {};
  if (req.body?.name !== undefined) {
    const name = parseTeamName(req.body.name);
    if (!name) return res.status(400).json({ error: 'name must be 1-40 characters' });
    updates.name = name;
  }
  if (req.body?.emoji !== undefined) {
    const emoji = parseEmoji(req.body.emoji);
    if (!emoji) return res.status(400).json({ error: 'emoji must be one unicode or custom Discord emoji' });
    updates.emoji = emoji;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to update — send a name and/or emoji' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return res.status(404).json({ error: `Team ${id} not found` });
    if (updates.name) {
      const siblings = await prisma.team.findMany({
        where: { leagueId: team.leagueId, NOT: { id } },
        select: { id: true, name: true },
      });
      const clash = siblings.find(t => t.name.toLowerCase() === updates.name!.toLowerCase());
      if (clash) return res.status(409).json({ error: `${updates.name} is already in this league` });
    }
    const updated = await prisma.team.update({ where: { id }, data: updates, include: { league: true } });
    notifyChange();
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// Remove a team
api.delete('/teams/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid team id' });
  try {
    await prisma.team.delete({ where: { id } });
    notifyChange();
    res.status(204).send();
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: `Team ${id} not found` });
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// ---------------------------------------------------------------------------
// Clubs — the community club directory on the website's home sidebar.
// Standalone entries (emoji + name + Discord invite), managed via /add-club
// and /remove-club on Discord; separate from league teams.
// ---------------------------------------------------------------------------

api.get('/clubs', async (_req: Request, res: Response) => {
  try {
    const clubs = await prisma.club.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(clubs);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch clubs' });
  }
});

api.post('/clubs', async (req: Request, res: Response) => {
  const emoji = parseEmoji(req.body?.emoji);
  const name = parseLeagueName(req.body?.name);
  const invite = parseInvite(req.body?.invite);
  if (!emoji) return res.status(400).json({ error: 'emoji is required (a single unicode or custom Discord emoji)' });
  if (!name) return res.status(400).json({ error: 'name is required (max 40 characters)' });
  if (!invite) {
    return res.status(400).json({ error: 'invite is required — a Discord invite link like https://discord.gg/xyz' });
  }

  try {
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const existing = await prisma.club.findMany({ select: { name: true } });
    if (existing.some(c => fold(c.name) === fold(name))) {
      return res.status(409).json({ error: `Club "${name}" already exists` });
    }
    const club = await prisma.club.create({ data: { emoji, name, invite } });
    notifyChange();
    res.status(201).json(club);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create club' });
  }
});

api.delete('/clubs/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid club id' });
  try {
    await prisma.club.delete({ where: { id } });
    notifyChange();
    res.status(204).send();
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: `Club ${id} not found` });
    res.status(500).json({ error: 'Failed to remove club' });
  }
});

// ---------------------------------------------------------------------------
// Standings — one computed table per league that has teams or finished matches
// ---------------------------------------------------------------------------

interface StandingRow {
  position: number;
  team: string;
  emoji: string; // club badge from the registered Team, '' when unknown
  teamId: number | null; // registered Team id (links to its club page), null for name-only rows
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: string[];
}

function blankRow(team: string, emoji = '', teamId: number | null = null): StandingRow {
  return {
    position: 0,
    team,
    emoji,
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    form: [], // most recent first, e.g. ['W','D','L']
  };
}

// ---------------------------------------------------------------------------
// Manual standings adjustments — extra W/D/L/GF/GA/points layered onto the
// auto-computed table (untracked results, point deductions, corrections)
// ---------------------------------------------------------------------------

const ADJUST_FIELDS = [
  'won',
  'drawn',
  'lost',
  'goalsFor',
  'goalsAgainst',
  'points',
] as const;

const ADJUST_COLUMN: Record<(typeof ADJUST_FIELDS)[number], string> = {
  won: 'extraWon',
  drawn: 'extraDrawn',
  lost: 'extraLost',
  goalsFor: 'extraGoalsFor',
  goalsAgainst: 'extraGoalsAgainst',
  points: 'extraPoints',
};

function parseAdjustValue(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < -999 || n > 999) return null;
  return n;
}

api.put('/standings/adjust', async (req: Request, res: Response) => {
  const leagueId = parseId(req.body?.leagueId);
  const teamId = parseId(req.body?.teamId);
  if (leagueId == null || teamId == null) {
    return res.status(400).json({ error: 'leagueId and teamId are required' });
  }

  const data: Record<string, number> = {};
  for (const field of ADJUST_FIELDS) {
    if (req.body?.[field] !== undefined && req.body?.[field] !== null) {
      const v = parseAdjustValue(req.body[field]);
      if (v === null) {
        return res.status(400).json({ error: `${field} must be a whole number between -999 and 999` });
      }
      data[ADJUST_COLUMN[field]] = v;
    }
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to adjust — send won/drawn/lost/goalsFor/goalsAgainst/points' });
  }

  try {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ error: `League ${leagueId} not found` });
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: `Team ${teamId} not found` });

    // only clubs actually competing in that league can have tweaks — otherwise
    // the edit would silently never show up in the table
    const member =
      team.leagueId === leagueId ||
      (await prisma.teamLeague.findUnique({
        where: { teamId_leagueId: { teamId, leagueId } },
      }));
    if (!member) {
      return res.status(409).json({ error: `${team.name} isn't in ${league.name} — add them first with /addteam or /copyteams` });
    }

    await prisma.standingAdjust.upsert({
      where: { leagueId_teamId: { leagueId, teamId } },
      update: data,
      create: { leagueId, teamId, ...data },
    });
    const adjust = await prisma.standingAdjust.findUniqueOrThrow({
      where: { leagueId_teamId: { leagueId, teamId } },
    });
    notifyChange();
    res.json({ adjust });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save adjustment' });
  }
});

// Add every club of one league — including nested ones — into another league as
// an additional competition (clubs keep their original leagues)
api.post('/teams/move', async (req: Request, res: Response) => {
  const fromId = parseId(req.body?.fromLeagueId);
  const toId = parseId(req.body?.toLeagueId);
  if (fromId == null || toId == null) return res.status(400).json({ error: 'fromLeagueId and toLeagueId are required' });
  if (fromId === toId) return res.status(400).json({ error: 'Source and target league are the same' });

  try {
    const leagues = await prisma.league.findMany({ select: { id: true, parentId: true } });
    const target = leagues.find(l => l.id === toId);
    if (!target) return res.status(404).json({ error: 'Target league not found' });
    if (!leagues.some(l => l.id === fromId)) return res.status(404).json({ error: 'Source league not found' });

    // source scope = the league itself plus every league nested under it
    const kidsOf = new Map<number, number[]>();
    for (const l of leagues) {
      if (l.parentId != null) {
        const list = kidsOf.get(l.parentId) ?? [];
        list.push(l.id);
        kidsOf.set(l.parentId, list);
      }
    }
    const scope = new Set<number>([fromId]);
    const walk = (cur: number) => {
      for (const kid of kidsOf.get(cur) ?? []) {
        scope.add(kid);
        walk(kid);
      }
    };
    walk(fromId);

    // every club with any membership (home or guest) inside the scope
    const [homes, links] = await Promise.all([
      prisma.team.findMany({ where: { leagueId: { in: [...scope] } }, select: { id: true } }),
      prisma.teamLeague.findMany({ where: { leagueId: { in: [...scope] } }, select: { teamId: true } }),
    ]);
    const teamIds = new Set<number>([...homes.map(t => t.id), ...links.map(l => l.teamId)]);
    // sqlite has no skipDuplicates — pre-filter clubs that already belong
    const existing = await prisma.teamLeague.findMany({
      where: { leagueId: toId, teamId: { in: [...teamIds] } },
      select: { teamId: true },
    });
    const fresh = [...teamIds].filter(id => !existing.some(e => e.teamId === id));
    await prisma.teamLeague.createMany({ data: fresh.map(teamId => ({ teamId, leagueId: toId })) });
    if (fresh.length > 0) notifyChange();
    res.json({ moved: fresh.length, fromLeagueId: fromId, toLeagueId: toId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add teams' });
  }
});

// Put ONE already-registered club into another league as well — it keeps its
// home league and additionally competes in the target one (its row shows up
// in both standings tables)
api.post('/teams/link', async (req: Request, res: Response) => {
  const teamId = parseId(req.body?.teamId);
  const leagueId = parseId(req.body?.leagueId);
  if (teamId == null || leagueId == null) {
    return res.status(400).json({ error: 'teamId and leagueId are required' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: `Team ${teamId} not found` });
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ error: `League ${leagueId} not found` });

    if (team.leagueId === leagueId) {
      return res.status(409).json({ error: `${team.name} already plays in ${league.name} — pick a different league` });
    }
    const existing = await prisma.teamLeague.findUnique({
      where: { teamId_leagueId: { teamId, leagueId } },
    });
    if (existing) {
      return res.status(409).json({ error: `${team.name} is already in ${league.name}` });
    }

    await prisma.teamLeague.create({ data: { teamId, leagueId } });
    notifyChange();
    res.status(201).json({ linked: true, teamId, leagueId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clone club into league' });
  }
});

api.get('/standings', async (_req: Request, res: Response) => {
  try {
    const leagues = await prisma.league.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        teamLinks: { include: { team: true } },
        matches: true,
        standAdjusts: true,
        loadedStandings: true,
      },
    });

    // club badges + ids live on registered teams — imported tables don't carry
    // them, so re-attach by name. Resolution is scoped to the league's own
    // clubs FIRST (home + cloned-in), because several leagues can register a
    // club with the same name and each table must link to its own record.
    const allTeams = await prisma.team.findMany({
      select: { id: true, name: true, emoji: true },
      orderBy: { createdAt: 'asc' },
    });
    // compare accent-insensitively ("Atlético" vs "Atletico")
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // global fallback directory — first-registered club wins a name collision
    const infoByName = new Map<string, { id: number; emoji: string }>();
    for (const t of allTeams) {
      const k = fold(t.name);
      if (!infoByName.has(k)) infoByName.set(k, { id: t.id, emoji: t.emoji });
    }
    // relaxed fallback for name variants ("Tottenham Hotspur" vs "Tottenham")
    const findTeamInfo = (
      name: string,
      leagueId?: number
    ): { emoji: string; teamId: number | null } => {
      const key = fold(name);
      if (leagueId != null) {
        const league = leagues.find(l => l.id === leagueId);
        const local = league?.teamLinks.map(tl => tl.team).find(t => fold(t.name) === key);
        if (local) return { emoji: local.emoji, teamId: local.id };
      }
      const global = infoByName.get(key);
      if (global) return { emoji: global.emoji, teamId: global.id };
      for (const [k, v] of infoByName) {
        if (k && (key.includes(k) || k.includes(key))) return { emoji: v.emoji, teamId: v.id };
      }
      return { emoji: '', teamId: null };
    };

    const tables = leagues
      .map(l => {
        // an imported table (/id-load or /ip-load) fully replaces the computed one
        const loadedRecord = l.loadedStandings[0];
        if (loadedRecord) {
          try {
            const parsed = JSON.parse(loadedRecord.data);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const sorted = parsed
                .map((raw: any) => {
                  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
                  const gf = n(raw?.goalsFor);
                  const ga = n(raw?.goalsAgainst);
                  return {
                    position: n(raw?.position),
                    team: String(raw?.team ?? ''),
                    emoji: typeof raw?.emoji === 'string' ? raw.emoji : '',
                    teamId: null as number | null,
                    played: n(raw?.played),
                    won: n(raw?.won),
                    drawn: n(raw?.drawn),
                    lost: n(raw?.lost),
                    goalsFor: gf,
                    goalsAgainst: ga,
                    goalDiff: raw?.goalDiff !== undefined ? n(raw.goalDiff) : gf - ga,
                    points: n(raw?.points),
                    form: Array.isArray(raw?.form)
                      ? raw.form.filter((f: any) => f === 'W' || f === 'D' || f === 'L').slice(0, 5)
                      : [],
                  };
                })
                .filter((row: any) => row.team)
                .sort((a: any, b: any) => a.position - b.position)
                .map((row: any, i: number) => {
                  const info = findTeamInfo(row.team, l.id);
                  return {
                    ...row,
                    position: i + 1,
                    emoji: info.emoji || row.emoji || '',
                    teamId: info.teamId,
                  };
                });
              return { league: { id: l.id, emoji: l.emoji, name: l.name }, rows: sorted };
            }
          } catch {
            // corrupt stored JSON — fall through and compute normally
          }
        }

        // friendlies are exhibition games — no table (a loaded one would still show)
        if (l.name === FRIENDLY_LEAGUE_NAME) return null;

        // clubs via their league memberships (a club can be in several leagues)
        const teams = l.teamLinks.map(tl => tl.team);
        const adjusts = new Map(l.standAdjusts.map(a => [a.teamId, a]));
        // which table row belongs to which registered club — manual tweaks key
        // off the Team record, rows created purely from match names have none
        const teamIdByKey = new Map<string, number>();
        const finished = l.matches
          .filter(m => m.status === 'finished')
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        // a league earns a table once it has teams or any played games
        if (teams.length === 0 && finished.length === 0) return null;

        const rows = new Map<string, StandingRow>();
        for (const t of teams) {
          rows.set(t.name.toLowerCase(), blankRow(t.name, t.emoji, t.id));
          teamIdByKey.set(t.name.toLowerCase(), t.id);
        }
        for (const m of finished) {
          for (const name of [m.homeTeam, m.awayTeam]) {
            const key = name.toLowerCase();
            if (!rows.has(key)) rows.set(key, blankRow(name));
          }
          const home = rows.get(m.homeTeam.toLowerCase())!;
          const away = rows.get(m.awayTeam.toLowerCase())!;
          home.played++; away.played++;
          home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
          away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
          if (m.homeScore > m.awayScore) {
            home.won++; away.lost++;
            home.points += 3;
            home.form.unshift('W'); away.form.unshift('L');
          } else if (m.homeScore < m.awayScore) {
            away.won++; home.lost++;
            away.points += 3;
            away.form.unshift('W'); home.form.unshift('L');
          } else {
            home.drawn++; away.drawn++;
            home.points++; away.points++;
            home.form.unshift('D'); away.form.unshift('D');
          }
        }

        // layer manual tweaks on top (untracked wins, deductions…) before sorting
        for (const [key, teamId] of teamIdByKey) {
          const adj = adjusts.get(teamId);
          if (!adj) continue;
          const row = rows.get(key)!;
          row.won += adj.extraWon;
          row.drawn += adj.extraDrawn;
          row.lost += adj.extraLost;
          row.played += adj.extraWon + adj.extraDrawn + adj.extraLost;
          row.goalsFor += adj.extraGoalsFor;
          row.goalsAgainst += adj.extraGoalsAgainst;
          row.points += adj.extraPoints;
        }

        const sorted = [...rows.values()]
          .map(r => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst, form: r.form.slice(0, 5) }))
          .sort(
            (a, b) =>
              b.points - a.points ||
              b.goalDiff - a.goalDiff ||
              b.goalsFor - a.goalsFor ||
              a.team.localeCompare(b.team)
          )
          .map((r, i) => ({ ...r, position: i + 1 }));

        return { league: { id: l.id, emoji: l.emoji, name: l.name }, rows: sorted };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    res.json(tables);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute standings' });
  }
});

// ---------------------------------------------------------------------------
// Manually load standings for a league — useful for importing a table
// (e.g. via /ip-load from the Discord bot). The data field should be a JSON
// string produced by the client or any source that matches the StandingRow
// format: position, team, played, won, drawn, lost, goalsFor, goalsAgainst,
// goalDiff, points, form.
// ---------------------------------------------------------------------------

api.post('/standings/load', async (req: Request, res: Response) => {
  const leagueId = parseId(req.body?.leagueId);
  const data = req.body?.data;
  if (leagueId == null || !data || typeof data !== 'string') {
    return res.status(400).json({ error: 'leagueId and data (JSON string) are required' });
  }
  try {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ error: `League ${leagueId} not found` });

    // validate the JSON has the expected shape
    const rows = JSON.parse(data);
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'data must be a JSON array of rows' });
    }
    // basic column check — keep it lightweight
    const required = ['position', 'team', 'played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDiff', 'points', 'form'];
    for (const r of rows) {
      for (const f of required) {
        if (!(f in r)) {
          return res.status(400).json({ error: `Row missing field: ${f}` });
        }
      }
    }

    // delete any previous loaded standings for this league
    await prisma.loadedStandings.deleteMany({ where: { leagueId } });

    const loaded = await prisma.loadedStandings.create({
      data: { leagueId, data },
    });
    notifyChange();
    res.json({ loaded, message: 'Standings loaded successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load standings' });
  }
});

const PORT = Number(process.env.PORT) || 4000;

// Serve the built React client (requests outside /api) in production
app.use('/api', api);
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Clean JSON errors instead of stack dumps — most commonly a request whose
// body isn't valid JSON (e.g. a bare string pasted from a terminal test)
app.use((err: any, _req: Request, res: Response, _next: unknown) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  console.error('[API] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[API] ✅ Website + API server listening on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('[API] Serving the built website from client/dist');
  }
});
