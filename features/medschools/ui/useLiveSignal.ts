import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/**
 * The live signal on the client (owner 2026-11-24): ONE `EventSource` on `/api/medschools/live/stream` per tab, shared
 * by every `/med` component that wants fresh public data (the index's list, the live page's feed, the rail's feed, the
 * Today column). It is open only while at least one of them is mounted and enabled AND the document is visible; it
 * closes when the tab is hidden or the page is put in the back/forward cache, and reopens when it is shown again.
 *
 * The stream carries no data. On `event: new` the hook invalidates the public queries the pages draw: the live feed's
 * head (`['medschools', 'live', …]`), the Today summary (`['medschools', 'live-summary', …]`) and the school list
 * (`['medschools', 'schools', …]`, whose `latest` is the index's newest status). React Query refetches only ACTIVE
 * queries on an invalidation, and a query whose observers are all `enabled: false` is not active: the rail and the
 * Today column are mounted or enabled only from 1280px, so on a phone only the page's own list refetches. Every
 * invalidation is debounced and jittered (`LIVE_SIGNAL_DEBOUNCE_MS` plus up to `LIVE_SIGNAL_JITTER_MS`), so a burst of
 * signals is one refetch per tab and the tabs of every reader do not all ask at the same instant.
 *
 * A reopen after the stream was down (hidden, a dropped connection, the server's lifetime close) invalidates once, as
 * signals may have been missed meanwhile. A refused stream (429 / 503: the server's caps) is retried after a minute or
 * more, and the pages keep their 60 s polling until then; while the stream is connected they poll every 5 minutes
 * (`useLivePollInterval`), a safety net for a signal lost in transit, not the way news arrives.
 *
 * Never on the server: the hook opens nothing until an effect runs, and `useSyncExternalStore` reads "not connected"
 * there.
 */

export const LIVE_STREAM_URL = '/api/medschools/live/stream';

/** The public query families a signal refreshes (prefixes; React Query matches the rest of the key). */
export const LIVE_SIGNAL_QUERY_KEYS: readonly (readonly string[])[] = [
  ['medschools', 'live'],
  ['medschools', 'live-summary'],
  ['medschools', 'schools'],
];

export const LIVE_SIGNAL_DEBOUNCE_MS = 2_000;
export const LIVE_SIGNAL_JITTER_MS = 3_000;
/** Polling while the stream is connected, and without it (the pages' old 60 s). */
export const LIVE_POLL_CONNECTED_MS = 5 * 60_000;
export const LIVE_POLL_FALLBACK_MS = 60_000;
/** A page change unmounts one consumer before the next mounts: keep the stream that long rather than reconnect. */
const RELEASE_GRACE_MS = 2_000;
const REFUSED_RETRY_MS = 60_000;
const REFUSED_RETRY_MAX_MS = 10 * 60_000;

interface SignalState {
  consumers: Map<QueryClient, number>;
  es: EventSource | null;
  connected: boolean;
  /** Whether any stream has opened in this tab: a later open may have missed signals. */
  everOpened: boolean;
  failures: number;
  invalidateTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  listening: boolean;
  subscribers: Set<() => void>;
}

const GLOBAL_KEY = '__medschools_live_signal__';

function state(): SignalState {
  const g = globalThis as unknown as Record<string, SignalState | undefined>;
  g[GLOBAL_KEY] ??= {
    consumers: new Map(),
    es: null,
    connected: false,
    everOpened: false,
    failures: 0,
    invalidateTimer: null,
    retryTimer: null,
    releaseTimer: null,
    listening: false,
    subscribers: new Set(),
  };
  return g[GLOBAL_KEY];
}

function setConnected(on: boolean) {
  const s = state();
  if (s.connected === on) return;
  s.connected = on;
  for (const fn of s.subscribers) fn();
}

function wanted(): boolean {
  const s = state();
  return s.consumers.size > 0 && typeof document !== 'undefined' && document.visibilityState === 'visible';
}

function scheduleInvalidate() {
  const s = state();
  if (s.invalidateTimer) return; // one refetch per window, whatever arrives inside it
  s.invalidateTimer = setTimeout(
    () => {
      const st = state();
      st.invalidateTimer = null;
      for (const qc of st.consumers.keys())
        for (const queryKey of LIVE_SIGNAL_QUERY_KEYS) void qc.invalidateQueries({ queryKey: [...queryKey] });
    },
    LIVE_SIGNAL_DEBOUNCE_MS + Math.floor(Math.random() * LIVE_SIGNAL_JITTER_MS),
  );
}

function open() {
  const s = state();
  if (s.es || s.retryTimer || typeof EventSource === 'undefined') return;
  const es = new EventSource(LIVE_STREAM_URL);
  s.es = es;
  es.onopen = () => {
    const st = state();
    if (st.es !== es) return;
    st.failures = 0;
    setConnected(true);
    if (st.everOpened) scheduleInvalidate();
    st.everOpened = true;
  };
  es.addEventListener('new', () => {
    if (state().es === es) scheduleInvalidate();
  });
  es.onerror = () => {
    const st = state();
    if (st.es !== es) return;
    setConnected(false);
    // CONNECTING: the browser reconnects by itself after the server's `retry`. CLOSED: it gave up (a 429 / 503 from
    // the caps, or another non-stream answer), so retry later ourselves; the pages poll meanwhile.
    if (es.readyState !== EventSource.CLOSED) return;
    es.close();
    st.es = null;
    const delay = Math.min(REFUSED_RETRY_MS * 2 ** st.failures, REFUSED_RETRY_MAX_MS);
    st.failures++;
    st.retryTimer = setTimeout(
      () => {
        state().retryTimer = null;
        sync();
      },
      delay + Math.floor(Math.random() * delay * 0.5),
    );
  };
}

function close() {
  const s = state();
  if (s.es) {
    s.es.close();
    s.es = null;
  }
  setConnected(false);
}

function sync() {
  if (wanted()) open();
  else close();
}

function onVisibility() {
  sync();
}
function onPageHide() {
  close();
}
function onPageShow(e: PageTransitionEvent) {
  if (e.persisted) sync();
}

function listen(on: boolean) {
  const s = state();
  if (s.listening === on || typeof window === 'undefined') return;
  s.listening = on;
  const method = on ? 'addEventListener' : 'removeEventListener';
  document[method]('visibilitychange', onVisibility);
  window[method]('pagehide', onPageHide as EventListener);
  window[method]('pageshow', onPageShow as EventListener);
}

/** Register one consumer of the shared stream (what the hook's effect does); returns its release. */
export function acquireLiveSignal(qc: QueryClient): () => void {
  const s = state();
  s.consumers.set(qc, (s.consumers.get(qc) ?? 0) + 1);
  if (s.releaseTimer) {
    clearTimeout(s.releaseTimer);
    s.releaseTimer = null;
  }
  listen(true);
  sync();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const st = state();
    const n = (st.consumers.get(qc) ?? 1) - 1;
    if (n > 0) st.consumers.set(qc, n);
    else st.consumers.delete(qc);
    if (st.consumers.size > 0 || st.releaseTimer) return;
    st.releaseTimer = setTimeout(() => {
      const cur = state();
      cur.releaseTimer = null;
      if (cur.consumers.size > 0) return;
      close();
      listen(false);
      if (cur.invalidateTimer) clearTimeout(cur.invalidateTimer);
      cur.invalidateTimer = null;
      if (cur.retryTimer) clearTimeout(cur.retryTimer);
      cur.retryTimer = null;
      cur.failures = 0;
    }, RELEASE_GRACE_MS);
  };
}

function subscribeConnected(fn: () => void) {
  const s = state();
  s.subscribers.add(fn);
  return () => {
    s.subscribers.delete(fn);
  };
}

/**
 * Keep the shared live stream open while this component is mounted and `enabled`; returns whether it is connected.
 * Pass `enabled: false` where the component's own queries are disabled (the rail and Today column below 1280px).
 */
export function useLiveSignal(enabled = true): boolean {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return acquireLiveSignal(qc);
  }, [enabled, qc]);
  return useSyncExternalStore(subscribeConnected, liveSignalConnected, () => false);
}

/** The `refetchInterval` of a live query: long while the stream is connected, the old 60 s without it. */
export function livePollInterval(connected: boolean): number {
  return connected ? LIVE_POLL_CONNECTED_MS : LIVE_POLL_FALLBACK_MS;
}

/** Whether the shared stream is connected now (the hook's snapshot). */
export function liveSignalConnected(): boolean {
  return state().connected;
}

/** Test seam: forget every connection, timer and consumer. */
export function resetLiveSignalForTests() {
  const s = state();
  if (s.es) s.es.close();
  for (const t of [s.invalidateTimer, s.retryTimer, s.releaseTimer]) if (t) clearTimeout(t);
  listen(false);
  delete (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY];
}
