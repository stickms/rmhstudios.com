/**
 * The live half of `/sohumtracker`: a pushed stream, and a clock to age it with.
 *
 * Two separate mechanisms, and keeping them separate is the whole point:
 *
 *   - `useWatchState` holds an **EventSource** open to `/api/sohumtracker/stream`
 *     and splices each pushed tick into the state the page was server-rendered
 *     with. No polling: the server tells it when something changed.
 *   - `useTicker` re-renders once a second so a counter can climb BETWEEN those
 *     pushes, by adding the elapsed time to the figure the server measured.
 *
 * Asking the server every second instead would be sixty requests a minute to
 * display a number arithmetic gets right for free, and a counter that only moves
 * when the server speaks looks broken. So the server sends `generatedAt`, the
 * client ages from it, and each tick re-bases the arithmetic.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchStateDTO, WatchTickDTO } from '@/lib/sohumtracker/types';

const STREAM_URL = '/api/sohumtracker/stream';

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
export function agedSeconds(measuredSec: number, generatedAt: string, now: number | null): number {
  if (now === null) return measuredSec;
  const elapsed = (now - Date.parse(generatedAt)) / 1000;
  // A clock skewed backwards (the viewer's, not ours) must never wind a counter
  // down — a number that goes backwards reads as a bug, not as a slow clock.
  return measuredSec + Math.max(0, elapsed);
}

/** Connection state, so the header can say what is going on without lying. */
export type StreamStatus = 'connecting' | 'live' | 'offline';

export interface WatchStateHook {
  state: WatchStateDTO;
  status: StreamStatus;
  /** True while a manual refresh is in flight. */
  refreshing: boolean;
  /** Full refetch — the refresh button, and what recovers older days. */
  refresh: () => void;
}

/** Splice a pushed tick into the last full state. */
function applyTick(state: WatchStateDTO, tick: WatchTickDTO): WatchStateDTO {
  const days = tick.today
    ? (() => {
        const index = state.days.findIndex((day) => day.dateKey === tick.today!.dateKey);
        if (index === -1) return [...state.days, tick.today!];
        const next = state.days.slice();
        // The tick carries the measured figures but not the day's written
        // summary, which only the full state fetch knows about — keep whichever
        // one we already had rather than blanking it on every push.
        next[index] = { ...tick.today!, summary: tick.today!.summary ?? next[index].summary };
        return next;
      })()
    : state.days;

  return {
    ...state,
    generatedAt: tick.generatedAt,
    todayKey: tick.todayKey,
    live: tick.live,
    totals: tick.totals,
    weeks: tick.weeks,
    months: tick.months,
    days,
    // A tick proves the tracker has written something, so a page that opened
    // empty stops claiming so.
    empty: state.empty && days.every((day) => day.voiceSec === 0 && day.messages === 0),
  };
}

/**
 * Keep the dossier live.
 *
 * Seeded from the route loader's data, so the first paint is server-rendered and
 * the stream only ever updates it.
 *
 * The connection is closed on unmount AND on `pagehide`. The unmount path covers
 * navigation inside the app; `pagehide` covers the tab being closed, the browser
 * being quit, and — the one that actually leaks — a page entering the back/
 * forward cache, where React never unmounts and the socket would otherwise sit
 * open against the server's shared watcher indefinitely. Coming back out of
 * bfcache (`pageshow`) reconnects.
 */
export function useWatchState(initial: WatchStateDTO, days: number): WatchStateHook {
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [refreshing, setRefreshing] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetch(`/api/sohumtracker/activity?days=${days}`, { headers: { accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<WatchStateDTO>;
      })
      .then(setState)
      .catch(() => {
        // The last good dossier is still on screen and still broadly true, so a
        // failed manual refresh needs no error state — the stream will correct
        // it on the next push.
      })
      .finally(() => setRefreshing(false));
  }, [days]);

  useEffect(() => {
    let closed = false;

    const disconnect = () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };

    const connect = () => {
      if (closed || sourceRef.current) return;
      const source = new EventSource(STREAM_URL);
      sourceRef.current = source;

      source.addEventListener('tick', (event) => {
        try {
          const tick = JSON.parse((event as MessageEvent<string>).data) as WatchTickDTO;
          setState((current) => applyTick(current, tick));
          setStatus('live');
        } catch {
          // A malformed frame is not worth tearing the connection down for.
        }
      });
      source.onopen = () => setStatus('live');
      source.onerror = () => {
        // EventSource reconnects on its own with its own backoff; saying
        // "offline" is honest for the gap without racing it to reconnect.
        setStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
      };
    };

    const onPageHide = () => disconnect();
    const onPageShow = () => connect();

    connect();
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      closed = true;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      disconnect();
    };
  }, []);

  return { state, status, refreshing, refresh };
}
