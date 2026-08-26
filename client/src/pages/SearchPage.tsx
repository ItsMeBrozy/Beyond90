import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, MessageCircle, Search as SearchIcon } from 'lucide-react';
import { api, leaguePath, leagueSubline, searchMatches, teamSubline, viewOf } from '../services/api';
import { League, Match, Team } from '../types';
import { useAsync } from '../hooks/useAsync';
import { TeamBadge } from '../components/ui/TeamBadge';
import { EmptyState, LeagueEmoji } from '../components/ui/primitives';
import { ListSkeleton } from '../components/ui/skeletons';

const SearchPage: React.FC = () => {
  const [params] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const { data, loading } = useAsync<Match[]>(() => api.getMatches(), []);
  const teams = useAsync<Team[]>(() => api.getTeams(), []);
  const leagues = useAsync<League[]>(() => api.getLeagues(), []);

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  const results = useMemo(() => {
    if (!data) return null;
    return query.trim().length >= 2 ? searchMatches(data, query) : null;
  }, [data, query]);

  const teamHits = useMemo(() => {
    if (!teams.data || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return teams.data.filter(t => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [teams.data, query]);

  const leagueHits = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return leagues.data ? leagues.data.filter(l => l.name.toLowerCase().includes(q)).slice(0, 6) : [];
  }, [leagues.data, query]);

  return (
    <div className="flex flex-col gap-4 animate-fadeUp">
      <header className="px-1">
        <h1 className="text-xl font-extrabold tracking-tight">Search</h1>
        <p className="mt-0.5 text-xs text-muted">Find matches by team name — accent-insensitive.</p>
      </header>

      <div className="card flex items-center gap-2.5 px-3.5 py-2.5">
        <SearchIcon size={17} className="text-faint" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Try “real” or “united”…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          aria-label="Search matches"
          autoFocus
        />
      </div>

      {loading && !data && <ListSkeleton count={3} />}

      {!loading && results === null && teamHits.length === 0 && leagueHits.length === 0 && (
        <p className="px-1 py-6 text-center text-xs text-faint">Type at least two characters to search.</p>
      )}

      {teamHits.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-faint">Teams</p>
          <div className="card divide-y divide-line overflow-hidden py-0">
            {teamHits.map(t => {
              const sub = teamSubline(t, leagues.data ?? []);
              return (
                <Link
                  key={t.id}
                  to={`/team/${t.id}`}
                  className="press focus-ring flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface2"
                >
                  <TeamBadge name={t.name} emoji={t.emoji} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                    {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                  </span>
                  <ChevronRight size={14} className="text-faint" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {leagueHits.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-faint">Leagues</p>
          <div className="card divide-y divide-line overflow-hidden py-0">
            {leagueHits.map(l => {
              const sub = [leaguePath(l, leagues.data ?? []), leagueSubline(l, leagues.data ?? [])]
                .filter(Boolean)
                .join(' · ');
              return (
                <Link
                  key={l.id}
                  to={`/league/${l.id}`}
                  className="press focus-ring flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface2"
                >
                  <LeagueEmoji emoji={l.emoji} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{l.name}</span>
                    {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                  </span>
                  <ChevronRight size={14} className="text-faint" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {results !== null && results.length === 0 && teamHits.length === 0 && leagueHits.length === 0 && (
        <EmptyState icon={<MessageCircle size={28} />} title={`Nothing found for “${query}”`}>
          <Link to="/" className="press focus-ring chip bg-accent/15 font-bold text-accent">
            Browse all matches
          </Link>
        </EmptyState>
      )}

      {results !== null && results.length > 0 && (
        <div className="card divide-y divide-line overflow-hidden py-0">
          {results.map(m => {
            const view = viewOf(m);
            const statusLabel =
              view.phase === 'live'
                ? 'LIVE'
                : view.phase === 'finished'
                  ? `FT ${m.homeScore}–${m.awayScore}`
                  : new Date(m.startTime).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
            return (
              <Link
                key={m.id}
                to={`/match/${m.id}`}
                className="press focus-ring flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface2"
              >
                <span className="flex gap-1">
                  <TeamBadge name={m.homeTeam} size={26} />
                  <TeamBadge name={m.awayTeam} size={26} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    {m.homeTeam} vs {m.awayTeam}
                  </span>
                  <span className={`block text-xs ${view.phase === 'live' ? 'font-bold text-live' : 'text-muted'}`}>
                    #{m.id} · {statusLabel}
                  </span>
                </span>
                <ChevronRight size={14} className="text-faint" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
