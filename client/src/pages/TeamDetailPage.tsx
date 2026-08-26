import React, { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, History } from 'lucide-react';
import { api, currentScore, fold, viewOf } from '../services/api';
import { League, Match, StandingsTable, StandingRow, Team } from '../types';
import { useAsync } from '../hooks/useAsync';
import { usePolling, useLiveReload } from '../lib/live';
import { dateShortLabel, timeLabel } from '../lib/format';
import { TeamBadge } from '../components/ui/TeamBadge';
import { EmptyState, LeagueEmoji } from '../components/ui/primitives';
import { ListSkeleton } from '../components/ui/skeletons';

// ---------------------------------------------------------------------------
// A single club's page: big badge + name up top, then every competition it
// appears in with its rank and table numbers, plus upcoming fixtures and
// recent results. Opened from search (or by tapping a club name anywhere).
// ---------------------------------------------------------------------------

const FORM_STYLES: Record<string, string> = {
  W: 'bg-accent/15 text-accent',
  D: 'bg-surface3 text-muted',
  L: 'bg-live/15 text-live',
};

interface CompetitionRow {
  table: StandingsTable;
  row: StandingRow;
}

const StatTile: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="rounded-lg bg-surface2 px-2 py-1.5 text-center">
    <p className="text-2xs font-semibold uppercase tracking-wide text-faint">{label}</p>
    <p className={`tnum text-sm font-extrabold ${accent ? 'text-accent' : 'text-txt'}`}>{value}</p>
  </div>
);

const ClubMatchRow: React.FC<{ match: Match; teamName: string }> = ({ match, teamName }) => {
  const mine = fold(match.homeTeam) === fold(teamName);
  const opponent = mine ? match.awayTeam : match.homeTeam;
  const view = viewOf(match);
  const { home, away } = currentScore(match);
  const myGoals = mine ? home : away;
  const oppGoals = mine ? away : home;

  let statusLabel: string;
  let tint = 'text-muted';
  if (view.phase === 'finished') {
    const outcome = myGoals > oppGoals ? 'W' : myGoals < oppGoals ? 'L' : 'D';
    tint = outcome === 'W' ? 'text-accent' : outcome === 'L' ? 'text-loss' : 'text-muted';
    statusLabel = `${outcome} ${myGoals}–${oppGoals}`;
  } else if (view.phase === 'live') {
    tint = 'text-live font-bold';
    statusLabel = `LIVE ${myGoals}–${oppGoals}`;
  } else {
    statusLabel = `${dateShortLabel(match.startTime)} · ${timeLabel(match.startTime)}`;
  }

  return (
    <Link
      to={`/match/${match.id}`}
      className="press focus-ring flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface2"
    >
      <TeamBadge name={opponent} size={22} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-txt">
        {mine ? 'vs ' : 'at '}
        {opponent}
      </span>
      <span className={`tnum shrink-0 text-xs font-bold ${tint}`}>{statusLabel}</span>
    </Link>
  );
};

const TeamDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const teamId = Number(id);
  const navigate = useNavigate();

  const teams = useAsync<Team[]>(() => api.getTeams(), []);
  const leagues = useAsync<League[]>(() => api.getLeagues(), []);
  const tables = useAsync<StandingsTable[]>(() => api.getStandings(), []);
  const matches = useAsync<Match[]>(() => api.getMatches(), []);
  const reloadAll = React.useCallback(() => {
    teams.reload();
    leagues.reload();
    tables.reload();
    matches.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePolling(reloadAll, 30000);
  useLiveReload(reloadAll);

  const allLeagues = leagues.data ?? [];
  const team = (teams.data ?? []).find(t => t.id === teamId);
  const loading =
    (teams.loading && !teams.data) || (tables.loading && !tables.data) || (matches.loading && !matches.data);

  // every competition this exact club record appears in. Match by teamId first
  // so same-named clubs registered in other leagues don't bleed in; name-match
  // only rows that have no id (never registered via /addteam).
  const competitions = useMemo<CompetitionRow[]>(() => {
    if (!team) return [];
    const key = fold(team.name);
    return (tables.data ?? [])
      .map(t => ({
        table: t,
        row:
          t.rows.find(r => r.teamId != null && r.teamId === team.id) ??
          t.rows.find(r => r.teamId == null && fold(r.team) === key),
      }))
      .filter((c): c is CompetitionRow => Boolean(c.row));
  }, [team, tables.data]);

  // leagues where THIS name belongs to a different club record than ours —
  // their fixtures must not show up on our page
  const ownedElsewhere = useMemo(() => {
    const m = new Map<number, boolean>();
    if (!team) return m;
    const key = fold(team.name);
    for (const t of tables.data ?? []) {
      const ours = t.rows.some(r => r.teamId != null && r.teamId === team.id);
      const theirs = t.rows.some(r => r.teamId != null && r.teamId !== team.id && fold(r.team) === key);
      m.set(t.league.id, theirs && !ours);
    }
    return m;
  }, [team, tables.data]);

  // the league chain above the club — home league first, then ancestors
  const chain = useMemo<League[]>(() => {
    if (!team) return [];
    const out: League[] = [];
    const seen = new Set<number>();
    let cur = team.league ?? allLeagues.find(l => l.id === team.leagueId);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.push(cur);
      cur = allLeagues.find(l => l.id === cur.parentId);
    }
    return out;
  }, [team, allLeagues]);

  const clubMatches = useMemo(() => {
    if (!team) return [];
    const key = fold(team.name);
    return (matches.data ?? []).filter(m => {
      if (fold(m.homeTeam) !== key && fold(m.awayTeam) !== key) return false;
      // a same-named twin owns this fixture's league — not our game
      if (m.league && ownedElsewhere.get(m.league.id)) return false;
      return true;
    });
  }, [team, matches.data, ownedElsewhere]);
  const upcoming = useMemo(
    () =>
      clubMatches
        .filter(m => viewOf(m).phase !== 'finished')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 5),
    [clubMatches]
  );
  const recent = useMemo(
    () =>
      clubMatches
        .filter(m => viewOf(m).phase === 'finished')
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 5),
    [clubMatches]
  );

  if (!Number.isInteger(teamId) || teamId <= 0 || (!loading && !team)) {
    return (
      <div className="animate-fadeUp">
        <EmptyState icon={<CalendarDays size={28} />} title="Club not found" hint="It may have been removed.">
          <button type="button" onClick={() => navigate(-1)} className="press focus-ring chip bg-accent/15 font-bold text-accent">
            Go back
          </button>
        </EmptyState>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex flex-col gap-4 animate-fadeUp">
        <ListSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fadeUp">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="press focus-ring flex w-fit items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-txt"
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* club header — badge, name, league chain */}
      <header className="card flex items-center gap-4 p-5">
        <TeamBadge name={team.name} emoji={team.emoji} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight">{team.name}</h1>
          {chain.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
              {chain.map((l, i) => (
                <React.Fragment key={l.id}>
                  {i > 0 && <span className="text-faint">·</span>}
                  <Link
                    to={`/league/${l.id}`}
                    className={`press focus-ring flex items-center gap-1 rounded transition-colors hover:text-accent ${
                      i === 0 ? 'font-semibold text-txt' : 'text-muted'
                    }`}
                  >
                    <LeagueEmoji emoji={l.emoji} size={13} />
                    {l.name}
                  </Link>
                </React.Fragment>
              ))}
            </p>
          )}
        </div>
      </header>

      {/* one card per competition: rank + table numbers + form */}
      {competitions.map(({ table, row }) => (
        <section key={table.league.id} aria-label={`${table.league.name} record`} className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-surface2 px-3.5 py-2.5">
            <Link
              to={`/league/${table.league.id}`}
              aria-label={`Open ${table.league.name}`}
              className="group focus-ring flex min-w-0 flex-1 items-center gap-2 rounded"
            >
              <LeagueEmoji emoji={table.league.emoji} size={16} />
              <span className="truncate text-[13px] font-bold text-txt transition-colors group-hover:text-accent">
                {table.league.name}
              </span>
            </Link>
            <span className="tnum shrink-0 rounded-lg bg-accent/15 px-2 py-0.5 text-xs font-extrabold text-accent">
              #{row.position}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-5 md:grid-cols-9">
            <StatTile label="Rank" value={`#${row.position}`} accent />
            <StatTile label="Played" value={String(row.played)} />
            <StatTile label="Won" value={String(row.won)} />
            <StatTile label="Drawn" value={String(row.drawn)} />
            <StatTile label="Lost" value={String(row.lost)} />
            <StatTile label="GF" value={String(row.goalsFor)} />
            <StatTile label="GA" value={String(row.goalsAgainst)} />
            <StatTile label="GD" value={row.goalDiff > 0 ? `+${row.goalDiff}` : String(row.goalDiff)} />
            <StatTile label="Pts" value={String(row.points)} accent />
          </div>
          {row.form.length > 0 && (
            <div className="flex items-center gap-1.5 border-t border-line px-3.5 py-2">
              <span className="mr-1 text-2xs font-semibold uppercase tracking-wide text-faint">Form</span>
              {row.form.map((f, i) => (
                <span
                  key={i}
                  className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-extrabold ${FORM_STYLES[f] ?? ''}`}
                  title={f === 'W' ? 'Win' : f === 'D' ? 'Draw' : 'Loss'}
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* fixtures & results */}
      {upcoming.length > 0 && (
        <section className="card overflow-hidden" aria-label="Upcoming fixtures">
          <h2 className="flex items-center gap-1.5 border-b border-line bg-surface2 px-3.5 py-2.5 text-[13px] font-bold uppercase tracking-wider text-muted">
            <CalendarDays size={14} /> Upcoming
          </h2>
          <div className="divide-y divide-line">
            {upcoming.map(m => (
              <ClubMatchRow key={m.id} match={m} teamName={team.name} />
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="card overflow-hidden" aria-label="Recent results">
          <h2 className="flex items-center gap-1.5 border-b border-line bg-surface2 px-3.5 py-2.5 text-[13px] font-bold uppercase tracking-wider text-muted">
            <History size={14} /> Recent results
          </h2>
          <div className="divide-y divide-line">
            {recent.map(m => (
              <ClubMatchRow key={m.id} match={m} teamName={team.name} />
            ))}
          </div>
        </section>
      )}

      {!loading && clubMatches.length === 0 && competitions.length === 0 && (
        <EmptyState icon={<CalendarDays size={28} />} title="Nothing on record yet" hint="Fixtures will appear once matches are added." />
      )}
    </div>
  );
};

export default TeamDetailPage;
