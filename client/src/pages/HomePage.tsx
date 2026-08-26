import React, { useCallback, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, MessageCircle, Users } from 'lucide-react';
import { api, groupByLeague, viewOf } from '../services/api';
import { Club, Match, MatchPhase } from '../types';
import { useAsync } from '../hooks/useAsync';
import { usePolling, useLiveReload } from '../lib/live';
import { toDateKey, isSameDay } from '../lib/format';
import { DateSelector } from '../components/navigation/DateSelector';
import { LeagueSection } from '../components/match/LeagueSection';
import { EmptyState, LeagueEmoji } from '../components/ui/primitives';
import { ListSkeleton } from '../components/ui/skeletons';

// ---------------------------------------------------------------------------
// Home — today's matches, plus a sticky left rail with tabs: the community
// Clubs directory (/add-club on Discord fills it) and the Friendly Finder
// Discord server for 7v7 friendlies and loans.
// ---------------------------------------------------------------------------

type Filter = 'all' | MatchPhase;
type View = 'matches' | 'clubs';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'finished', label: 'Finished' },
];

// community server where 7v7 friendlies and loans get arranged
const FRIENDLY_FINDER_URL = 'https://discord.gg/KWkJ9CGDv';
// :FF: custom emoji from the Discord server, used as the tab logo
const FRIENDLY_FINDER_LOGO = 'https://cdn.discordapp.com/emojis/1542159986761670828.png';

const HomePage: React.FC = () => {
  const [dayKey, setDayKey] = useState(() => toDateKey(new Date()));
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<View>('matches');

  const matches = useAsync<Match[]>(() => api.getMatches(), []);
  const clubs = useAsync<Club[]>(() => api.getClubs(), []);
  const reload = useCallback(() => {
    matches.reload();
    clubs.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePolling(reload, 30000);
  useLiveReload(reload);

  const data = matches.data;
  const matchesList = data ?? [];
  const dayMatches = useMemo(
    () =>
      matchesList
        .filter(m => isSameDay(new Date(m.startTime), new Date(dayKey)))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [matchesList, dayKey]
  );

  const counts = useMemo(
    () =>
      ({
        all: dayMatches.length,
        live: dayMatches.filter(m => viewOf(m).phase === 'live').length,
        upcoming: dayMatches.filter(m => viewOf(m).phase === 'upcoming').length,
        finished: dayMatches.filter(m => viewOf(m).phase === 'finished').length,
      }) as Record<Filter, number>,
    [dayMatches]
  );

  const shown = useMemo(
    () => dayMatches.filter(m => filter === 'all' || viewOf(m).phase === filter),
    [dayMatches, filter]
  );

  const leagueGroups = useMemo(() => {
    // within each league: in-play/upcoming kick-offs first, finished results after
    const ordered = [...shown].sort((a, b) => {
      const pa = viewOf(a).phase === 'finished' ? 1 : 0;
      const pb = viewOf(b).phase === 'finished' ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
    return groupByLeague(ordered);
  }, [shown]);

  const loading = (matches.loading && !data) || (clubs.loading && !clubs.data);

  return (
    <div className="flex flex-col gap-6 animate-fadeUp md:flex-row md:gap-10">
      {/* left tab rail — pinned to the middle-left of the viewport */}
      <aside className="shrink-0">
        <nav
          aria-label="Home sections"
          className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 md:sticky md:top-0 md:h-dvh md:w-72 md:-translate-y-20 md:flex-col md:justify-center"
        >
          <button
            type="button"
            onClick={() => setView('matches')}
            aria-pressed={view === 'matches'}
            className={`press focus-ring flex shrink-0 items-center gap-4 rounded-xl border px-5 py-4 text-left text-base font-bold transition-colors ${
              view === 'matches'
                ? 'border-transparent bg-accent text-accent-ink shadow-pop'
                : 'border-line bg-surface2 text-muted hover:text-txt'
            }`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/10">
              <CalendarDays size={22} />
            </span>
            Matches
          </button>
          <button
            type="button"
            onClick={() => setView('clubs')}
            aria-pressed={view === 'clubs'}
            className={`press focus-ring flex shrink-0 items-center gap-4 rounded-xl border px-5 py-4 text-left text-base font-bold transition-colors ${
              view === 'clubs'
                ? 'border-transparent bg-accent text-accent-ink shadow-pop'
                : 'border-line bg-surface2 text-muted hover:text-txt'
            }`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/10">
              <Users size={22} />
            </span>
            Clubs
          </button>
          <a
            href={FRIENDLY_FINDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group press focus-ring flex shrink-0 items-center gap-4 rounded-xl border border-line bg-surface2 px-5 py-4 text-left text-base font-bold text-muted transition-colors hover:text-txt"
            title="Opens the Friendly Finder Discord server"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/10">
              <img src={FRIENDLY_FINDER_LOGO} alt="" className="h-7 w-7" />
            </span>
            <span className="min-w-0">
              Friendly Finder
              <span className="block truncate text-xs font-medium text-faint">7v7 friendlies & loans</span>
            </span>
            <ExternalLink size={15} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        </nav>
      </aside>

      <div className="min-w-0 flex-1 md:mx-auto md:w-full md:max-w-3xl md:flex-none">
        {view === 'matches' ? (
          <>
            <header className="px-1 text-center">
              <h1 className="text-xl font-extrabold tracking-tight">Today at Beyond90</h1>
            </header>

            <div className="mt-5">
              <DateSelector value={dayKey} onChange={setDayKey} />
            </div>

            <div
              role="tablist"
              aria-label="Filter matches"
              className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto px-1"
            >
              {FILTERS.map(f => {
                const active = filter === f.id;
                const count = counts[f.id];
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(f.id)}
                    className={`press focus-ring flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      active ? 'bg-accent text-accent-ink shadow-pop' : 'bg-surface2 text-muted hover:text-txt'
                    }`}
                  >
                    {f.label}
                    {count > 0 && (
                      <span
                        className={`tnum rounded-full px-1.5 py-px text-2xs font-extrabold ${
                          active ? 'bg-black/15 text-accent-ink' : 'bg-surface3 text-muted'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-6">
              {matches.error && (
                <EmptyState icon={<MessageCircle size={28} />} title="Could not load matches" hint={matches.error.message}>
                  <button type="button" onClick={reload} className="press focus-ring chip bg-accent/15 font-bold text-accent">
                    Retry
                  </button>
                </EmptyState>
              )}

              {loading && !data && <ListSkeleton count={4} />}

              {!matches.error && (
                <>
                  {/* Selected day, one category per league — live matches carry a LIVE badge */}
                  {leagueGroups.map(group => (
                    <LeagueSection
                      key={group.league ? `l${group.league.id}` : 'other'}
                      name={group.league?.name ?? 'Other'}
                      emoji={group.league?.emoji}
                      matches={group.list}
                      leagueId={group.league?.id}
                    />
                  ))}

                  {shown.length === 0 && !loading && (
                    <EmptyState icon={<MessageCircle size={28} />} title="No matches yet" />
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          /* community clubs directory */
          <section aria-label="Clubs directory" className="flex flex-col gap-4">
            <header className="px-1">
              <h1 className="text-xl font-extrabold tracking-tight">Clubs</h1>
              <p className="mt-0.5 text-xs text-muted">
                Community clubs — tap one to open its Discord server.
              </p>
            </header>

            {loading && !clubs.data && <ListSkeleton count={3} />}

            {!loading && (clubs.data ?? []).length === 0 && (
              <EmptyState
                icon={<Users size={28} />}
                title="No clubs yet"
                hint='Add one on Discord with /add-club — e.g. /add-club ⚡ "Thunder FC" https://discord.gg/xyz'
              />
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(clubs.data ?? []).map(c => (
                <a
                  key={c.id}
                  href={c.invite}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${c.name}'s Discord server`}
                  className="card group press focus-ring flex items-center gap-3 p-4 transition-all duration-150 hover:border-line2 hover:bg-surface2/60 hover:shadow-pop"
                >
                  <LeagueEmoji emoji={c.emoji} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-txt">{c.name}</span>
                    <span className="block truncate text-2xs font-medium text-faint">Discord server</span>
                  </span>
                  <ExternalLink
                    size={16}
                    className="shrink-0 text-faint transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-txt"
                  />
                </a>
              ))}
            </div>

            {clubs.error && (
              <EmptyState icon={<MessageCircle size={28} />} title="Could not load clubs" hint={clubs.error.message}>
                <button type="button" onClick={reload} className="press focus-ring chip bg-accent/15 font-bold text-accent">
                  Retry
                </button>
              </EmptyState>
            )}
          </section>
        )}
      </div>

      {/* balances the tab rail so the match feed sits centered on wide screens */}
      <div className="hidden md:block md:w-72 md:shrink-0" aria-hidden="true" />
    </div>
  );
};

export default HomePage;
