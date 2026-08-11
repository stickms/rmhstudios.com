/**
 * The live half of `/sohumbum2`: polling the API and ageing what it returned.
 *
 * Two separate clocks, and keeping them separate is the whole point:
 *
 *   - `useWatchState` refetches the dossier every `LIVE_POLL_MS`. That is the
 *     only network traffic the page makes after its first paint.
 *   - `useTicker` re-renders once a second so a counter can climb BETWEEN those
 *     fetches, by adding the elapsed time to the figure the server measured.
 *
 * Polling once a second instead would be ten times the requests to display the
 * same number, and a counter that only moves every ten seconds looks broken. So
 * the server sends `generatedAt`, the client ages from it, and a poll simply
 * re-bases the arithmetic.
 */

import { useEffect, useRef, useState } from 'react';
import { LIVE_POLL_MS } from '@/lib/sohumbum2/config';
import type { WatchStateDTO } from '@/lib/sohumbum2/types';

/**
 * Re-render on an interval, returning `Date.now()`.
 *
 * Starts null and fills in after mount, which is deliberate: a component that
 * renders `Date.now()` during SSR produces different markup on the server and
 * the client and hydrates with a mismatch. Callers render a placeholder until
 * this is non-null.
 */
export function useTicker(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Seconds to show for a figure the server measured at `generatedAt`.
 *
 * Returns the server's number verbatim until the ticker has started, so the
 * first paint matches the server's HTML exactly.
 */
export function agedSeconds(
  measuredSec: number,
  generatedAt: string,
  now: number | null,
): number {
  if (now === null) return measuredSec;
  const elapsed = (now - Date.parse(generatedAt)) / 1000;
  // A clock skewed backwards (the viewer's, not ours) must never wind a counter
  // down — a number that goes backwards reads as a bug, not as a slow clock.
  return measuredSec + Math.max(0, elapsed);
}

export interface WatchStateHook {
  state: WatchStateDTO;
  /** True while a refetch is in flight; the page keeps showing the last state. */
  refreshing: boolean;
  /** Set when polling has failed since the last success. */
  stale: boolean;
}

/**
 * Keep the dossier fresh.
 *
 * Seeded from the route loader's data, so the first paint is server-rendered
 * and this only ever replaces it. Polling pauses while the tab is hidden — a
 * page left open in a background tab overnight should not spend the night
 * asking — and fires once immediately on the way back.
 *
 * A failed poll is NOT surfaced as an error state: the last good dossier is
 * still on screen and still broadly true. It sets `stale` so the header can say
 * so, and the next tick retries.
 */
export function useWatchState(initial: WatchStateDTO, days: number): WatchStateHook {
  const [state, setState] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  // Held in a ref so the polling effect does not re-subscribe on every render.
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setRefreshing(true);
      try {
        const response = await fetch(`/api/sohumbum2/activity?days=${days}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = (await response.json()) as WatchStateDTO;
        if (cancelled) return;
        setState(next);
        setStale(false);
      } catch {
        // An abort is this component tidying up, not a failure — but telling
        // them apart needs the controller, and the retry is identical either
        // way, so both simply leave the last good state on screen.
        if (!cancelled && !controller.signal.aborted) setStale(true);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };

    const id = window.setInterval(load, LIVE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      inFlight.current?.abort();
    };
  }, [days]);

  return { state, refreshing, stale };
}
