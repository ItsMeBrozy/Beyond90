import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CalendarClock, Hash, MessageCircle, Signal, Table2, Users } from 'lucide-react';
import { api, currentScore, parseLineup, viewOf } from '../services/api';
import { Match, StandingsTable } from '../types';
import { useAsync } from '../hooks/useAsync';
import { usePolling, useLiveReload, useKickoffTick } from '../lib/live';
import { fullDateLabel, timeLabel } from '../lib/format';
import { TeamBadge } from '../components/ui/TeamBadge';
import { FollowButton } from '../components/ui/FollowButton';
import { LineupPitch } from '../components/match/LineupPitch';
import { LiveBadge, EmptyState, LeagueEmoji } from '../components/ui/primitives';

const MatchCenterPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<'lineup' | 'table'>('lineup');
  const { data: match, loading, error, reload } = useAsync(() => api.getMatch(id!), [id]);
  const tables = useAsync(() => api.getStandings(), []);
  // poll while open so /setscore from Discord shows up without a manual refresh
  usePolling(reload, 15000);
  useLiveReload(() => {
    reload();
    tables.reload();
  });
  // tick each second while the game isn't finished so the countdown hitting
  // zero flips it to LIVE on its own
  useKickoffTick(match?.status === 'scheduled');

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 animate-fadeIn">
        <div className="skeleton h-14 w-14 rounded-full" />
        <div className="skeleton h-8 w-56" />
        <p className="text-xs text-faint">Loading match…</p>
      </div>
    );
  }

  if (error || !match) {
    return (
      <EmptyState
        icon={<MessageCircle size={28} />}
        title={error ? 'Could not load this match' : `Match #${id} not found`}
        hint={error?.message ?? 'It may have been removed with /removematch.'}
      >
        <Link to="/" className="press focus-ring chip bg-accent/15 font-bold text-accent">
          Browse all matches
        </Link>
      </EmptyState>
    );
  }

  const view = viewOf(match);
  const isLive = view.phase === 'live';
  const isFinished = view.phase === 'finished';
  const isHt = match.status === 'ht';
  const showScore = isLive || isFinished;
  const score = currentScore(match);
  const homeLineup = parseLineup(match.homeLineup);
  const awayLineup = parseLineup(match.awayLineup);
  const hasLineups = homeLineup.length > 0 || awayLineup.length > 0;

  const kickoff = new Date(match.startTime);

  return (
    <div className="flex flex-col gap-5 animate-fadeUp">
      <div className="flex items-center justify-between">
        <Link to="/" className="focus-ring flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-txt">
            <ArrowLeft size={14} /> Home
          </Link>
        <FollowButton kind="match" id={String(match.id)} withLabel />
      </div>

      {/* Scoreboard */}
      <section className="card overflow-hidden" aria-label="Scoreboard">
        {/* league title row */}
        {match.league && (
          <div className="flex items-center justify-center gap-2 border-b border-line px-4 py-3.5">
            <LeagueEmoji emoji={match.league.emoji} size={18} />
            <span className="truncate text-sm font-bold text-txt sm:text-[15px]">{match.league.name}</span>
          </div>
        )}

        <div className="p-5 sm:p-8">
          {/* date + kick-off time, centered */}
          <p className="mb-6 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted sm:text-[13px]">
            <CalendarDays size={14} className="shrink-0" />
            <span>{fullDateLabel(match.startTime)} · {timeLabel(match.startTime)}</span>
          </p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
          {/* home — name on the outside, crest facing the middle */}
          <div className="flex min-w-0 items-center justify-end gap-2.5 sm:gap-4">
            <span className={`truncate text-base font-bold sm:text-2xl ${showScore && score.home > score.away ? 'text-txt' : 'text-muted'}`}>
              {match.homeTeam}
            </span>
            <TeamBadge name={match.homeTeam} size={48} className="shrink-0 drop-shadow-md" />
          </div>

          <div className="flex flex-col items-center gap-2">
            {isHt ? (
              <span className="chip bg-accent/15 font-extrabold text-accent">Half time</span>
            ) : isLive ? (
              <LiveBadge plain />
            ) : isFinished ? (
              <span className="chip bg-surface3 font-bold text-muted">Full time</span>
            ) : (
              <span className="tnum text-3xl font-black tracking-tight text-txt sm:text-5xl">{timeLabel(match.startTime)}</span>
            )}
            {showScore ? (
              <div className="tnum flex items-baseline font-black tracking-tight text-4xl sm:text-5xl">
                <span>{score.home}</span>
                <span className="mx-2.5 text-2xl font-bold text-muted sm:mx-4 sm:text-4xl">–</span>
                <span>{score.away}</span>
              </div>
            ) : (
              <div className="tnum font-black tracking-tight">
                <KickoffClock iso={match.startTime} />
              </div>
            )}
          </div>

          {/* away — crest facing the middle, name on the outside */}
          <div className="flex min-w-0 items-center justify-start gap-2.5 sm:gap-4">
            <TeamBadge name={match.awayTeam} size={48} className="shrink-0 drop-shadow-md" />
            <span className={`truncate text-base font-bold sm:text-2xl ${showScore && score.away > score.home ? 'text-txt' : 'text-muted'}`}>
              {match.awayTeam}
            </span>
          </div>
        </div>
        </div>
      </section>

      {/* Lineup / Table tabs */}
      <div className="flex gap-1 border-b border-line px-1" role="tablist" aria-label="Match sections">
        {(['lineup', 'table'] as const).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`press focus-ring relative rounded-t-lg px-4 py-2 text-[13px] font-bold capitalize transition-colors ${
              tab === t ? 'text-txt' : 'text-muted hover:text-txt'
            }`}
          >
            {t === 'lineup' ? 'Lineup' : 'Table'}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === 'lineup' &&
        (hasLineups ? (
          <section aria-label="Line-ups" className="animate-fadeUp">
            <LineupPitch
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
              homePlayers={homeLineup}
              awayPlayers={awayLineup}
            />
          </section>
        ) : (
          <EmptyState icon={<Users size={28} />} title="No lineups yet" />
        ))}

      {tab === 'table' && <LeagueTableMini match={match} tables={tables.data ?? []} />}

      {/* Info */}
      <section aria-label="Match info" className="card divide-y divide-line px-4 py-1">
        <InfoRow icon={<Hash size={15} />} label="Match ID" value={`#${match.id}`} />
        {match.league && (
          <InfoRow
            icon={<LeagueEmoji emoji={match.league.emoji} size={15} />}
            label="League"
            value={match.league.name}
          />
        )}
        <InfoRow
          icon={<CalendarClock size={15} />}
          label="Kick-off"
          value={`${fullDateLabel(match.startTime)} · ${timeLabel(match.startTime)}`}
        />
        <InfoRow
          icon={<Signal size={15} />}
          label="Status"
          value={isHt ? 'Half time' : isLive ? 'Live' : isFinished ? 'Finished' : 'Scheduled'}
        />
      </section>

      {isHt && (match.homeHtScore != null || match.awayHtScore != null) && (
        <p className="px-1 text-center text-2xs text-faint">Score at half time — full time to follow.</p>
      )}
    </div>
  );
};

/** HH:MM:SS countdown to kick-off; disappears once the match starts.
 *  Re-renders come from the page-level useKickoffTick. */
const KickoffClock: React.FC<{ iso: string }> = ({ iso }) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return <span className="tnum text-sm font-bold text-faint sm:text-base">{hh}:{mm}:{ss}</span>;
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 py-3">
    <span className="text-faint">{icon}</span>
    <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">{label}</span>
    <span className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold">{value}</span>
  </div>
);

/** The Table tab: this league's standings with the two clubs playing highlighted. */
const LeagueTableMini: React.FC<{ match: Match; tables: StandingsTable[] }> = ({ match, tables }) => {
  if (!match.league) {
    return (
      <EmptyState
        icon={<Table2 size={28} />}
        title="No league"
        hint="This match isn't part of a league, so there's no table to show."
      />
    );
  }
  const table = tables.find(t => t.league.id === match.league!.id);
  if (!table) {
    return (
      <EmptyState
        icon={<Table2 size={28} />}
        title="No table yet"
        hint={`${match.league.name} doesn't have a standings table yet.`}
      />
    );
  }

  return (
    <section aria-label="League table" className="card animate-fadeUp overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface2 px-3.5 py-2.5">
        <LeagueEmoji emoji={table.league.emoji} size={14} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted">{table.league.name}</span>
        <span className="ml-auto flex items-center gap-3 text-2xs font-semibold text-faint">
          <span className="flex min-w-0 items-center gap-1">
            <span className="h-2.5 w-1 shrink-0 rounded-full bg-accent" />
            <span className="max-w-[110px] truncate">{match.homeTeam}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="h-2.5 w-1 shrink-0 rounded-full bg-sky-400" />
            <span className="max-w-[110px] truncate">{match.awayTeam}</span>
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-2xs font-bold uppercase tracking-wider text-faint">
              <th className="py-2 pl-3 pr-1 text-left font-bold">#</th>
              <th className="py-2 pr-2 text-left font-bold">Team</th>
              <th className="px-1.5 text-center font-bold">P</th>
              <th className="hidden px-1.5 text-center font-bold sm:table-cell">W</th>
              <th className="hidden px-1.5 text-center font-bold sm:table-cell">D</th>
              <th className="hidden px-1.5 text-center font-bold sm:table-cell">L</th>
              <th className="px-1.5 text-center font-bold">GD</th>
              <th className="py-2 pl-1.5 pr-3 text-center font-bold">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {table.rows.map(row => {
              const isHome = row.team.toLowerCase() === match.homeTeam.toLowerCase();
              const isAway = row.team.toLowerCase() === match.awayTeam.toLowerCase();
              const hot = isHome || isAway;
              return (
                <tr
                  key={row.team}
                  className={`transition-colors ${isHome ? 'bg-accent/10' : isAway ? 'bg-sky-400/10' : 'hover:bg-surface2/60'}`}
                >
                  <td className="w-10 py-2 pl-3 pr-1">
                    <div className="flex items-center gap-1.5">
                      {hot && <span className={`h-4 w-1 shrink-0 rounded-full ${isHome ? 'bg-accent' : 'bg-sky-400'}`} />}
                      <span className={`tnum font-bold ${hot ? 'text-txt' : 'text-faint'}`}>{row.position}</span>
                    </div>
                  </td>
                  <td className="max-w-[170px] py-2 pr-2">
                    {row.teamId ? (
                      <Link
                        to={`/team/${row.teamId}`}
                        className="focus-ring flex min-w-0 items-center gap-2 rounded transition-colors hover:text-accent"
                      >
                        {row.emoji ? <LeagueEmoji emoji={row.emoji} size={16} /> : <TeamBadge name={row.team} size={16} />}
                        <span className={`truncate ${hot ? 'font-bold text-txt' : 'font-medium text-muted'}`}>{row.team}</span>
                      </Link>
                    ) : (
                      <div className="flex min-w-0 items-center gap-2">
                        {row.emoji ? <LeagueEmoji emoji={row.emoji} size={16} /> : <TeamBadge name={row.team} size={16} />}
                        <span className={`truncate ${hot ? 'font-bold text-txt' : 'font-medium text-muted'}`}>{row.team}</span>
                      </div>
                    )}
                  </td>
                  <td className="tnum px-1.5 text-center font-semibold text-muted">{row.played}</td>
                  <td className="tnum hidden px-1.5 text-center text-muted sm:table-cell">{row.won}</td>
                  <td className="tnum hidden px-1.5 text-center text-muted sm:table-cell">{row.drawn}</td>
                  <td className="tnum hidden px-1.5 text-center text-muted sm:table-cell">{row.lost}</td>
                  <td
                    className={`tnum px-1.5 text-center font-semibold ${
                      row.goalDiff > 0 ? 'text-win' : row.goalDiff < 0 ? 'text-loss' : 'text-muted'
                    }`}
                  >
                    {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                  </td>
                  <td className="tnum py-2 pl-1.5 pr-3 text-center font-extrabold text-txt">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default MatchCenterPage;
