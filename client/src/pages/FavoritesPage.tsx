import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { api, viewOf } from '../services/api';
import { Match, MatchPhase } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useFavorites } from '../store/FavoritesContext';
import { usePolling, useLiveReload } from '../lib/live';
import { MatchCard } from '../components/match/MatchCard';
import { EmptyState, SectionHeader } from '../components/ui/primitives';
import { ListSkeleton } from '../components/ui/skeletons';

const SECTION_LABELS: Record<MatchPhase, string> = {
  live: 'Live now',
  upcoming: 'Upcoming',
  finished: 'Results',
};

const ORDER: Record<MatchPhase, number> = { live: 0, upcoming: 1, finished: 2 };

const FavoritesPage: React.FC = () => {
  const { matches: starred } = useFavorites();
  const { data, loading, reload } = useAsync<Match[]>(() => api.getMatches(), []);
  usePolling(reload, 30000);
  useLiveReload(reload);

  const groups = useMemo(() => {
    const all = data ?? [];
    const mine = all
      .filter(m => starred.includes(String(m.id)))
      .sort((a, b) => {
        const pa = ORDER[viewOf(a).phase];
        const pb = ORDER[viewOf(b).phase];
        if (pa !== pb) return pa - pb;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });
    const out: { phase: MatchPhase; list: Match[] }[] = [];
    (['live', 'upcoming', 'finished'] as MatchPhase[]).forEach(phase => {
      const list = mine.filter(m => viewOf(m).phase === phase);
      if (list.length > 0) out.push({ phase, list });
    });
    return out;
  }, [data, starred]);

  return (
    <div className="flex flex-col gap-6 animate-fadeUp">
      <header className="px-1">
        <h1 className="text-xl font-extrabold tracking-tight">Favorites</h1>
        <p className="mt-0.5 text-xs text-muted">Starred matches. Kick-off reminders show up in the bell menu.</p>
      </header>

      {loading && !data && <ListSkeleton count={3} />}

      {!loading && groups.length === 0 && (
        <EmptyState
          icon={<Star size={28} />}
          title="No starred matches yet"
          hint="Tap the star on any match card to pin it here and get reminders."
        >
          <Link to="/" className="press focus-ring chip bg-accent/15 font-bold text-accent">
            Browse matches
          </Link>
        </EmptyState>
      )}

      {groups.map(({ phase, list }) => (
        <section key={phase} aria-label={SECTION_LABELS[phase]}>
          <SectionHeader title={SECTION_LABELS[phase]} className="mb-2" />
          <div className="flex flex-col gap-2">
            {list.map(m => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default FavoritesPage;
