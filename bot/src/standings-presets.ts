// Numbered standings datasets for /id-load — one command loads a whole league
// table (and creates the league if it doesn't exist yet).
//
// GF/GA are derived so that goalsFor - goalsAgainst === goalDiff exactly:
// assume ~1 goal conceded per game, then clamp if that would need negative
// goals scored. Form is most-recent-first, capped at 5 games.

export interface StandingsPresetRow {
  position: number;
  team: string;
  emoji?: string;
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

export interface StandingsPreset {
  id: number;
  leagueName: string;
  leagueEmoji: string;
  rows: StandingsPresetRow[];
}

/** Build an API-shaped row from the raw table numbers. */
const r = (
  position: number,
  team: string,
  played: number,
  won: number,
  drawn: number,
  lost: number,
  goalDiff: number,
  points: number
): StandingsPresetRow => {
  let goalsAgainst = played;
  let goalsFor = goalsAgainst + goalDiff;
  if (goalsFor < 0) {
    goalsFor = 0;
    goalsAgainst = -goalDiff;
  }
  const form = [...('W'.repeat(won) + 'D'.repeat(drawn) + 'L'.repeat(lost))]
    .reverse()
    .slice(0, 5);
  return { position, team, played, won, drawn, lost, goalsFor, goalsAgainst, goalDiff, points, form };
};

export const STANDINGS_PRESETS: StandingsPreset[] = [
  {
    id: 1,
    leagueName: 'Premier League',
    leagueEmoji: '⚽',
    rows: [
      r(1, 'Liverpool', 5, 3, 2, 0, 9, 11),
      r(2, 'Newcastle', 5, 3, 1, 1, 2, 10),
      r(3, 'Chelsea', 5, 3, 0, 2, 6, 9),
      r(4, 'Aston Villa', 5, 3, 0, 2, 3, 9),
      r(5, 'Brighton', 5, 3, 0, 2, 0, 9),
      r(6, 'Manchester City', 4, 2, 1, 1, 9, 7),
      r(7, 'Arsenal', 4, 2, 1, 1, 2, 7),
      r(8, 'Manchester United', 5, 2, 0, 3, -3, 6),
      r(9, 'Nottingham Forest', 5, 0, 1, 4, -13, 1),
      r(10, 'Tottenham', 5, 0, 0, 5, -15, 0),
    ],
  },
  {
    id: 2,
    leagueName: 'Serie A',
    leagueEmoji: '🇮🇹',
    rows: [
      r(1, 'Napoli', 5, 4, 1, 0, 19, 13),
      r(2, 'Lazio', 5, 4, 1, 0, 10, 13),
      r(3, 'AS Roma', 5, 4, 0, 1, 13, 12),
      r(4, 'Fiorentina', 5, 3, 0, 2, 2, 9),
      r(5, 'Juventus', 4, 2, 1, 1, 2, 7),
      r(6, 'Bologna', 5, 2, 0, 3, -5, 6),
      r(7, 'AC Milan', 5, 1, 1, 3, -9, 4),
      r(8, 'Como', 5, 0, 3, 2, -5, 3),
      r(9, 'Inter Milan', 5, 0, 1, 4, -14, 1),
      r(10, 'Atalanta', 4, 0, 0, 4, -13, 0),
    ],
  },
  {
    id: 3,
    leagueName: 'Bundesliga',
    leagueEmoji: '🇩🇪',
    rows: [
      r(1, 'RB Leipzig', 5, 5, 0, 0, 24, 15),
      r(2, 'Wolfsburg', 5, 5, 0, 0, 22, 15),
      r(3, 'Borussia Dortmund', 5, 3, 0, 2, 3, 9),
      r(4, 'Bayer Leverkusen', 4, 2, 0, 2, -2, 6),
      r(5, 'Gladbach', 5, 2, 0, 3, -3, 6),
      r(6, 'Bayern Munich', 5, 2, 0, 3, -5, 6),
      r(7, 'Stuttgart', 5, 2, 0, 3, -7, 6),
      r(8, 'Eintracht Frankfurt', 5, 1, 1, 3, -6, 4),
      r(9, 'Hoffenheim', 5, 1, 1, 3, -13, 4),
      r(10, 'Union Berlin', 4, 0, 0, 4, -13, 0),
    ],
  },
  {
    id: 4,
    leagueName: 'LaLiga',
    leagueEmoji: '🇪🇸',
    rows: [
      r(1, 'Sevilla', 5, 4, 0, 1, 6, 12),
      r(2, 'Girona', 5, 3, 1, 1, 5, 10),
      r(3, 'Barcelona', 5, 3, 0, 2, 7, 9),
      r(4, 'Real Sociedad', 5, 3, 0, 2, 7, 9),
      r(5, 'Real Madrid', 5, 2, 2, 1, 5, 8),
      r(6, 'Villarreal', 5, 2, 1, 2, -1, 7),
      r(7, 'Valencia', 5, 2, 0, 3, -1, 6),
      r(8, 'Athletic Bilbao', 5, 2, 0, 3, -5, 6),
      r(9, 'Real Betis', 5, 1, 0, 4, -11, 3),
      r(10, 'Atlético de Madrid', 5, 1, 0, 4, -12, 3),
    ],
  },
  {
    id: 5,
    leagueName: 'ChampionsLeague',
    leagueEmoji: '🏆',
    rows: [
      r(1, 'Fiorentina', 4, 4, 0, 0, 10, 12),
      r(2, 'Napoli', 4, 3, 1, 0, 17, 10),
      r(3, 'Liverpool', 4, 3, 1, 0, 11, 10),
      r(4, 'Lazio', 4, 3, 0, 1, 10, 9),
      r(5, 'Barcelona', 4, 3, 0, 1, 9, 9),
      r(6, 'Manchester City', 4, 3, 0, 1, 8, 9),
      r(7, 'AS Roma', 4, 3, 0, 1, 8, 9),
      r(8, 'Eintracht Frankfurt', 4, 3, 0, 1, 7, 9),
      r(9, 'RB Leipzig', 4, 3, 0, 1, 7, 9),
      r(10, 'Atalanta', 4, 3, 0, 1, 6, 9),
      r(11, 'Sevilla', 4, 2, 1, 1, 5, 7),
      r(12, 'Union Berlin', 4, 2, 1, 1, 3, 7),
      r(13, 'Chelsea', 4, 2, 1, 1, 2, 7),
      r(14, 'Wolfsburg', 4, 1, 3, 0, 7, 6),
      r(15, 'Juventus', 4, 2, 0, 2, 2, 6),
      r(16, 'Como', 4, 2, 0, 2, 1, 6),
      r(17, 'Villarreal', 4, 2, 0, 2, 1, 6),
      r(18, 'Borussia Dortmund', 4, 2, 0, 2, 0, 6),
      r(19, 'Arsenal', 4, 2, 0, 2, -1, 6),
      r(20, 'Hoffenheim', 4, 2, 0, 2, -1, 6),
      r(21, 'Atlético de Madrid', 4, 2, 0, 2, -2, 6),
      r(22, 'Brighton', 4, 2, 0, 2, -6, 6),
      r(23, 'Real Sociedad', 4, 2, 0, 2, -9, 6),
      r(24, 'Bologna', 4, 1, 2, 1, -2, 5),
      r(25, 'AC Milan', 4, 1, 1, 2, -1, 4),
      r(26, 'Athletic Bilbao', 4, 1, 1, 2, -2, 4),
      r(27, 'Real Betis', 4, 1, 1, 2, -3, 4),
      r(28, 'Real Madrid', 4, 1, 1, 2, -4, 4),
      r(29, 'Bayer Leverkusen', 4, 1, 1, 2, -6, 4),
      r(30, 'Valencia', 4, 1, 1, 2, -6, 4),
      r(31, 'Nottingham Forest', 4, 1, 1, 2, -6, 4),
      r(32, 'Newcastle', 4, 1, 1, 2, -7, 4),
      r(33, 'Girona', 4, 1, 0, 3, -3, 3),
      r(34, 'Manchester United', 4, 1, 0, 3, -6, 3),
      r(35, 'Gladbach', 4, 1, 0, 3, -6, 3),
      r(36, 'Inter Milan', 4, 1, 0, 3, -7, 3),
      r(37, 'Aston Villa', 4, 1, 0, 3, -8, 3),
      r(38, 'Tottenham', 4, 0, 1, 3, -8, 1),
      r(39, 'Bayern Munich', 4, 0, 1, 3, -9, 1),
      r(40, 'Stuttgart', 4, 0, 0, 4, -11, 0),
    ],
  },
];
