import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Layers, MessageCircle, RefreshCw, Trophy } from 'lucide-react';
import { api, leagueSubline } from '../services/api';
import { League } from '../types';
import { useAsync } from '../hooks/useAsync';
import { usePolling, useLiveReload } from '../lib/live';
import { EmptyState, LeagueEmoji } from '../components/ui/primitives';
import { ListSkeleton } from '../components/ui/skeletons';

// ---------------------------------------------------------------------------
// Leagues hub. Leagues can nest inside other leagues (e.g. the real top-5
// competitions placed under a made-up league). A league that contains other
// leagues can't be opened — it's a folder, not a table — and its nested
// leagues are always shown right beneath it.
// ---------------------------------------------------------------------------

interface LeagueCardProps {
  league: League;
  /** Every league, so container cards can aggregate what's nested inside. */
  all: League[];
  compact?: boolean;
}

const LeagueCard: React.FC<LeagueCardProps> = ({ league, all, compact }) => (
  <Link
    to={`/league/${league.id}`}
    aria-label={`Open ${league.name}`}
    className={`press focus-ring card group flex items-center gap-3 transition-all duration-150 hover:border-line2 hover:bg-surface2/60 hover:shadow-pop ${
      compact ? 'p-3' : 'p-4'
    }`}
  >
    <LeagueEmoji emoji={league.emoji} size={compact ? 24 : 32} />
    <div className="min-w-0 flex-1">
      <p className={`truncate font-bold text-txt ${compact ? 'text-sm' : 'text-[15px]'}`}>{league.name}</p>
      {leagueSubline(league, all) && (
        <p className="tnum mt-0.5 text-2xs font-medium text-faint">{leagueSubline(league, all)}</p>
      )}
    </div>
    <ChevronRight size={16} className="shrink-0 text-faint transition-transform duration-150 group-hover:translate-x-0.5" />
  </Link>
);

const ContainerCard: React.FC<{ league: League; all: League[] }> = ({ league, all }) => (
  <div className="card flex items-center gap-3 p-4" aria-label={`${league.name} (contains other leagues)`}>
    <LeagueEmoji emoji={league.emoji} size={32} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[15px] font-bold text-txt">{league.name}</p>
      {leagueSubline(league, all) && (
        <p className="tnum mt-0.5 text-2xs font-medium text-faint">{leagueSubline(league, all)}</p>
      )}
    </div>
    <Layers size={16} className="shrink-0 text-faint" aria-hidden />
  </div>
);

const LeaguesPage: React.FC = () => {
  const { data, loading, error, reload } = useAsync(() => api.getLeagues(), []);
  usePolling(reload, 60000);
  useLiveReload(reload);

  const leagues = data ?? [];
  const topLevel = leagues.filter(l => !l.parentId);
  const childrenOf = (id: number) => leagues.filter(l => l.parentId === id);

  return (
    <div className="flex flex-col gap-5 animate-fadeUp">
      <header className="flex items-center justify-between gap-2 px-1">
        <h1 className="text-xl font-extrabold tracking-tight">Leagues</h1>
        <button
          type="button"
          onClick={reload}
          className="press focus-ring flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-txt"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      {error && (
        <EmptyState icon={<MessageCircle size={28} />} title="Could not load leagues" hint={error.message}>
          <button type="button" onClick={reload} className="press focus-ring chip bg-accent/15 font-bold text-accent">
            Retry
          </button>
        </EmptyState>
      )}

      {loading && !data && <ListSkeleton count={3} />}

      {!error && leagues.length === 0 && !loading && (
        <EmptyState
          icon={<Trophy size={28} />}
          title="No leagues yet"
          hint="Create your first one with /addleague, or drop in a real competition like the Premier League with /addrealleague."
        />
      )}

      <div className="flex flex-col gap-2.5">
        {topLevel.map(league => {
          const children = childrenOf(league.id);
          return (
            <React.Fragment key={league.id}>
              {children.length > 0 ? (
                <>
                  <ContainerCard league={league} all={leagues} />
                  <div className="grid grid-cols-1 gap-2 border-l-2 border-line2/60 pl-4 sm:grid-cols-2 sm:pl-6 mb-2">
                    {children.map(child => (
                      <LeagueCard key={child.id} league={child} all={leagues} compact />
                    ))}
                  </div>
                </>
              ) : (
                <LeagueCard league={league} all={leagues} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default LeaguesPage;
