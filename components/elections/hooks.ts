import { useEffect, useRef, useState } from 'react';
import type { ElectionEvent } from '@/lib/elections/events';
import { useQuery } from '@tanstack/react-query';
import type { ElectionsApiResponse } from '@/lib/elections/api-types';

/** Poll fast while results are coming in, slowly otherwise. */
export const LIVE_POLL_MS = 20_000;
export const IDLE_POLL_MS = 5 * 60_000;

export function useElectionData(cycle: string) {
  return useQuery<ElectionsApiResponse>({
    queryKey: ['elections', cycle],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/elections?cycle=${encodeURIComponent(cycle)}`, { signal });
      if (!res.ok) throw new Error(`elections ${res.status}`);
      return res.json();
    },
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return LIVE_POLL_MS;
      return d.snapshot.live || d.phase === 'election-day' ? LIVE_POLL_MS : IDLE_POLL_MS;
    },
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/**
 * A ticking clock that is `null` until mounted (so SSR and first client render
 * agree), corrected by the server's clock when one is supplied.
 */
export function useNow(intervalMs = 1000, serverTime?: string): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  const skew = useRef(0);
  useEffect(() => {
    if (serverTime) skew.current = new Date(serverTime).getTime() - Date.now();
  }, [serverTime]);
  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + skew.current));
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Marks an element `data-in` once it scrolls into view (once). Without JS it is simply visible. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.in = 'true';
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.in = 'true';
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export const fmtInt = (n: number) => new Intl.NumberFormat('en-US').format(n);

export function timeAgo(iso: string | null | undefined, now: Date | null): string {
  if (!iso || !now) return '';
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * The day's live events (calls, flips, lead changes, polls closing, headlines) over SSE.
 * Newest last, de-duplicated by id, capped at 150. EventSource reconnects by itself;
 * `status` lets a UI say so.
 */
export function useElectionEvents(cycle: string): { events: ElectionEvent[]; status: 'connecting' | 'live' | 'offline' } {
  const [events, setEvents] = useState<ElectionEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      setStatus('offline');
      return;
    }
    setEvents([]);
    setStatus('connecting');
    const es = new EventSource(`/api/elections/events/stream?cycle=${encodeURIComponent(cycle)}`);
    es.onopen = () => setStatus('live');
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
    const merge = (incoming: ElectionEvent[]) =>
      setEvents((cur) => {
        const ids = new Set(cur.map((e) => e.id));
        const next = [...cur, ...incoming.filter((e) => !ids.has(e.id))].sort((a, b) => a.at - b.at);
        return next.length > 150 ? next.slice(next.length - 150) : next;
      });
    es.addEventListener('history', (e) => {
      try {
        merge(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore a malformed frame */
      }
    });
    es.addEventListener('event', (e) => {
      try {
        merge([JSON.parse((e as MessageEvent).data)]);
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, [cycle]);
  return { events, status };
}
