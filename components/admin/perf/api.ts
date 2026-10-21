import { useCallback, useEffect, useRef, useState } from 'react';
import type { PerfOverview } from '@/lib/perf/admin-types';

/** How often the overview refreshes while auto-refresh is on. */
export const REFRESH_MS = 10_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/**
 * The page's data: one payload, refetched every 10 s while `auto` is on and the
 * tab is visible. A hidden tab neither polls nor queues work; becoming visible
 * again refetches immediately so the numbers are never a minute stale on return.
 */
export function usePerfOverview(auto: boolean) {
  const [data, setData] = useState<PerfOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    // Never overlap: a slow response must not stack requests behind itself.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await getJson<PerfOverview>('/api/admin/perf'));
      setUpdatedAt(Date.now());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!auto) return;
    const tick = () => {
      if (!document.hidden) void reload();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [auto, reload]);

  return { data, loading, failed, updatedAt, reload };
}

/**
 * Fetch `url` once when the component mounts (a tab opening), outside the
 * auto-refresh loop. `reload` refetches on demand.
 */
export function useLazyJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getJson<T>(url));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, failed, reload };
}
