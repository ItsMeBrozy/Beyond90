import { useCallback, useEffect, useRef, useState } from 'react';

/** Generic async loader: useAsync(() => api.getMatch(id), [id]). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], initialData?: T) {
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => fnRef.current())
      .then((res) => {
        if (alive) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const cleanup = run();
    return cleanup;
  }, [run]);

  return { data, loading, error, reload: run };
}

/**
 * Ticks every `ms` while enabled. Used to give live matches a subtle sense of
 * a running clock (minute counter advances during the session).
 */
export function useLiveTick(enabled: boolean, ms = 12000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setTick((v) => v + 1), ms);
    return () => clearInterval(t);
  }, [enabled, ms]);
  return tick;
}
