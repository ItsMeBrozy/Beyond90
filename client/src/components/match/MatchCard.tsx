import React from 'react';
import { Link } from 'react-router-dom';
import { Match } from '../../types';
import { currentScore, viewOf } from '../../services/api';
import { TeamBadge } from '../ui/TeamBadge';
import { FollowButton } from '../ui/FollowButton';
import { LeagueEmoji, LiveDot } from '../ui/primitives';
import { timeLabel } from '../../lib/format';
import { useKickoffTick } from '../../lib/live';

// ---------------------------------------------------------------------------
// Compact fotmob-style match row: status pill on the left (live minute / HT /
// FT), then home name — crest — score (or kick-off time) — crest — away name.
// ---------------------------------------------------------------------------

interface MatchCardProps {
  match: Match;
  /** Show the inline league badge (hidden inside LeagueSection boxes). */
  showLeague?: boolean;
  /** Edge-to-edge inside a LeagueSection: no own border/rounding/shadow. */
  flush?: boolean;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, showLeague = true, flush = false }) => {
  const view = viewOf(match);
  // while the game is upcoming, tick each second so it flips to LIVE the
  // moment kick-off passes — no refetch or refresh needed
  useKickoffTick(view.phase === 'upcoming');
  const isLive = view.phase === 'live';
  const isFinished = view.phase === 'finished';
  const isHt = match.status === 'ht';
  const showScore = isLive || isFinished;
  const score = currentScore(match);

  const winnerSide =
    showScore && score.home !== score.away ? (score.home > score.away ? 'home' : 'away') : null;

  return (
    <Link
      to={`/match/${match.id}`}
      className={`press focus-ring group relative block bg-surface px-3 py-3.5 transition-colors duration-150 hover:bg-surface2/60 ${
        flush ? '' : 'card hover:border-line2 hover:shadow-pop'
      }`}
    >
      {showLeague && match.league && (
        <div className="mb-2 flex items-center gap-1 text-2xs font-bold uppercase tracking-wide text-faint">
          <LeagueEmoji emoji={match.league.emoji} size={12} />
          <span className="truncate">{match.league.name}</span>
        </div>
      )}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* status column — pulsing LIVE while running, HT, FT, empty before kick-off */}
        <span className="flex w-11 shrink-0 items-center justify-center">
          {isHt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-[9px] font-extrabold leading-none text-accent">
              HT
            </span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-1 text-[9px] font-extrabold leading-none text-live">
              <LiveDot size={5} />
              LIVE
            </span>
          ) : isFinished ? (
            <span className="chip bg-surface3 text-muted">FT</span>
          ) : null}
        </span>

        {/* home name, right-aligned against its crest */}
        <span
          className={`min-w-0 flex-1 truncate text-right text-sm font-bold ${
            winnerSide === 'away' ? 'text-muted' : 'text-txt'
          }`}
        >
          {match.homeTeam}
        </span>
        <TeamBadge name={match.homeTeam} size={22} className="shrink-0" />

        {/* centre — the score once running, kick-off time before */}
        {showScore ? (
          <span className="tnum shrink-0 whitespace-nowrap px-0.5 text-sm font-extrabold text-txt">
            {score.home} - {score.away}
          </span>
        ) : (
          <span className="tnum shrink-0 whitespace-nowrap px-0.5 text-xs font-semibold text-muted">
            {timeLabel(match.startTime)}
          </span>
        )}

        <TeamBadge name={match.awayTeam} size={22} className="shrink-0" />
        <span
          className={`min-w-0 flex-1 truncate text-left text-sm font-bold ${
            winnerSide === 'home' ? 'text-muted' : 'text-txt'
          }`}
        >
          {match.awayTeam}
        </span>

        <FollowButton kind="match" id={String(match.id)} ghost className="shrink-0" />
      </div>
    </Link>
  );
};

export default MatchCard;
