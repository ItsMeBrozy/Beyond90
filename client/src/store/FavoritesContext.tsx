import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type FavKind = 'match';

interface FavoritesState {
  matches: string[];
  isFavorite: (kind: FavKind, id: string) => boolean;
  toggleFavorite: (kind: FavKind, id: string) => void;
}

// v2 — favorites are starred matches only. The old v1 key also stored
// teams/players/competitions which no longer exist in the app.
const KEY = 'beyond90.favorites.v2';

const EMPTY = { matches: [] as string[] };

const FavoritesContext = createContext<FavoritesState | null>(null);

function load(): typeof EMPTY {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.matches)) return { matches: parsed.matches.map(String) };
    }
  } catch {
    /* ignore */
  }
  return { ...EMPTY };
}

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favs, setFavs] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(favs));
    } catch {
      /* ignore */
    }
  }, [favs]);

  const isFavorite = useCallback((kind: FavKind, id: string) => favs.matches.includes(id), [favs]);

  const toggleFavorite = useCallback((kind: FavKind, id: string) => {
    setFavs(prev => ({
      matches: prev.matches.includes(id) ? prev.matches.filter(x => x !== id) : [...prev.matches, id],
    }));
  }, []);

  const value = useMemo(() => ({ ...favs, isFavorite, toggleFavorite }), [favs, isFavorite, toggleFavorite]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};

export function useFavorites(): FavoritesState {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
