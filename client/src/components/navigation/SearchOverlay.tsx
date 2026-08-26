import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Search as SearchIcon, X } from 'lucide-react';
import { api, leaguePath, leagueSubline, searchMatches, teamSubline, viewOf } from '../../services/api';
import { League, Match, Team } from '../../types';
import { TeamBadge } from '../ui/TeamBadge';
import { LeagueEmoji } from '../ui/primitives';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<Match[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setAll(null);
    setTeams([]);
    setTimeout(() => inputRef.current?.focus(), 30);
    let alive = true;
    Promise.all([api.getMatches(), api.getTeams(), api.getLeagues()])
      .then(([ms, ts, ls]) => {
        if (!alive) return;
        setAll(ms);
        setTeams(ts);
        setLeagues(ls);
      })
      .catch(() => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const results = all ? (query.trim().length >= 2 ? searchMatches(all, query) : null) : null;
  const q = query.trim().toLowerCase();
  const teamHits =
    query.trim().length >= 2 ? teams.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const leagueHits =
    query.trim().length >= 2 ? leagues.filter(l => l.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-3 pt-[10vh] backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="card w-full max-w-xl overflow-hidden shadow-pop animate-slideDown" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <SearchIcon size={17} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && results && results.length > 0) go(`/match/${results[0].id}`);
              else if (e.key === 'Enter' && query.trim()) go(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
            placeholder="Search matches, clubs and leagues…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
            aria-label="Search query"
          />
          <button type="button" onClick={onClose} className="press focus-ring rounded-md p-1 text-faint hover:text-txt" aria-label="Close search">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {all === null && (
            <div className="px-3 py-6 text-center text-xs text-faint">Loading matches…</div>
          )}
          {results === null && all !== null && (
            <div className="px-3 py-6 text-center text-xs text-faint">
              Type at least two characters — try a team name like “Arsenal”.
            </div>
          )}
          {results !== null && results.length === 0 && teamHits.length === 0 && leagueHits.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-semibold">Nothing found for “{query}”</p>
              <p className="mt-1 text-xs text-muted">
                Try a club, league or fixture — or add one with the Discord bot.
              </p>
            </div>
          )}
          {leagueHits.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-faint">Leagues</p>
              {leagueHits.map(l => {
                const sub = [leaguePath(l, leagues), leagueSubline(l, leagues)].filter(Boolean).join(' · ');
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => go(`/league/${l.id}`)}
                    className="press focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface2"
                  >
                    <LeagueEmoji emoji={l.emoji} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{l.name}</span>
                      {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                    </span>
                    <ChevronRight size={13} className="text-faint" />
                  </button>
                );
              })}
            </>
          )}
          {teamHits.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-faint">Teams</p>
              {teamHits.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(`/team/${t.id}`)}
                  className="press focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface2"
                >
                  <TeamBadge name={t.name} emoji={t.emoji} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                    {teamSubline(t, leagues) && (
                      <span className="block truncate text-xs text-muted">{teamSubline(t, leagues)}</span>
                    )}
                  </span>
                  <ChevronRight size={13} className="text-faint" />
                </button>
              ))}
            </>
          )}
          {results !== null &&
            results.map(m => {
              const view = viewOf(m);
              const statusLabel =
                view.phase === 'live'
                  ? 'LIVE'
                  : view.phase === 'finished'
                    ? `FT ${m.homeScore}–${m.awayScore}`
                    : new Date(m.startTime).toLocaleString([], {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => go(`/match/${m.id}`)}
                  className="press focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface2"
                >
                  <span className="flex gap-1">
                    <TeamBadge name={m.homeTeam} size={22} />
                    <TeamBadge name={m.awayTeam} size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {m.homeTeam} vs {m.awayTeam}
                    </span>
                    <span className={`block truncate text-xs ${view.phase === 'live' ? 'text-live font-bold' : 'text-muted'}`}>
                      #{m.id} · {statusLabel}
                    </span>
                  </span>
                  <ChevronRight size={13} className="text-faint" />
                </button>
              );
            })}
        </div>
        <div className="border-t border-line px-4 py-1.5">
          <Link
            to={`/search?q=${encodeURIComponent(query)}`}
            onClick={() => onClose()}
            className="focus-ring flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold text-accent hover:bg-accent/10"
          >
            See all results for “{query || '…'}” <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SearchOverlay;
