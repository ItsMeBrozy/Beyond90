import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Flame, Shield, Target, TrendingUp } from 'lucide-react';
import { api, fold, leaguePath } from '../services/api';
import { FormResult, League, Match, StandingsTable, StandingRow, Team } from '../types';
import { useAsync } from '../hooks/useAsync';
import { usePolling, useLiveReload } from '../lib/live';
import { TeamBadge } from '../components/ui/TeamBadge';
import { EmptyState, LeagueEmoji } from '../components/ui/primitives';
import { ListSkeleton } from '../components/ui/skeletons';

// ---------------------------------------------------------------------------
// Statistics hub — everything is derived live from matches + standings tables.
// Overview tiles, the home/draw/away split, biggest wins and per-league
// superlatives (best attack / best defence / top form).
// ---------------------------------------------------------------------------

/** Leading W-run of a most-recent-first form array. */
function winStreak(form: FormResult[]): number {
  let n = 0;
  for (const f of form) {
    if (f === 'W') n++;
    else break;
  }
  return n;
}

interface LeagueSuperlatives {
  league: League;
  bestAttack: StandingRow;
  bestDefence: StandingRow;
  topForm: StandingRow;
}

/** A league in the statistics hierarchy, with the leagues nested inside it. */
interface LeagueNode {
  league: League;
  kids: LeagueNode[];
}

const StatisticsPage: React.FC = () => {
  const matches = useAsync<Match[]>(() => api.getMatches(), []);
  const tables = useAsync<StandingsTable[]>(() => api.getStandings(), []);
  const leagues = useAsync<League[]>(() => api.getLeagues(), []);
  const teams = useAsync<Team[]>(() => api.getTeams(), []);
  const reloadAll = useCallback(() => {
    matches.reload();
    tables.reload();
    leagues.reload();
    teams.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePolling(reloadAll, 30000);
  useLiveReload(reloadAll);

  const all = matches.data ?? [];
  const allLeagues = leagues.data ?? [];
  // folded club name → registered team id, so stat rows can link to the club page
  const teamIdByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of teams.data ?? []) m.set(fold(t.name), t.id);
    return m;
  }, [teams.data]);
  const teamTo = (name: string): string | undefined => {
    const tid = teamIdByName.get(fold(name));
    return tid != null ? `/team/${tid}` : undefined;
  };
  const finished = useMemo(() => all.filter(m => m.status === 'finished'), [all]);

  const goals = useMemo(() => {
    const total = finished.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
    const home = finished.filter(m => m.homeScore > m.awayScore).length;
    const away = finished.filter(m => m.awayScore > m.homeScore).length;
    const draws = finished.length - home - away;
    return { total, home, away, draws };
  }, [finished]);

  const bigWins = useMemo(
    () =>
      [...finished]
        .filter(m => m.homeScore !== m.awayScore)
        .sort((a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore))
        .slice(0, 5),
    [finished]
  );

  const leagueStats = useMemo<LeagueSuperlatives[]>(
    () =>
      (tables.data ?? [])
        .map(t => {
          const rows = t.rows.filter(r => r.played > 0);
          if (rows.length === 0) return null;
          const bestAttack = rows.reduce((a, b) => (b.goalsFor > a.goalsFor ? b : a));
          const bestDefence = rows.reduce((a, b) => (b.goalsAgainst < a.goalsAgainst ? b : a));
          const topForm = rows.reduce((a, b) => (winStreak(b.form) > winStreak(a.form) ? b : a));
          return { league: t.league, bestAttack, bestDefence, topForm };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [tables.data]
  );
  const statsById = useMemo(() => new Map(leagueStats.map(e => [e.league.id, e])), [leagueStats]);

  // league hierarchy — containers keep their nested leagues attached; leagues
  // whose parent no longer exists are treated as top-level
  const leagueTree = useMemo<LeagueNode[]>(() => {
    const known = new Set(allLeagues.map(l => l.id));
    const byParent = new Map<number, League[]>();
    for (const l of allLeagues) {
      const pid = l.parentId != null && known.has(l.parentId) ? l.parentId : -1;
      const list = byParent.get(pid) ?? [];
      list.push(l);
      byParent.set(pid, list);
    }
    const build = (pid: number): LeagueNode[] =>
      (byParent.get(pid) ?? []).map(l => ({ league: l, kids: build(l.id) }));
    return build(-1);
  }, [allLeagues]);

  // which container leagues currently hide their nested leagues
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggleCollapse = (id: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // one statistics card per league; plain leagues open the league page, and
  // leagues nested inside a container sit indented beneath its superlatives
  // (click anywhere on a container card to show/hide them)
  const renderNode = (node: LeagueNode): React.ReactNode => {
    const { league } = node;
    const entry = statsById.get(league.id);
    const kids = node.kids;
    const collapsible = kids.length > 0;
    const isCollapsed = collapsible && collapsed.has(league.id);
    const parentPath = leaguePath(league, allLeagues);

    const headerInner = (
      <>
        <LeagueEmoji emoji={league.emoji} size={16} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-txt">{league.name}</span>
          {parentPath && (
            <span className="block truncate text-2xs font-medium leading-tight text-faint">{parentPath}</span>
          )}
        </div>
        {collapsible && (
          <>
            <span className="tnum shrink-0 rounded-full bg-surface3 px-1.5 py-px text-2xs font-extrabold text-muted">
              {kids.length}
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-faint transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}
            />
            <Link
              to={`/league/${league.id}`}
              onClick={e => e.stopPropagation()}
              aria-label={`Open ${league.name} page`}
              title="Open league page"
              className="press focus-ring shrink-0 rounded-md p-0.5 text-faint transition-colors hover:text-txt"
            >
              <ChevronRight size={14} />
            </Link>
          </>
        )}
      </>
    );

    const rowsBlock = entry ? (
      <div className="divide-y divide-line">
        <SuperRow icon={<Flame size={14} className="text-loss" />} label="Best attack" row={entry.bestAttack} detail={`${entry.bestAttack.goalsFor} goals`} to={entry.bestAttack.teamId != null ? `/team/${entry.bestAttack.teamId}` : teamTo(entry.bestAttack.team)} />
        <SuperRow
          icon={<Shield size={14} className="text-accent" />}
          label="Best defence"
          row={entry.bestDefence}
          detail={`${entry.bestDefence.goalsAgainst} conceded`}
          to={entry.bestDefence.teamId != null ? `/team/${entry.bestDefence.teamId}` : teamTo(entry.bestDefence.team)}
        />
        <SuperRow
          icon={<TrendingUp size={14} className="text-accent" />}
          label="Top form"
          row={entry.topForm}
          detail={`${winStreak(entry.topForm.form)} win streak`}
          to={entry.topForm.teamId != null ? `/team/${entry.topForm.teamId}` : teamTo(entry.topForm.team)}
        />
      </div>
    ) : null;

    if (!collapsible) {
      // plain league — the whole card opens the league's page
      return (
        <Link
          key={league.id}
          to={`/league/${league.id}`}
          aria-label={`Open ${league.name}`}
          className="group focus-ring block rounded-xl"
        >
          <section aria-label={`${league.name} statistics`} className="card overflow-hidden transition-all duration-150 group-hover:border-line2 group-hover:shadow-pop">
            <div className="flex items-center gap-2 border-b border-line bg-surface2 px-3.5 py-2.5">{headerInner}</div>
            {rowsBlock}
          </section>
        </Link>
      );
    }

    // containers toggle from anywhere on the card (not just the header strip);
    // clicks never bubble into a parent league's card
    const interactionProps = {
      role: 'button' as const,
      tabIndex: 0,
      'aria-expanded': !isCollapsed,
      title: isCollapsed ? `Show ${kids.length} league${kids.length === 1 ? '' : 's'} inside` : 'Hide leagues inside',
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleCollapse(league.id);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCollapse(league.id);
        }
      },
    };

    return (
      <section
        key={league.id}
        aria-label={`${league.name} statistics`}
        {...interactionProps}
        className="card cursor-pointer select-none overflow-hidden focus-ring transition-colors duration-150 hover:border-line2"
      >
        <div className="flex items-center gap-2 border-b border-line bg-surface2 px-3.5 py-2.5">{headerInner}</div>
        {rowsBlock}
        {!isCollapsed && (
          <div
            onClick={e => e.stopPropagation()}
            className={`flex flex-col gap-2 border-l-2 border-line2/60 bg-surface px-2.5 py-2.5 sm:px-3 ${
              entry ? 'border-t border-line' : ''
            }`}
          >
            {node.kids.map(kid => renderNode(kid))}
          </div>
        )}
      </section>
    );
  };

  const loading = (matches.loading && !matches.data) || (tables.loading && !tables.data);

  return (
    <div className="flex flex-col gap-5 animate-fadeUp">
      <header className="px-1">
        <h1 className="text-xl font-extrabold tracking-tight">Statistics</h1>
      </header>

      {loading && <ListSkeleton count={4} />}

      {!loading && (
        <>
          {/* outcomes split */}
          {finished.length > 0 && (
            <section aria-label="Outcomes" className="card p-4">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-muted">Outcomes</h2>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface3">
                <div className="bg-accent" style={{ width: `${(goals.home / finished.length) * 100}%` }} />
                <div className="bg-surface3/80" style={{ width: `${(goals.draws / finished.length) * 100}%` }} />
                <div className="bg-live/70" style={{ width: `${(goals.away / finished.length) * 100}%` }} />
              </div>
              <div className="tnum mt-2.5 flex justify-between text-2xs font-semibold text-muted">
                <span className="text-accent">{goals.home} home wins</span>
                <span>{goals.draws} draws</span>
                <span className="text-live">{goals.away} away wins</span>
              </div>
            </section>
          )}

          {/* biggest wins */}
          {bigWins.length > 0 && (
            <section aria-label="Biggest wins" className="card overflow-hidden">
              <h2 className="border-b border-line bg-surface2 px-3.5 py-2.5 text-[13px] font-bold uppercase tracking-wider text-muted">
                Biggest wins
              </h2>
              <div className="divide-y divide-line">
                {bigWins.map(m => {
                  const margin = Math.abs(m.homeScore - m.awayScore);
                  const winner = m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam;
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                      <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-xs font-extrabold text-accent">
                        +{margin}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-sm font-bold text-txt">
                        {m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam}
                      </span>
                      <span className="tnum shrink-0 text-sm font-extrabold text-txt">
                        {m.homeScore} - {m.awayScore}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted">
                        {m.homeScore > m.awayScore ? m.awayTeam : m.homeTeam}
                      </span>
                      {m.league && <LeagueEmoji emoji={m.league.emoji} size={14} />}
                    </div>
                  );
                })}
              </div>
              {bigWins.length > 0 && (
                <p className="border-t border-line px-3.5 py-2 text-2xs text-faint">
                  Biggest winners: {bigWins.map(m => (m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam)).join(', ')}
                </p>
              )}
            </section>
          )}

          {/* per-league superlatives — leagues nested inside their parent,
              click a container header (or its chevron) to show/hide them */}
          {leagueTree.map(node => renderNode(node))}

          {all.length === 0 && (
            <EmptyState icon={<Target size={28} />} title="Nothing to analyse yet" hint="Add fixtures and results first." />
          )}
        </>
      )}
    </div>
  );
};

const SuperRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  row: { team: string; emoji?: string };
  detail: string;
  /** Set when the club is registered — links to its page. */
  to?: string;
}> = ({ icon, label, row, detail, to }) => (
  <div className="flex items-center gap-2.5 px-3.5 py-2.5">
    <span className="text-faint">{icon}</span>
    <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">{label}</span>
    {row.emoji ? <LeagueEmoji emoji={row.emoji} size={18} /> : <TeamBadge name={row.team} size={18} />}
    {to ? (
      <Link
        to={to}
        className="min-w-0 flex-1 truncate text-sm font-bold text-txt transition-colors hover:text-accent"
      >
        {row.team}
      </Link>
    ) : (
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-txt">{row.team}</span>
    )}
    <span className="tnum shrink-0 text-xs font-semibold text-muted">{detail}</span>
  </div>
);

export default StatisticsPage;
