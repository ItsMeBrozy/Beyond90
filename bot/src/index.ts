import {
  ActionRowBuilder,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  InteractionReplyOptions,
  Message,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { buildLineupImage, parseLineupText, detectFormation } from './lineup';
import { STANDINGS_PRESETS } from './standings-presets';

dotenv.config();

// a stray failed interaction reply anywhere must never take the whole bot
// process down — log it and keep the gateway connection alive
process.on('unhandledRejection', (err) => {
  console.error('[BOT] Unhandled rejection (ignored):', err);
});

const token = process.env.DISCORD_TOKEN!;
// API_URL may or may not already include the "/api" prefix the server mounts
// its routes under — normalize so both forms work.
const apiUrl = process.env.API_URL!.replace(/\/+$/, '').replace(/\/api$/, '') + '/api'; // e.g., http://localhost:4000/api

// /friendlymatch files its games under this league (auto-created on first use)
const FRIENDLY_LEAGUE_NAME = 'Friendly Matches';

interface LineupPlayer {
  pos: string;
  name: string;
}

interface ApiMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  homeScore: number;
  awayScore: number;
  homeHtScore?: number | null;
  awayHtScore?: number | null;
  status: 'scheduled' | 'ht' | 'finished';
  league?: ApiLeague | null;
}

interface ApiLeague {
  id: number;
  emoji: string;
  name: string;
  matchCount?: number;
}

interface ApiTeam {
  id: number;
  name: string;
  emoji?: string;
  leagueId: number;
  league?: ApiLeague;
}

// community club directory entry (website home sidebar)
interface ApiClub {
  id: number;
  emoji: string;
  name: string;
  invite: string;
}

interface ApiLeague {
  id: number;
  emoji: string;
  name: string;
  matchCount?: number;
  parentId?: number | null;
  parent?: { id: number; name: string; emoji: string } | null;
}

interface ApiNews {
  id: number;
  leagueId: number;
  content: string;
  images: string;
  author: string;
  createdAt: string;
}

interface StandingRow {
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

interface StandingAdjust {
  extraWon: number;
  extraDrawn: number;
  extraLost: number;
  extraGoalsFor: number;
  extraGoalsAgainst: number;
  extraPoints: number;
}

interface StandingsTable {
  league: ApiLeague;
  rows: StandingRow[];
}

// Accepts full dates ("2026-08-30 18:00", ISO strings) and bare times
// like "7 PM", "7:45pm", "19:30" (interpreted as today).
function parseStartTime(input: string): Date | null {
  const direct = new Date(input);
  if (!Number.isNaN(direct.getTime())) return direct;

  const m = input.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;

  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Real-world top-5 competitions: when /addleague's name matches one of these
// (or an alias like "PL"), the league is created with its official badge.
// ---------------------------------------------------------------------------
const REAL_TOP5_LEAGUES = [
  { name: 'Premier League', emoji: '⚽', aliases: ['premier league', 'pl', 'epl'] },
  { name: 'LaLiga', emoji: '🇪🇸', aliases: ['la liga', 'laliga'] },
  { name: 'Serie A', emoji: '🇮🇹', aliases: ['serie a', 'seriea'] },
  { name: 'Bundesliga', emoji: '🇩🇪', aliases: ['bundesliga'] },
  { name: 'Ligue 1', emoji: '🇫🇷', aliases: ['ligue 1', 'ligue1'] },
];

function matchRealLeague(input: string) {
  const q = input.trim().toLowerCase().replace(/\s+/g, ' ');
  return REAL_TOP5_LEAGUES.find(l => l.name.toLowerCase() === q || l.aliases.includes(q));
}

const apiError = (e: unknown) => {
  const err = e as { response?: { status?: number; data?: { error?: string } }; code?: string; message?: string };
  if (err.response?.data?.error) return err.response.data.error;
  if (err.response?.status) return `API responded with status ${err.response.status}`;
  if (err.code) return `${err.code}${err.message ? ` — ${err.message}` : ''}`;
  return err.message ?? 'Unknown error';
};

const ephemeral = (content: string): InteractionReplyOptions => ({ content, flags: MessageFlags.Ephemeral });

// ---------------------------------------------------------------------------
// /edit-standings row parser. One club per line:
//   Barcelona 4, 2, 1, 1, 10, 2, 8, 7, [W, W, D, L]
//   = Name Played, Won, Drawn, Lost, GoalsFor, GoalsAgainst, GoalDiff, Pts [, Form]
// The name may contain spaces; everything after it is comma-separated numbers.
// "Barcelona, 4, 2, …" (comma after the name) works too. Form is optional.
// ---------------------------------------------------------------------------

interface ParsedStandingsRow {
  team: string;
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

const foldName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function parseStandingsText(text: string): { rows: ParsedStandingsRow[]; errors: string[] } {
  const rows: ParsedStandingsRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) errors.push('No rows given.');

  lines.forEach((line, idx) => {
    const at = `Line ${idx + 1}`;
    let rest = line;

    // trailing [W, D, L] form — optional
    let form: string[] = [];
    const fm = rest.match(/\[([^\]]*)\]\s*$/);
    if (fm) {
      form = fm[1]
        .split(/[,\s]+/)
        .map(f => f.trim().toUpperCase())
        .filter(f => f === 'W' || f === 'D' || f === 'L');
      rest = rest.slice(0, fm.index).trim().replace(/,\s*$/, '');
    }

    const parts = rest.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`${at} — \`${line}\`: needs the name followed by numbers`);
      return;
    }

    // first segment holds the name and maybe the Played count ("Barcelona 4")
    let namePart = parts[0];
    let playedFromName: number | null = null;
    const nm = namePart.match(/^(.+?)\s+(\d{1,3})$/);
    if (nm) {
      namePart = nm[1].trim();
      playedFromName = Number(nm[2]);
    }
    if (!namePart || namePart.length > 40) {
      errors.push(`${at} — team name missing or longer than 40 characters`);
      return;
    }

    const nums = parts.slice(1).map(p => (/^-?\d{1,4}$/.test(p) ? Number(p) : NaN));
    if (nums.some(n => Number.isNaN(n))) {
      errors.push(`${at} — every value after the name must be a whole number`);
      return;
    }
    const seq = playedFromName !== null ? [playedFromName, ...nums] : nums;
    if (seq.length !== 8) {
      errors.push(
        `${at} — expected 8 numbers (Played, W, D, L, GF, GA, GD, Pts) but found ${seq.length}`
      );
      return;
    }
    const [played, won, drawn, lost, goalsFor, goalsAgainst, goalDiff, points] = seq;
    const nonNeg: [string, number][] = [
      ['Played', played],
      ['Wins', won],
      ['Draws', drawn],
      ['Losses', lost],
      ['Goals For', goalsFor],
      ['Goals Against', goalsAgainst],
      ['Points', points],
    ];
    for (const [label, v] of nonNeg) {
      if (v < 0 || v > 999) {
        errors.push(`${at} — ${label} must be between 0 and 999 (got ${v})`);
        return;
      }
    }
    if (goalDiff < -999 || goalDiff > 999) {
      errors.push(`${at} — Goal Difference must be between -999 and 999 (got ${goalDiff})`);
      return;
    }

    rows.push({
      team: namePart,
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      goalDiff,
      points,
      form,
    });
  });

  return { rows, errors };
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('clientReady', async () => {
  console.log(`[BOT] ✅ Logged in as ${client.user?.tag} — the Discord bot is running!`);

  const commands = [
    new SlashCommandBuilder()
      .setName('addleague')
      .setDescription('Create a league — type a top-5 name like PL for the real one, or anything custom')
      .addStringOption(o =>
        o
          .setName('name')
          .setDescription('League name — real competitions like "PL" or "LaLiga" get their official badge automatically')
          .setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName('emoji')
          .setDescription('League emoji (unicode or custom server emoji) — optional for the top-5 leagues')
          .setRequired(false)
      )
      .addStringOption(o =>
        o
          .setName('parent')
          .setDescription('Optional: put this league inside another league — start typing to search')
          .setRequired(false)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('removeleague')
      .setDescription('Remove a league — its matches stay but lose the league, and its teams are removed too')
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league to remove — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('edit-league')
      .setDescription('Change a league\'s name or emoji on the website')
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league to edit — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o
          .setName('name')
          .setDescription('New name for the league')
          .setRequired(false)
      )
      .addStringOption(o =>
        o
          .setName('emoji')
          .setDescription('New emoji for the league (unicode or custom server emoji)')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('addteam')
      .setDescription('Add a team with its badge to a league so it appears in the standings table')
      .addStringOption(o => o.setName('team').setDescription('Team name (e.g. Arsenal)').setRequired(true))
      .addStringOption(o =>
        o.setName('emoji').setDescription('Team emoji (unicode or pick a custom server emoji by typing :)').setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league the team joins — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('editteam')
      .setDescription('Edit a team made earlier — give it a badge, or rename it')
      .addStringOption(o =>
        o
          .setName('team')
          .setDescription('Which team to edit — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o.setName('emoji').setDescription('New team emoji (unicode or pick a custom server emoji by typing :)').setRequired(true)
      )
      .addStringOption(o => o.setName('name').setDescription('Rename the team (leave empty to keep the current name)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('copyteams')
      .setDescription('Put every club of one league into another too — they keep their home league')
      .addStringOption(o =>
        o
          .setName('from')
          .setDescription('Move teams out of this league')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o
          .setName('to')
          .setDescription('…into this league')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('removeteam')
      .setDescription('Remove a team from its league (it disappears from the standings)')
      .addStringOption(o =>
        o
          .setName('team')
          .setDescription('Team to remove — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('clone-club')
      .setDescription('Put an existing club into another league too — it keeps playing in its current one')
      .addStringOption(o =>
        o
          .setName('club')
          .setDescription('Which club to clone — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league to clone it into — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('add-club')
      .setDescription('Add a community club to the website home sidebar with its Discord server link')
      .addStringOption(o =>
        o.setName('emoji').setDescription("Club's badge (unicode or pick a custom server emoji by typing :)").setRequired(true)
      )
      .addStringOption(o => o.setName('name').setDescription('Club name (e.g. Thunder FC)').setRequired(true))
      .addStringOption(o =>
        o.setName('invite').setDescription("Club's Discord invite link (e.g. https://discord.gg/xyz)").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('remove-club')
      .setDescription('Remove a community club from the website home sidebar')
      .addStringOption(o =>
        o
          .setName('club')
          .setDescription('Which club to remove — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('fixture')
      .setDescription('Add a fixture between two existing clubs — shows up on the website')
      .addStringOption(o =>
        o
          .setName('home')
          .setDescription('Home club — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o
          .setName('away')
          .setDescription('Away club — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league the game displays in — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o
          .setName('time')
          .setDescription('Kick-off (e.g. "2026-08-30 18:00", or just "19:30" / "7 PM" for today)')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('friendlymatch')
      .setDescription('Add a friendly between any two names — filed under 🤝 Friendly Matches')
      .addStringOption(o => o.setName('home').setDescription('Home team name').setRequired(true))
      .addStringOption(o => o.setName('away').setDescription('Away team name').setRequired(true))
      .addStringOption(o =>
        o
          .setName('time')
          .setDescription('Kick-off (e.g. "2026-08-30 18:00", or just "19:30" / "7 PM" for today)')
          .setRequired(true)
      )
      .addStringOption(o => o.setName('homeemoji').setDescription("Home team's badge (any emoji)").setRequired(false))
      .addStringOption(o => o.setName('awayemoji').setDescription("Away team's badge (any emoji)").setRequired(false)),
    new SlashCommandBuilder()
      .setName('halftime')
      .setDescription('Set the half-time score of a match (shows HT on the website)')
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true))
      .addIntegerOption(o => o.setName('homescore').setDescription('Score at half time — home').setRequired(true))
      .addIntegerOption(o => o.setName('awayscore').setDescription('Score at half time — away').setRequired(true)),
    new SlashCommandBuilder()
      .setName('fulltime')
      .setDescription('Set the final score of a match (marks it as finished)')
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true))
      .addIntegerOption(o => o.setName('homescore').setDescription('Final home score').setRequired(true))
      .addIntegerOption(o => o.setName('awayscore').setDescription('Final away score').setRequired(true)),
    new SlashCommandBuilder()
      .setName('listmatches')
      .setDescription('List matches on the website (shows the IDs you need for other commands)'),
    new SlashCommandBuilder()
      .setName('setscore')
      .setDescription('Set the final score of a match (marks it as finished)')
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true))
      .addIntegerOption(o => o.setName('homescore').setDescription('Final home score').setRequired(true))
      .addIntegerOption(o => o.setName('awayscore').setDescription('Final away score').setRequired(true)),
    new SlashCommandBuilder()
      .setName('edittime')
      .setDescription("Change a match's kick-off time")
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true))
      .addStringOption(o =>
        o.setName('time').setDescription('New kick-off (e.g. "2026-08-31 20:45", or "21:00" for today)').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('postpone')
      .setDescription('Postpone a match — move it to a new kick-off time')
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true))
      .addStringOption(o =>
        o.setName('time').setDescription('New kick-off (e.g. "2026-08-31 20:45", or "21:00" for today)').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('removematch')
      .setDescription('Remove a match from the website')
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('generate-lineup')
      .setDescription('Post a starting lineup for a match — the bot turns it into a pitch image')
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true))
      .addStringOption(o =>
        o
          .setName('side')
          .setDescription('Which team the lineup is for')
          .setRequired(true)
          .addChoices({ name: 'home', value: 'home' }, { name: 'away', value: 'away' })
      ),
    new SlashCommandBuilder()
      .setName('remove-lineup')
      .setDescription('Remove a saved lineup from a match')
      .addIntegerOption(o => o.setName('id').setDescription('Match ID (see /listmatches)').setRequired(true))
      .addStringOption(o =>
        o
          .setName('side')
          .setDescription('Which team lineup to remove')
          .setRequired(true)
          .addChoices({ name: 'home', value: 'home' }, { name: 'away', value: 'away' })
      ),
    new SlashCommandBuilder()
      .setName('news')
      .setDescription('Post a news update for a league — send text and image links/attachments in the next message')
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league this news is about — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('standings')
      .setDescription('Show the standings table for a league')
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league table to show — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('ip-load')
      .setDescription('Load a full standings table for a league (JSON data from website or external source)')
      .addStringOption(o =>
        o
          .setName('data')
          .setDescription('JSON string of the standings table — same format as GET /standings rows')
          .setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription('Which league table to load — start typing to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('id-load')
      .setDescription('Load every built-in standings table in one go — creates missing leagues too')
      .addIntegerOption(o =>
        o
          .setName('id')
          .setDescription('1 = load all tables (Premier League, Serie A, Bundesliga, LaLiga, ChampionsLeague)')
          .setRequired(true)
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('edit-standings')
      .setDescription('Paste standings rows to update a league table on the website')
      .addStringOption(o =>
        o
          .setName('league')
          .setDescription("Which league's table to update — start typing to search")
          .setRequired(true)
          .setAutocomplete(true)
      ),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Error registering commands:', err);
  }
});

// Only this Discord user may use the bot — everyone else is turned away.
const OWNER_USER_ID = '1479214179146535096';

client.on('interactionCreate', async interaction => {
  if (interaction.user.id !== OWNER_USER_ID) {
    try {
      if (interaction.isAutocomplete()) {
        await interaction.respond([{ name: '⛔ Not authorized', value: '?' }]);
      } else if (interaction.isRepliable()) {
        await interaction.reply(ephemeral('⛔ Only my owner can use this bot.'));
      }
    } catch {
      /* never let a stranger's interaction crash the bot */
    }
    return;
  }

  // ------- autocomplete (/fixture /addteam /standings /removeteam /addleague)
  if (interaction.isAutocomplete()) {
    try {
      // the option the user is typing in — getFocused(true) gives { name, value }
      const focused = interaction.options.getFocused(true) as unknown as { name: string; value: string };
      const query = String(focused?.value ?? '').trim().toLowerCase();
      if (
        focused &&
        (focused.name === 'league' || focused.name === 'parent' || focused.name === 'from' || focused.name === 'to')
      ) {
        const { data } = await axios.get<ApiLeague[]>(`${apiUrl}/leagues`);
        const filtered = data
          .filter(l => !query || `${l.name} ${l.emoji}`.toLowerCase().includes(query))
          .slice(0, 25);
        // value is the league NAME so handlers can resolve it back via findLeague
        await interaction.respond(filtered.map(l => ({ name: `${l.emoji} ${l.name}`, value: l.name })));
      } else if (focused && focused.name === 'club' && interaction.commandName === 'remove-club') {
        // /remove-club — options come from the community club directory
        const { data } = await axios.get<ApiClub[]>(`${apiUrl}/clubs`);
        const filtered = data
          .filter(c => !query || `${c.name} ${c.emoji}`.toLowerCase().includes(query))
          .slice(0, 25);
        await interaction.respond(
          filtered.map(c => ({ name: `${c.emoji} ${c.name}`.slice(0, 100), value: String(c.id) }))
        );
      } else if (
        focused &&
        (focused.name === 'team' || focused.name === 'home' || focused.name === 'away' || focused.name === 'club')
      ) {
        const { data } = await axios.get<ApiTeam[]>(`${apiUrl}/teams`);
        const filtered = data
          .filter(t => !query || `${t.name} ${t.league?.name ?? ''}`.toLowerCase().includes(query))
          .slice(0, 25);
        // custom Discord emojis don't render in autocomplete menus (they show
        // as raw <:name:id> numbers) — label is the club plus its league chain
        // so same-named clubs in different leagues stay distinct
        await interaction.respond(
          filtered.map(t => {
            const parts = [t.name];
            if (t.league) {
              parts.push(t.league.name);
              if (t.league.parent) parts.push(t.league.parent.name);
            }
            return { name: parts.join(' - ').slice(0, 100), value: String(t.id) };
          })
        );
      } else if (focused && focused.name === 'id') {
        // /id-load — a single ID loads every built-in table
        await interaction.respond([{ name: '1 · Load all league tables', value: 1 }]);
      } else {
        await interaction.respond([]);
      }
    } catch (e) {
      // if the API was just slow, Discord may have already invalidated the
      // interaction token (3s autocomplete window) — this fallback respond()
      // can itself fail with "Unknown interaction"; never let that crash the bot
      try {
        await interaction.respond([{ name: '⚠️ Could not load — is the API running?', value: '?' }]);
      } catch {
        /* interaction already expired — nothing more we can do */
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { options, commandName } = interaction;

  /** Resolve a league name (from the autocomplete picker) to its API record. */
  const findLeague = async (name: string): Promise<ApiLeague | null> => {
    const { data } = await axios.get<ApiLeague[]>(`${apiUrl}/leagues`);
    const q = name.trim().toLowerCase();
    return (
      data.find(l => l.name.toLowerCase() === q) ??
      data.find(l => l.name.toLowerCase().startsWith(q)) ??
      data.find(l => l.name.toLowerCase().includes(q)) ??
      null
    );
  };

  // ---------------------------------------------------------------- addleague
  if (commandName === 'addleague') {
    const rawName = options.getString('name', true).trim();
    const emojiInput = options.getString('emoji')?.trim() || '';
    const parentInput = options.getString('parent');

    // a top-5 competition name (or alias like "PL") becomes the real league
    // with its official badge; anything else is a custom league.
    const realLeague = matchRealLeague(rawName);
    const name = realLeague ? realLeague.name : rawName;
    const emoji = realLeague && !emojiInput ? realLeague.emoji : emojiInput;

    if (!emoji) {
      await interaction.reply(
        ephemeral(`❌ **${name}** isn't a top-5 competition, so it needs an emoji. Add one and run it again.`)
      );
      return;
    }
    // custom server emojis arrive as <:name:id> (or <a:name:id> when animated)
    const isCustomEmoji = /^<a?:\w+:\d+>$/.test(emoji);
    if (!isCustomEmoji && [...emoji].length > 4) {
      await interaction.reply(
        ephemeral('❌ The emoji should be a single emoji — unicode like 🇪🇸, or pick a custom one by typing `:` in the emoji field.')
      );
      return;
    }

    let parent: ApiLeague | null = null;
    if (parentInput) {
      try {
        parent = await findLeague(parentInput);
      } catch (e) {
        await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
        return;
      }
      if (!parent) {
        await interaction.reply(ephemeral(`❌ No league called **${parentInput}** to nest it inside.`));
        return;
      }
    }

    try {
      const resp = await axios.post<ApiLeague>(`${apiUrl}/leagues`, {
        emoji,
        name,
        ...(parent ? { parentId: parent.id } : {}),
      });
      await interaction.reply(
        realLeague
          ? `${realLeague.emoji} **${resp.data.name}** added${parent ? ` inside ${parent.emoji} **${parent.name}**` : ' as a standalone league'}. Add its clubs with \`/addteam\`, fixtures with \`/fixture\`.`
          : `${emoji} League created — **${emoji} ${resp.data.name}**${parent ? `, inside ${parent.emoji} **${parent.name}**` : ''}. Fill it with \`/addteam\` and \`/fixture\`.`
      );
    } catch (e) {
      console.error('[BOT] Add league failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to create league: ${apiError(e)}`));
    }
    return;
  }

  // --------------------------------------------------------------- edit-league
  if (commandName === 'edit-league') {
    const leagueInput = options.getString('league', true);
    const newName = options.getString('name')?.trim() || '';
    const newEmoji = options.getString('emoji')?.trim() || '';

    if (!newName && !newEmoji) {
      await interaction.reply(ephemeral('❌ Provide at least a new `name` or `emoji` to update.'));
      return;
    }

    let league: ApiLeague | null = null;
    try {
      league = await findLeague(leagueInput);
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
      return;
    }
    if (!league) {
      await interaction.reply(ephemeral(`❌ No league called **${leagueInput}**. Create one with \`/addleague\`.`));
      return;
    }

    if (newEmoji) {
      const isCustomEmoji = /^<a?:\w+:\d+>$/.test(newEmoji);
      if (!isCustomEmoji && [...newEmoji].length > 4) {
        await interaction.reply(
          ephemeral('❌ The emoji should be a single emoji — unicode like 🇪🇸, or pick a custom one by typing `:` in the emoji field.')
        );
        return;
      }
    }

    try {
      const payload: Record<string, string> = {};
      if (newName) payload.name = newName;
      if (newEmoji) payload.emoji = newEmoji;
      await axios.put(`${apiUrl}/leagues/${league.id}`, payload);
      const changes: string[] = [];
      if (newName) changes.push(`name → **${newName}**`);
      if (newEmoji) changes.push(`emoji → ${newEmoji}`);
      await interaction.reply(`${league.emoji} **${league.name}** updated — ${changes.join(', ')}.`);
    } catch (e: any) {
      const msg = apiError(e);
      if (msg.includes('already exists')) {
        await interaction.reply(ephemeral(`❌ A league called **${newName}** already exists.`));
      } else {
        console.error('[BOT] Edit league failed:', msg);
        await interaction.reply(ephemeral(`❌ Failed to update league: ${msg}`));
      }
    }
    return;
  }

  // ------------------------------------------------------------------- addteam
  if (commandName === 'addteam') {
    const teamName = options.getString('team', true).trim();
    const leagueInput = options.getString('league', true);
    if (teamName.length > 40) {
      await interaction.reply(ephemeral('❌ Team name is too long (max 40 characters).'));
      return;
    }
    // badge: unicode emoji or a custom server emoji (<:name:id>)
    const emoji = options.getString('emoji', true).trim();
    const isCustomEmoji = /^<a?:\w+:\d+>$/.test(emoji);
    if (!isCustomEmoji && [...emoji].length > 4) {
      await interaction.reply(
        ephemeral('❌ The team emoji should be a single emoji — unicode like ⚽, or type `:` to pick a custom server emoji.')
      );
      return;
    }

    let league: ApiLeague | null = null;
    try {
      league = await findLeague(leagueInput);
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
      return;
    }
    if (!league) {
      await interaction.reply(ephemeral(`❌ No league called **${leagueInput}**. Create one with \`/addleague\`.`));
      return;
    }

    try {
      await axios.post(`${apiUrl}/teams`, { name: teamName, emoji, leagueId: league.id });
      const { data: allTeams } = await axios.get<ApiTeam[]>(`${apiUrl}/teams`);
      const count = allTeams.filter(t => t.leagueId === league!.id).length;
      await interaction.reply(
        `✅ ${emoji} **${teamName}** joined ${league.emoji} **${league.name}** — ${count} team${count === 1 ? '' : 's'} now. They're on the standings table; give them fixtures with \`/fixture\`.`
      );
    } catch (e) {
      console.error('[BOT] Add team failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to add team: ${apiError(e)}`));
    }
    return;
  }

  // ---------------------------------------------------------------- editteam
  if (commandName === 'editteam') {
    const raw = options.getString('team', true);
    const teamId = Number(raw);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      await interaction.reply(ephemeral('❌ Pick a team from the autocomplete list.'));
      return;
    }
    const emoji = options.getString('emoji', true).trim();
    const isCustomEmoji = /^<a?:\w+:\d+>$/.test(emoji);
    if (!isCustomEmoji && [...emoji].length > 4) {
      await interaction.reply(
        ephemeral('❌ The emoji should be a single emoji — unicode like ⚽, or type `:` to pick a custom server emoji.')
      );
      return;
    }
    const newName = options.getString('name')?.trim();

    try {
      const { data: allTeams } = await axios.get<ApiTeam[]>(`${apiUrl}/teams`);
      const team = allTeams.find(t => t.id === teamId);
      const resp = await axios.patch<ApiTeam>(`${apiUrl}/teams/${teamId}`, {
        emoji,
        ...(newName ? { name: newName } : {}),
      });
      await interaction.reply(
        `✅ ${emoji} **${resp.data.name}** updated${team && newName && team.name !== resp.data.name ? ` (was **${team.name}**)` : ''}${team?.league ? ` in ${team.league.emoji} ${team.league.name}` : ''}.`
      );
    } catch (e) {
      console.error('[BOT] Edit team failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to update team: ${apiError(e)}`));
    }
    return;
  }

  // --------------------------------------------------------------- copyteams
  if (commandName === 'copyteams') {
    const fromInput = options.getString('from', true);
    const toInput = options.getString('to', true);

    const { data: leagues } = await axios.get<ApiLeague[]>(`${apiUrl}/leagues`);
    const findLeague = (name: string) =>
      leagues.find(l => l.name.toLowerCase() === name.trim().toLowerCase());
    const from = findLeague(fromInput);
    const to = findLeague(toInput);
    if (!from) return void (await interaction.reply(ephemeral(`❌ No league called **${fromInput}**.`)));
    if (!to) return void (await interaction.reply(ephemeral(`❌ No league called **${toInput}**.`)));
    if (from.id === to.id) return void (await interaction.reply(ephemeral('❌ Pick two different leagues.')));

    try {
      const resp = await axios.post<{ moved: number }>(`${apiUrl}/teams/move`, {
        fromLeagueId: from.id,
        toLeagueId: to.id,
      });
      await interaction.reply(
        `✅ ${from.emoji} **${from.name}**'s clubs now also play in ${to.emoji} **${to.name}** — ${resp.data.moved} added, nobody left their original league.`
      );
    } catch (e) {
      console.error('[BOT] Copy teams failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to add teams: ${apiError(e)}`));
    }
    return;
  }

  // --------------------------------------------------------------- clone-club
  if (commandName === 'clone-club') {
    const raw = options.getString('club', true);
    const teamId = Number(raw);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      await interaction.reply(ephemeral('❌ Pick a club from the autocomplete list.'));
      return;
    }
    const leagueInput = options.getString('league', true);

    let league: ApiLeague | null = null;
    try {
      league = await findLeague(leagueInput);
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
      return;
    }
    if (!league) {
      await interaction.reply(ephemeral(`❌ No league called **${leagueInput}**. Create one with \`/addleague\`.`));
      return;
    }

    let allTeams: ApiTeam[];
    try {
      ({ data: allTeams } = await axios.get<ApiTeam[]>(`${apiUrl}/teams`));
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load clubs (is the API running?): ${apiError(e)}`));
      return;
    }
    const team = allTeams.find(t => t.id === teamId);
    if (!team) {
      await interaction.reply(ephemeral('❌ That club no longer exists — maybe it was removed.'));
      return;
    }

    try {
      await axios.post(`${apiUrl}/teams/link`, { teamId, leagueId: league.id });

      // pull the freshly updated table so the reply can show rank + form there
      let tableLine = '';
      try {
        const { data: tables } = await axios.get<StandingsTable[]>(`${apiUrl}/standings`);
        const row = tables
          .find(t => t.league.id === league!.id)
          ?.rows.find(r => r.team.toLowerCase() === team.name.toLowerCase());
        if (row) {
          const gd = row.goalDiff > 0 ? `+${row.goalDiff}` : String(row.goalDiff);
          const form = row.form.length > 0 ? row.form.join('-') : 'no matches yet';
          tableLine = `There: **#${row.position}** · P${row.played} · W${row.won} D${row.drawn} L${row.lost} · GD ${gd} · **${row.points} pts** · Form: ${form}`;
        }
      } catch {
        /* cosmetic only — the clone itself succeeded */
      }

      const home = team.league;
      await interaction.reply(
        [
          `✅ ${team.emoji ?? ''} **${team.name}** cloned into ${league.emoji} **${league.name}**.`,
          home
            ? `They now play in both ${home.emoji} **${home.name}**${home.parent ? ` (${home.parent.emoji} ${home.parent.name})` : ''} and ${league.emoji} **${league.name}** — nobody left their original league.`
            : '',
          tableLine,
        ]
          .filter(Boolean)
          .join('\n')
      );
    } catch (e) {
      console.error('[BOT] Clone club failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to clone club: ${apiError(e)}`));
    }
    return;
  }

  // ----------------------------------------------------------------- add-club
  if (commandName === 'add-club') {
    const emoji = options.getString('emoji', true).trim();
    const name = options.getString('name', true).trim();
    const invite = options.getString('invite', true).trim();

    const isCustomEmoji = /^<a?:\w+:\d+>$/.test(emoji);
    if (!isCustomEmoji && [...emoji].length > 4) {
      await interaction.reply(
        ephemeral('❌ The emoji should be a single emoji — unicode like ⚡, or type `:` to pick a custom server emoji.')
      );
      return;
    }
    if (name.length > 40) {
      await interaction.reply(ephemeral('❌ Club name is too long (max 40 characters).'));
      return;
    }
    if (!/^https:\/\/(www\.)?(discord\.gg\/\w+|discord\.com\/invite\/\w+)(\?\S*)?$/i.test(invite)) {
      await interaction.reply(
        ephemeral('❌ That doesn\'t look like a Discord invite link. Use the full URL, e.g. `https://discord.gg/xyz`.')
      );
      return;
    }

    try {
      await axios.post(`${apiUrl}/clubs`, { emoji, name, invite });
      await interaction.reply(
        `✅ ${emoji} **${name}** added to the Clubs tab on the website home page — their server link is attached.`
      );
    } catch (e) {
      console.error('[BOT] Add club failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to add club: ${apiError(e)}`));
    }
    return;
  }

  // -------------------------------------------------------------- remove-club
  if (commandName === 'remove-club') {
    const raw = options.getString('club', true);
    const clubId = Number(raw);
    if (!Number.isInteger(clubId) || clubId <= 0) {
      await interaction.reply(ephemeral('❌ Pick a club from the autocomplete list.'));
      return;
    }

    try {
      let name = `#${clubId}`;
      try {
        const { data: clubs } = await axios.get<ApiClub[]>(`${apiUrl}/clubs`);
        name = clubs.find(c => c.id === clubId)?.name ?? name;
      } catch {
        /* removal still proceeds */
      }
      await axios.delete(`${apiUrl}/clubs/${clubId}`);
      await interaction.reply(`🗑️ Removed **${name}** from the website.`);
    } catch (e) {
      console.error('[BOT] Remove club failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to remove club: ${apiError(e)}`));
    }
    return;
  }

  // --------------------------------------------------------------- removeteam
  if (commandName === 'removeteam') {
    const raw = options.getString('team', true);
    const teamId = Number(raw);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      await interaction.reply(ephemeral('❌ Pick a team from the autocomplete list.'));
      return;
    }
    try {
      const { data: allTeams } = await axios.get<ApiTeam[]>(`${apiUrl}/teams`);
      const team = allTeams.find(t => t.id === teamId);
      await axios.delete(`${apiUrl}/teams/${teamId}`);
      await interaction.reply(
        `✅ Removed **${team?.name ?? `#${teamId}`}**${team?.league ? ` from ${team.league.emoji} ${team.league.name}` : ''}.`
      );
    } catch (e) {
      console.error('[BOT] Remove team failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to remove team: ${apiError(e)}`));
    }
    return;
  }

  // ------------------------------------------------------------- removeleague
  if (commandName === 'removeleague') {
    const leagueInput = options.getString('league', true);
    let league: ApiLeague | null = null;
    try {
      league = await findLeague(leagueInput);
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
      return;
    }
    if (!league) {
      await interaction.reply(ephemeral(`❌ No league called **${leagueInput}**.`));
      return;
    }

    try {
      // counts first so the confirmation can say what happens
      const [{ data: allMatches }, { data: allTeams }] = await Promise.all([
        axios.get<ApiMatch[]>(`${apiUrl}/matches`),
        axios.get<ApiTeam[]>(`${apiUrl}/teams`),
      ]);
      const matchCount = allMatches.filter(m => m.league?.id === league!.id).length;
      const teamCount = allTeams.filter(t => t.leagueId === league!.id).length;

      await axios.delete(`${apiUrl}/leagues/${league.id}`);
      await interaction.reply(
        [
          `🗑️ Removed ${league.emoji} **${league.name}**.`,
          matchCount > 0 ? `Its ${matchCount} match${matchCount === 1 ? '' : 'es'} kept but ${matchCount === 1 ? 'is' : 'are'} now league-less.` : '',
          teamCount > 0 ? `${teamCount} team${teamCount === 1 ? ' was' : 's were'} removed with it.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
    } catch (e) {
      console.error('[BOT] Remove league failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to remove league: ${apiError(e)}`));
    }
    return;
  }

  // ------------------------------------------------------------------- fixture
  if (commandName === 'fixture') {
    const homeId = Number(options.getString('home', true));
    const awayId = Number(options.getString('away', true));
    const time = options.getString('time', true);
    const leagueInput = options.getString('league', true);

    const startDate = parseStartTime(time);
    if (!startDate) {
      await interaction.reply(
        ephemeral('❌ Invalid time. Use a date like `2026-08-30 18:00`, or just a time like `19:30` / `7 PM` for today.')
      );
      return;
    }

    let teams: ApiTeam[];
    try {
      const res = await axios.get<ApiTeam[]>(`${apiUrl}/teams`);
      teams = res.data;
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load clubs (is the API running?): ${apiError(e)}`));
      return;
    }
    const home = teams.find(t => t.id === homeId);
    const away = teams.find(t => t.id === awayId);
    if (!home || !away) {
      await interaction.reply(ephemeral('❌ One of those clubs no longer exists — pick again from the suggestions.'));
      return;
    }
    if (home.id === away.id) {
      await interaction.reply(ephemeral("❌ A club can't play itself."));
      return;
    }

    let league: ApiLeague | null = null;
    try {
      league = await findLeague(leagueInput);
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
      return;
    }
    if (!league) {
      await interaction.reply(ephemeral(`❌ No league called **${leagueInput}**. Create one with \`/addleague\`.`));
      return;
    }

    try {
      const resp = await axios.post<ApiMatch>(`${apiUrl}/matches`, {
        homeTeam: home.name,
        awayTeam: away.name,
        startTime: startDate.toISOString(),
        leagueId: league.id,
      });
      await interaction.reply(
        `✅ Fixture added (ID: **${resp.data.id}**) — ${league.emoji} **${home.name} vs ${away.name}**, kick-off <t:${Math.floor(startDate.getTime() / 1000)}:F>. It's live on the website.`
      );
    } catch (e) {
      console.error('[BOT] Add fixture failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to add fixture: ${apiError(e)}`));
    }
    return;
  }

  // ------------------------------------------------------------ friendlymatch
  if (commandName === 'friendlymatch') {
    const home = options.getString('home', true).trim();
    const away = options.getString('away', true).trim();
    const homeEmoji = options.getString('homeemoji')?.trim() || '';
    const awayEmoji = options.getString('awayemoji')?.trim() || '';
    const time = options.getString('time', true);

    const startDate = parseStartTime(time);
    if (!startDate) {
      await interaction.reply(
        ephemeral('❌ Invalid time. Use a date like `2026-08-30 18:00`, or just a time like `19:30` / `7 PM` for today.')
      );
      return;
    }
    if (home.toLowerCase() === away.toLowerCase()) {
      await interaction.reply(ephemeral("❌ A team can't play itself."));
      return;
    }

    // the shared Friendly Matches league — created on first use
    let league: ApiLeague | null = null;
    try {
      const { data: leagues } = await axios.get<ApiLeague[]>(`${apiUrl}/leagues`);
      league = leagues.find(l => l.name === FRIENDLY_LEAGUE_NAME) ?? null;
      if (!league) {
        const { data } = await axios.post<ApiLeague>(`${apiUrl}/leagues`, {
          name: FRIENDLY_LEAGUE_NAME,
          emoji: '🤝',
        });
        league = data;
      }
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't set up Friendly Matches (is the API running?): ${apiError(e)}`));
      return;
    }

    // register both names as clubs of that league so their badges show on the
    // site — existing entries keep/update their emoji
    const upsertTeam = async (name: string, emoji: string): Promise<void> => {
      const { data: teams } = await axios.get<ApiTeam[]>(`${apiUrl}/teams`);
      const existing = teams.find(t => t.leagueId === league!.id && t.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        if (emoji && emoji !== existing.emoji) {
          await axios.patch(`${apiUrl}/teams/${existing.id}`, { emoji });
        }
        return;
      }
      await axios.post(`${apiUrl}/teams`, { name, emoji, leagueId: league!.id });
    };

    try {
      await upsertTeam(home, homeEmoji);
      await upsertTeam(away, awayEmoji);
      const resp = await axios.post<ApiMatch>(`${apiUrl}/matches`, {
        homeTeam: home,
        awayTeam: away,
        startTime: startDate.toISOString(),
        leagueId: league.id,
      });
      await interaction.reply(
        `🤝 Friendly added (ID: **${resp.data.id}**) — **${home} vs ${away}**, kick-off <t:${Math.floor(startDate.getTime() / 1000)}:F>. Track it with \`/halftime\` and \`/fulltime\`.`
      );
    } catch (e) {
      console.error('[BOT] Add friendly failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to add friendly: ${apiError(e)}${String(apiError(e)).includes('emoji') ? '\nTip: emojis must be a single emoji character.' : ''}`));
    }
    return;
  }

  // ----------------------------------------------------------------- halftime
  if (commandName === 'halftime') {
    const id = options.getInteger('id', true);
    const homescore = options.getInteger('homescore', true);
    const awayscore = options.getInteger('awayscore', true);
    try {
      const { data } = await axios.patch<ApiMatch>(`${apiUrl}/matches/${id}`, {
        homeHtScore: homescore,
        awayHtScore: awayscore,
        status: 'ht',
      });
      await interaction.reply(
        `⏸️ Half time — **${data.homeTeam} ${homescore}–${awayscore} ${data.awayTeam}** (match #${id}). Finish it with \`/fulltime\`.`
      );
    } catch (e) {
      console.error('[BOT] Halftime failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to set half time: ${apiError(e)}`));
    }
    return;
  }

  // ----------------------------------------------------------------- fulltime
  if (commandName === 'fulltime') {
    const id = options.getInteger('id', true);
    const homescore = options.getInteger('homescore', true);
    const awayscore = options.getInteger('awayscore', true);
    try {
      const { data } = await axios.patch<ApiMatch>(`${apiUrl}/matches/${id}`, {
        homeScore: homescore,
        awayScore: awayscore,
        status: 'finished',
      });
      await interaction.reply(
        `✅ Full time — **${data.homeTeam} ${homescore}–${awayscore} ${data.awayTeam}** (match #${id}).`
      );
    } catch (e) {
      console.error('[BOT] Fulltime failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to set full time: ${apiError(e)}`));
    }
    return;
  }

  // --------------------------------------------------------------- listmatches
  if (commandName === 'listmatches') {
    try {
      const { data } = await axios.get<ApiMatch[]>(`${apiUrl}/matches`);
      if (data.length === 0) {
        await interaction.reply('📋 No matches yet — add the first one with `/fixture` or `/friendlymatch`.');
        return;
      }
      const now = Date.now();
      const sorted = [...data].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      // live/upcoming first, then finished most-recent-first; cap the list
      const active = sorted.filter(
        m => m.status === 'scheduled' || new Date(m.startTime).getTime() + 3 * 3600_000 > now
      );
      const done = sorted.filter(m => !active.includes(m)).reverse();
      const ordered = [...active, ...done].slice(0, 25);

      const lines = ordered.map(m => {
        const ts = Math.floor(new Date(m.startTime).getTime() / 1000);
        const state =
          m.status === 'finished'
            ? `FT ${m.homeScore}–${m.awayScore}`
            : m.status === 'ht'
              ? `HT ${m.homeHtScore ?? 0}–${m.awayHtScore ?? 0}`
              : `<t:${ts}:t>`;
        const leagueTag = m.league ? `${m.league.emoji} ` : '';
        return `**#${m.id}** · ${leagueTag}${m.homeTeam} vs ${m.awayTeam}\n　 <t:${ts}:D> · ${state}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('📋 Matches')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Use these IDs with /halftime, /fulltime, /edittime, /postpone and /removematch' });
      await interaction.reply({ embeds: [embed] });
    } catch (e) {
      console.error('[BOT] List matches failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to list matches (is the API running?): ${apiError(e)}`));
    }
    return;
  }

  // ------------------------------------------------------------------ setscore
  if (commandName === 'setscore') {
    const id = options.getInteger('id', true);
    const homeScore = options.getInteger('homescore', true);
    const awayScore = options.getInteger('awayscore', true);
    try {
      const { data } = await axios.patch<ApiMatch>(`${apiUrl}/matches/${id}`, {
        homeScore,
        awayScore,
        status: 'finished',
      });
      await interaction.reply(
        `✅ Full time — **${data.homeTeam} ${homeScore}–${awayScore} ${data.awayTeam}** (match #${id}).`
      );
    } catch (e) {
      console.error('[BOT] Set score failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to set score: ${apiError(e)}`));
    }
    return;
  }

  // ------------------------------------------------------------------ edittime
  if (commandName === 'edittime') {
    const id = options.getInteger('id', true);
    const time = options.getString('time', true);
    const startDate = parseStartTime(time);
    if (!startDate) {
      await interaction.reply(
        ephemeral('❌ Invalid time. Use a date like `2026-08-30 18:00`, or just a time like `19:30` / `7 PM` for today.')
      );
      return;
    }
    try {
      const { data } = await axios.patch<ApiMatch>(`${apiUrl}/matches/${id}`, {
        startTime: startDate.toISOString(),
        status: 'scheduled',
      });
      await interaction.reply(
        `✅ Match #${id} moved — **${data.homeTeam} vs ${data.awayTeam}** now kicks off <t:${Math.floor(startDate.getTime() / 1000)}:F>.`
      );
    } catch (e) {
      console.error('[BOT] Edit time failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to edit time: ${apiError(e)}`));
    }
    return;
  }

  // ------------------------------------------------------------------ postpone
  if (commandName === 'postpone') {
    const id = options.getInteger('id', true);
    const time = options.getString('time', true);
    const startDate = parseStartTime(time);
    if (!startDate) {
      await interaction.reply(
        ephemeral('❌ Invalid time. Use a date like `2026-08-30 18:00`, or just a time like `19:30` / `7 PM` for today.')
      );
      return;
    }
    try {
      const { data } = await axios.patch<ApiMatch>(`${apiUrl}/matches/${id}`, {
        startTime: startDate.toISOString(),
        status: 'scheduled',
      });
      await interaction.reply(
        `📅 Postponed — **${data.homeTeam} vs ${data.awayTeam}** (match #${id}) now kicks off <t:${Math.floor(startDate.getTime() / 1000)}:F>.`
      );
    } catch (e) {
      console.error('[BOT] Postpone failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to postpone match: ${apiError(e)}`));
    }
    return;
  }

  // --------------------------------------------------------------- removematch
  if (commandName === 'removematch') {
    const id = options.getInteger('id', true);
    try {
      await axios.delete(`${apiUrl}/matches/${id}`);
      await interaction.reply(`✅ Match ${id} removed from the website.`);
    } catch (e) {
      console.error('[BOT] Remove match failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to remove match: ${apiError(e)}`));
    }
    return;
  }

  // ----------------------------------------------------------------- standings
  if (commandName === 'standings') {
    const leagueInput = options.getString('league', true);
    try {
      const { data: tables } = await axios.get<StandingsTable[]>(`${apiUrl}/standings`);
      const q = leagueInput.trim().toLowerCase();
      const table =
        tables.find(t => t.league.name.toLowerCase() === q) ??
        tables.find(t => t.league.name.toLowerCase().startsWith(q)) ??
        tables.find(t => t.league.name.toLowerCase().includes(q));
      if (!table) {
        await interaction.reply(
          ephemeral(`❌ No standings for **${leagueInput}** yet. Add teams with \`/addteam\` and play some matches.`)
        );
        return;
      }

      const header = '#  Team                  P   W   D   L   GD  Pts';
      const lines = table.rows.slice(0, 24).map(r =>
        [
          String(r.position).padStart(2),
          r.team.length > 20 ? `${r.team.slice(0, 19)}…` : r.team.padEnd(20),
          String(r.played).padStart(3),
          String(r.won).padStart(3),
          String(r.drawn).padStart(3),
          String(r.lost).padStart(3),
          String(r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff).padStart(4),
          String(r.points).padStart(3),
        ].join('  ')
      );
      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle(`${table.league.emoji} ${table.league.name} — Table`)
        .setDescription(['```', header, lines.join('\n'), '```'].join('\n'))
        .setFooter({ text: 'Standings update automatically as /setscore results come in — or edit manually via /edit-standings' });
      await interaction.reply({ embeds: [embed] });
    } catch (e) {
      console.error('[BOT] Standings failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to load standings (is the API running?): ${apiError(e)}`));
    }
    return;
  }

  // ----------------------------------------------------------- edit-standings
  if (commandName === 'edit-standings') {
    const leagueInput = options.getString('league', true);

    let league: ApiLeague | null = null;
    try {
      league = await findLeague(leagueInput);
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
      return;
    }
    if (!league) {
      await interaction.reply(ephemeral(`❌ No league called **${leagueInput}**. Create one with \`/addleague\`.`));
      return;
    }

    await interaction.reply(
      ephemeral(
        [
          `📝 **${league.emoji} ${league.name}** — send me the standings now.`,
          '',
          '**One line per club, in this order:**',
          '`Name Played, W, D, L, GF, GA, GD, Pts, [W, D, L]`',
          '',
          '**Examples:**',
          '`Barcelona 4, 2, 1, 1, 10, 2, 8, 7, [W, W, D, L]`',
          '`Real Madrid 4, 3, 0, 1, 12, 4, 8, 9, [W, W, W, L]`',
          '',
          '**To clear a team\'s stats (resets all to 0, removes form):**',
          '`Barcelona clear`',
          '',
          'You can mix both in one message. You have 2 minutes.',
        ].join('\n')
      )
    );

    if (!interaction.channel) return;
    const channel = interaction.channel as any;
    if (!channel.createMessageCollector) return;

    const collector = channel.createMessageCollector({
      filter: (m: any) => m.author.id === interaction.user.id,
      max: 1,
      time: 120_000,
    });

    collector.on('collect', async (msg: any) => {
      const raw = msg.content;
      const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

      // detect "{name} clear" lines
      const clearedNames: string[] = [];
      const statLines: string[] = [];
      for (const line of lines) {
        const m = line.match(/^(.+?)\s+clear$/i);
        if (m) {
          clearedNames.push(m[1].trim());
        } else {
          statLines.push(line);
        }
      }

      // parse remaining lines as normal stat rows
      let rows: ParsedStandingsRow[] = [];
      let errors: string[] = [];
      if (statLines.length > 0) {
        const result = parseStandingsText(statLines.join('\n'));
        rows = result.rows;
        errors = result.errors;
      }

      if (errors.length > 0 || (rows.length === 0 && clearedNames.length === 0)) {
        await msg.reply(
          [
            `❌ Couldn't read the table for ${league!.emoji} **${league!.name}**:`,
            ...errors.slice(0, 6),
            errors.length > 6 ? `…and ${errors.length - 6} more` : '',
            '',
            '**Format per line:**',
            '`Name Played, W, D, L, GF, GA, GD, Pts, [W, D, L]`',
            '`Barcelona 4, 2, 1, 1, 10, 2, 8, 7, [W, W, D, L]`',
            '',
            '**To clear a team\'s stats:**',
            '`Barcelona clear`',
            'Nothing was saved — fix the errors and run `/edit-standings` again.',
          ]
            .filter(Boolean)
            .join('\n')
        );
        return;
      }

      try {
        // merge onto the current table so you can update 1 team or all of them
        const { data: tables } = await axios.get<StandingsTable[]>(`${apiUrl}/standings`);
        const existing = tables.find(t => t.league.id === league!.id);
        const byKey = new Map<string, StandingRow>();
        if (existing) {
          for (const r of existing.rows) byKey.set(foldName(r.team), { ...r });
        }
        let added = 0;
        for (const row of rows) {
          const key = foldName(row.team);
          if (!byKey.has(key)) added++;
          const blank: StandingRow = {
            position: 0,
            team: row.team,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDiff: 0,
            points: 0,
            form: [],
          };
          const prev = byKey.get(key) ?? blank;
          byKey.set(key, { ...prev, ...row });
        }

        // clear teams: reset all stats to 0, remove form
        const cleared: string[] = [];
        for (const name of clearedNames) {
          const key = foldName(name);
          const existing = byKey.get(key);
          if (existing) {
            byKey.set(key, { ...existing, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, form: [] });
            cleared.push(existing.team);
          }
        }

        // rank: points → goal diff → goals for → name
        const merged = [...byKey.values()]
          .map(r => ({
            position: r.position,
            team: r.team,
            played: r.played,
            won: r.won,
            drawn: r.drawn,
            lost: r.lost,
            goalsFor: r.goalsFor,
            goalsAgainst: r.goalsAgainst,
            goalDiff: r.goalDiff,
            points: r.points,
            form: r.form.slice(0, 5),
          }))
          .sort(
            (a, b) =>
              b.points - a.points ||
              b.goalDiff - a.goalDiff ||
              b.goalsFor - a.goalsFor ||
              a.team.localeCompare(b.team)
          )
          .map((r, i) => ({ ...r, position: i + 1 }));

        await axios.post(`${apiUrl}/standings/load`, { leagueId: league!.id, data: JSON.stringify(merged) });

        const leader = merged[0];
        const parts: string[] = [];
        if (rows.length > 0) parts.push(`${rows.length} team${rows.length === 1 ? '' : 's'} set (${added} new)`);
        if (cleared.length > 0) parts.push(`${cleared.length} cleared (${cleared.join(', ')})`);
        await msg.reply(
          [
            `✅ ${league!.emoji} **${league!.name}** updated — ${parts.join('; ')}. Table has ${merged.length} rows.`,
            `Top of the table: **#${leader.position} ${leader.team}** · ${leader.points} pts`,
            'Positions re-sorted by points → GD → GF.',
          ].join('\n')
        );
      } catch (e) {
        console.error('[BOT] Edit standings failed:', apiError(e));
        await msg.reply(`❌ Failed to update standings: ${apiError(e)}`);
      }
    });

    collector.on('end', (_collected: any, reason: string) => {
      if (reason !== 'time' || _collected.size > 0) return;
      interaction.followUp(ephemeral('⏰ Timed out — run `/edit-standings` again when you\'re ready.'));
    });

    return;
  }

  // ----------------------------------------------------------- ip-load
  if (commandName === 'ip-load') {
    const data = options.getString('data', true);
    const leagueInput = options.getString('league', true);

    let league: ApiLeague | null = null;
    try {
      league = await findLeague(leagueInput);
    } catch (e) {
      await interaction.reply(ephemeral(`❌ Couldn't load leagues (is the API running?): ${apiError(e)}`));
      return;
    }
    if (!league) {
      await interaction.reply(ephemeral(`❌ No league called **${leagueInput}**.`));
      return;
    }

    try {
      const { data: result } = await axios.post<{ loaded: any }>(`${apiUrl}/standings/load`, {
        leagueId: league.id,
        data,
      });
      await interaction.reply(
        `✅ Standings loaded for ${league.emoji} **${league.name}**. ${result.loaded?.message || ''}`
      );
    } catch (e) {
      console.error('[BOT] IP load failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to load standings: ${apiError(e)}`));
    }
    return;
  }

  // ----------------------------------------------------------------- id-load
  if (commandName === 'id-load') {
    const id = options.getInteger('id', true);
    if (id !== 1) {
      await interaction.reply(ephemeral('❌ The only valid ID is **1** — it loads every league table at once.'));
      return;
    }

    const lines: string[] = [];
    let failed = false;
    for (const preset of STANDINGS_PRESETS) {
      try {
        // resolve each preset's league — create it on the fly if missing
        let league = await findLeague(preset.leagueName);
        if (!league) {
          const { data } = await axios.post<ApiLeague>(`${apiUrl}/leagues`, {
            name: preset.leagueName,
            emoji: preset.leagueEmoji,
          });
          league = data;
          lines.push(`🆕 ${league.emoji} **${league.name}** created`);
        }
        await axios.post(`${apiUrl}/standings/load`, {
          leagueId: league.id,
          data: JSON.stringify(preset.rows),
        });
        lines.push(`✅ ${league.emoji} **${league.name}** — ${preset.rows.length} clubs`);
      } catch (e) {
        failed = true;
        console.error(`[BOT] ID load failed for ${preset.leagueName}:`, apiError(e));
        lines.push(`❌ ${preset.leagueName}: ${apiError(e)}`);
      }
    }

    await interaction.reply(
      `${failed ? '⚠️ Finished with errors' : '✅ All standings loaded'}:\n${lines.join('\n')}` +
        `\nThe website tables now show these standings.`
    );
    return;
  }

  // ---------------------------------------------------------- generate-lineup
  if (commandName === 'generate-lineup') {
    const id = options.getInteger('id', true);
    const side = options.getString('side', true) as 'home' | 'away';

    if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
      await interaction.reply(ephemeral('❌ /generate-lineup can only be used in a server text channel.'));
      return;
    }
    const channel = interaction.channel;

    let match: ApiMatch;
    try {
      const resp = await axios.get<ApiMatch>(`${apiUrl}/matches/${id}`);
      match = resp.data;
    } catch (e) {
      await interaction.reply(ephemeral(`❌ ${apiError(e)}`));
      return;
    }

    const teamName = side === 'home' ? match.homeTeam : match.awayTeam;
    await interaction.reply(
      [
        `📋 **${side.toUpperCase()} lineup for match #${id} — ${teamName}**`,
        '',
        'Send the lineup in this channel as one player per line:',
        '`POSITION - @player`',
        '',
        'Example:',
        '```',
        'GK - @keeper',
        'CB - @defender1',
        'LB - @defender2',
        'RB - @defender3',
        'CM - @midfielder',
        'LW - @winger1',
        'ST - @striker',
        '```',
        'Mentions become Discord usernames (plain names work too). Max 7 players.',
        'Any position code works — GK, CB, LCB, LCM, RCM, RWB, RST, ST, …',
        'You have **2 minutes**. Type `cancel` to abort.',
      ].join('\n')
    );

    let msg: Message;
    try {
      const collected = await channel.awaitMessages({
        filter: (m: Message) => m.author.id === interaction.user.id && !m.author.bot,
        max: 1,
        time: 120_000,
        errors: ['time'],
      });
      msg = collected.first() as Message;
    } catch {
      await interaction.followUp(ephemeral('⌛ Lineup timed out — nothing was saved.'));
      return;
    }

    const mentionNames = new Map<string, string>();
    for (const [id_, user] of msg.mentions.users) {
      const member = msg.mentions.members?.get(id_);
      mentionNames.set(`<@${id_}>`, member?.displayName ?? user.username);
    }
    const { players, error } = parseLineupText(msg.content, token => mentionNames.get(token) ?? '');
    if (error === 'cancelled') {
      await msg.reply('❌ Lineup cancelled — nothing was saved.');
      return;
    }
    if (error) {
      await msg.reply(`❌ ${error}`);
      return;
    }

    // save to the website API
    try {
      await axios.post(`${apiUrl}/matches/${id}/lineup`, { side, players });
    } catch (e) {
      await msg.reply(`⚠️ Couldn't save to the website: ${apiError(e)}`);
      return;
    }

    // render + reply directly to their message
    try {
      // real club badge for the image — from the team's registered emoji
      let badgeUrl: string | null = null;
      try {
        const { data: allTeams } = await axios.get<ApiTeam[]>(`${apiUrl}/teams`);
        const teamRec = allTeams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
        const em = teamRec?.emoji?.match(/^<(a?):(\w+):(\d+)>$/);
        if (em) badgeUrl = `https://cdn.discordapp.com/emojis/${em[3]}.${em[1] ? 'gif' : 'png'}`;
      } catch {
        /* initials fallback */
      }
      const png = await buildLineupImage(side, teamName, `MATCH #${id}`, players, badgeUrl);
      const formation = detectFormation(players);
      const content = [
        `✅ **${teamName}** lineup saved`,
        `${players.length} players added successfully.`,
        '',
        formation ? `**Formation:** ${formation}` : `**${players.length} Players Selected**`,
        ...players.map(p => `${p.pos} • ${p.name}`),
        '',
        '🌐 Live on the website.',
      ].join('\n');
      await msg.reply({
        content,
        files: [{ attachment: png, name: `lineup-${id}-${side}.png` }],
      });
    } catch (e) {
      console.error('[BOT] Lineup image failed:', apiError(e));
      await msg.reply(`✅ Lineup saved, but the image failed: ${apiError(e)}`);
    }
    return;
  }

  // ------------------------------------------------------------ remove-lineup
  if (commandName === 'remove-lineup') {
    const id = options.getInteger('id', true);
    const side = options.getString('side', true) as 'home' | 'away';

    let match: ApiMatch;
    try {
      const resp = await axios.get<ApiMatch>(`${apiUrl}/matches/${id}`);
      match = resp.data;
    } catch (e) {
      await interaction.reply(ephemeral(`❌ ${apiError(e)}`));
      return;
    }
    const teamName = side === 'home' ? match.homeTeam : match.awayTeam;

    try {
      await axios.post(`${apiUrl}/matches/${id}/lineup`, { side, players: [] });
      await interaction.reply(
        `🗑️ **${teamName}** (${side}) lineup removed from match #${id}. The website updates instantly.`
      );
    } catch (e) {
      console.error('[BOT] Remove lineup failed:', apiError(e));
      await interaction.reply(ephemeral(`❌ Failed to remove lineup: ${apiError(e)}`));
    }
    return;
  }

  // ------------------------------------------------------------------- news
  if (commandName === 'news') {
    const leagueInput = options.getString('league', true);
    const league = await findLeague(leagueInput);
    if (!league) {
      await interaction.reply(ephemeral('❌ Pick a league from the autocomplete list.'));
      return;
    }

    if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
      await interaction.reply(ephemeral('❌ /news can only be used in a server text channel.'));
      return;
    }
    const channel = interaction.channel;

    await interaction.reply(
      [
        `📰 **News for ${league.emoji} ${league.name}**`,
        '',
        'Send the news update in this channel as your next message.',
        'Use normal Discord formatting — `**bold**`, `*italic*`, `# heading`, `- bullet point`, `> quote` all carry over to the website.',
        'Attach image files or paste image links (they show up as a gallery under the post).',
        'You have **3 minutes**. Type `cancel` to abort.',
      ].join('\n')
    );

    let msg: Message;
    try {
      const collected = await channel.awaitMessages({
        filter: (m: Message) => m.author.id === interaction.user.id && !m.author.bot,
        max: 1,
        time: 180_000,
        errors: ['time'],
      });
      msg = collected.first() as Message;
    } catch {
      await interaction.followUp(ephemeral('⌛ News timed out — nothing was posted.'));
      return;
    }

    if (/^cancel$/i.test(msg.content.trim())) {
      await msg.reply('❌ News cancelled — nothing was posted.');
      return;
    }

    // image URLs sitting on their own line become gallery images, not text
    const IMAGE_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i;
    const images: string[] = [];
    const textLines: string[] = [];
    for (const rawLine of msg.content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (IMAGE_URL_RE.test(line)) images.push(line);
      else textLines.push(rawLine);
    }
    for (const att of msg.attachments.values()) {
      if (att.contentType?.startsWith('image/') || IMAGE_URL_RE.test(att.url)) images.push(att.url);
    }
    const content = textLines.join('\n').trim();

    if (!content) {
      await msg.reply('❌ Add some text along with any images — nothing was posted.');
      return;
    }

    const author = (msg.member?.displayName ?? msg.author.username).slice(0, 60);

    try {
      await axios.post(`${apiUrl}/news`, { leagueId: league.id, content, images, author });
    } catch (e) {
      console.error('[BOT] News post failed:', apiError(e));
      await msg.reply(`⚠️ Couldn't post to the website: ${apiError(e)}`);
      return;
    }

    await msg.reply({
      content: [
        `✅ News posted for **${league.emoji} ${league.name}**`,
        '───────────────────────',
        content,
        images.length > 0 ? `\n🖼️ ${images.length} image${images.length === 1 ? '' : 's'} attached` : '',
        '',
        '🌐 Live on the website.',
      ]
        .filter(Boolean)
        .join('\n'),
    });
    return;
  }
});

client.login(token).catch(err => {
  console.error('[BOT] ❌ Failed to log in to Discord:', err.message);
  if (/disallowed intents/i.test(err.message)) {
    console.error(
      '   → Enable "MESSAGE CONTENT INTENT" in the Discord Developer Portal:\n' +
      '     https://discord.com/developers/applications → your app → Bot → Privileged Gateway Intents'
    );
  } else {
    console.error('   → Check that DISCORD_TOKEN is set: Orihost panel → Startup/Variables tab (or a bot/.env file).');
  }
  process.exit(1);
});
