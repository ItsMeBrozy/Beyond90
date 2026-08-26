import { useEffect, useState } from 'react';
import { invalidateTeamBadges } from '../hooks/useTeamBadges';

/**
 * Re-renders the component on an interval so derived values like live match
 * minutes stay current. Returns the current timestamp.
 */
export function useLiveNow(ms = 12000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Calls `fn` every `ms` while enabled — used to poll the API for new matches. */
export function usePolling(fn: () => void, ms = 30000, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, ms, enabled]);
}

// Shared SSE connection: the server pings this stream whenever any bot command
// (or website edit) changes data. One EventSource per browser tab, fanned out
// to every mounted page via a subscriber list.
type Listener = () => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

function ensureSource(): void {
  if (source || typeof window === 'undefined') return;
  source = new EventSource('/api/events');
  source.onmessage = () => {
    invalidateTeamBadges();
    // coalesce bursts of events into a single refresh
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => listeners.forEach(fn => fn()), 250);
  };
  source.onerror = () => {
    // EventSource reconnects on its own; drop the handle so we re-open cleanly
    source = null;
  };
}

/**
 * Calls `fn` as soon as anything changes server-side (bot commands, edits…).
 * Keeps one shared SSE connection open; falls back silently if it fails.
 */
export function useLiveReload(fn: () => void): void {
  useEffect(() => {
    listeners.add(fn);
    ensureSource();
    return () => {
      listeners.delete(fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);
}

// Shared one-second ticker so kick-offs flip to LIVE on their own: components
// showing an upcoming match subscribe, and the moment kick-off passes the
// re-render (plus fresh viewOf) turns the card live — no refetch needed.
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function ensureTicker(): void {
  if (tickTimer) return;
  tickTimer = setInterval(() => tickListeners.forEach(fn => fn()), 1000);
}

function maybeStopTicker(): void {
  if (tickListeners.size === 0 && tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

/** Re-renders once per second while `enabled` — for automatic kick-off flips. */
export function useKickoffTick(enabled = true): void {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const fn = () => force(v => v + 1);
    ensureTicker();
    tickListeners.add(fn);
    return () => {
      tickListeners.delete(fn);
      maybeStopTicker();
    };
  }, [enabled]);
}
