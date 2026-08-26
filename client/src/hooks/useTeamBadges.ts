import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Team } from '../types';

// name (lowercased) -> badge emoji; '' for teams without one
let cache: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

function load(): Promise<Map<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api
      .getTeams()
      .then((teams: Team[]) => {
        cache = new Map(teams.map(t => [t.name.toLowerCase(), t.emoji ?? '']));
        return cache;
      })
      .catch(() => new Map<string, string>())
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drop the cached badge map so the next render re-fetches fresh teams. */
export function invalidateTeamBadges(): void {
  cache = null;
}

/**
 * Lookup that maps a team name (case-insensitive) to its Discord badge emoji.
 * Fetches /teams once per session and shares the result across every caller,
 * so crests can fall back to real logos anywhere a team name is rendered.
 */
export function useTeamBadges(): (name: string) => string | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    if (!cache) load().then(() => force(n => n + 1));
  }, []);
  return (name: string) => cache?.get(name.toLowerCase());
}
