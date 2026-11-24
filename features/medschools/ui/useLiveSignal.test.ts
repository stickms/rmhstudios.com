// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  LIVE_SIGNAL_DEBOUNCE_MS,
  LIVE_SIGNAL_JITTER_MS,
  LIVE_STREAM_URL,
  acquireLiveSignal,
  livePollInterval,
  liveSignalConnected,
  resetLiveSignalForTests,
} from './useLiveSignal';

/** A minimal browser: a document with visibility, a window with page events, and a scripted EventSource. */
class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static all: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Set<() => void>>();
  constructor(public url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
  // Test drivers.
  open() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }
  emit(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  fail(closed: boolean) {
    this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.onerror?.();
  }
  static live() {
    return FakeEventSource.all.filter((e) => e.readyState !== FakeEventSource.CLOSED);
  }
}

const doc = new EventTarget() as EventTarget & { visibilityState: 'visible' | 'hidden' };
const win = new EventTarget();

function setVisibility(v: 'visible' | 'hidden') {
  doc.visibilityState = v;
  doc.dispatchEvent(new Event('visibilitychange'));
}

/** A query with an observer, as a mounted `useQuery` would have; `enabled: false` is the rail below 1280px. */
function observe(qc: QueryClient, key: unknown[], enabled = true) {
  const queryFn = vi.fn(async () => ({ ok: true }));
  const observer = new QueryObserver(qc, { queryKey: key, queryFn, enabled, staleTime: Infinity });
  const off = observer.subscribe(() => {});
  return { queryFn, off };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  FakeEventSource.all = [];
  doc.visibilityState = 'visible';
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  resetLiveSignalForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const WINDOW = LIVE_SIGNAL_DEBOUNCE_MS; // jitter is 0 under the mocked Math.random

describe('the shared medschools live signal', () => {
  it('opens ONE EventSource for several consumers and closes it after the last one leaves', () => {
    const qc = new QueryClient();
    const a = acquireLiveSignal(qc);
    const b = acquireLiveSignal(qc);
    const c = acquireLiveSignal(qc);
    expect(FakeEventSource.all).toHaveLength(1);
    expect(FakeEventSource.all[0]!.url).toBe(LIVE_STREAM_URL);
    a();
    b();
    expect(FakeEventSource.live()).toHaveLength(1);
    c();
    // A page change remounts the next consumer within the grace: no reconnect.
    const d = acquireLiveSignal(qc);
    vi.advanceTimersByTime(5_000);
    expect(FakeEventSource.all).toHaveLength(1);
    d();
    vi.advanceTimersByTime(5_000);
    expect(FakeEventSource.live()).toHaveLength(0);
  });

  it('opens nothing while the page is hidden, closes when it hides and reopens (and refreshes once) when shown', async () => {
    const qc = new QueryClient();
    const list = observe(qc, ['medschools', 'schools', {}]);
    doc.visibilityState = 'hidden';
    const release = acquireLiveSignal(qc);
    expect(FakeEventSource.all).toHaveLength(0);

    setVisibility('visible');
    expect(FakeEventSource.live()).toHaveLength(1);
    FakeEventSource.all[0]!.open();
    expect(liveSignalConnected()).toBe(true);
    await vi.advanceTimersByTimeAsync(WINDOW + LIVE_SIGNAL_JITTER_MS);
    expect(list.queryFn).toHaveBeenCalledTimes(1); // the observer's first fetch only: a first open invalidates nothing

    setVisibility('hidden');
    expect(FakeEventSource.live()).toHaveLength(0);
    expect(liveSignalConnected()).toBe(false);

    setVisibility('visible');
    expect(FakeEventSource.live()).toHaveLength(1);
    FakeEventSource.all[1]!.open();
    await vi.advanceTimersByTimeAsync(WINDOW);
    expect(list.queryFn).toHaveBeenCalledTimes(2); // signals may have been missed while hidden
    release();
    list.off();
  });

  it('invalidates the live head, the Today summary and the school list, debounced to one refetch per window', async () => {
    const qc = new QueryClient();
    const live = observe(qc, ['medschools', 'live', { limit: 15 }]);
    const summary = observe(qc, ['medschools', 'live-summary', {}]);
    const schools = observe(qc, ['medschools', 'schools', {}]);
    const school = observe(qc, ['medschools', 'school', 'harvard']);
    const mine = observe(qc, ['medschools', 'me', 'lists']);
    const release = acquireLiveSignal(qc);
    const es = FakeEventSource.all[0]!;
    es.open();
    await vi.advanceTimersByTimeAsync(0);
    for (const q of [live, summary, schools, school, mine]) expect(q.queryFn).toHaveBeenCalledTimes(1);

    // A burst of signals: one refetch, after the debounce, never before.
    es.emit('new');
    es.emit('new');
    await vi.advanceTimersByTimeAsync(WINDOW - 1);
    es.emit('new');
    expect(live.queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    for (const q of [live, summary, schools]) expect(q.queryFn).toHaveBeenCalledTimes(2);
    // Nothing else is touched: a school page's own figures, the member's private data.
    expect(school.queryFn).toHaveBeenCalledTimes(1);
    expect(mine.queryFn).toHaveBeenCalledTimes(1);

    // The next signal opens a new window.
    es.emit('new');
    await vi.advanceTimersByTimeAsync(WINDOW);
    expect(live.queryFn).toHaveBeenCalledTimes(3);
    release();
    for (const q of [live, summary, schools, school, mine]) q.off();
  });

  it('never fetches a disabled query (the rail and the Today column on a phone)', async () => {
    const qc = new QueryClient();
    const page = observe(qc, ['medschools', 'schools', {}]);
    const rail = observe(qc, ['medschools', 'live', { limit: 15 }], false);
    const today = observe(qc, ['medschools', 'live-summary', {}], false);
    const release = acquireLiveSignal(qc);
    const es = FakeEventSource.all[0]!;
    es.open();
    es.emit('new');
    await vi.advanceTimersByTimeAsync(WINDOW);
    es.emit('new');
    await vi.advanceTimersByTimeAsync(WINDOW);
    expect(page.queryFn).toHaveBeenCalledTimes(3);
    expect(rail.queryFn).not.toHaveBeenCalled();
    expect(today.queryFn).not.toHaveBeenCalled();
    release();
    page.off();
    rail.off();
    today.off();
  });

  it('lets the browser reconnect a dropped stream, and retries a refused one later while polling', async () => {
    const qc = new QueryClient();
    const list = observe(qc, ['medschools', 'schools', {}]);
    const release = acquireLiveSignal(qc);
    const es = FakeEventSource.all[0]!;
    es.open();
    expect(livePollInterval(liveSignalConnected())).toBe(5 * 60_000);

    // Dropped: still CONNECTING, the browser retries itself; when it reopens, one refresh.
    es.fail(false);
    expect(liveSignalConnected()).toBe(false);
    expect(livePollInterval(liveSignalConnected())).toBe(60_000);
    es.open();
    await vi.advanceTimersByTimeAsync(WINDOW);
    expect(list.queryFn).toHaveBeenCalledTimes(2);

    // Refused (429 / 503): CLOSED, so a new EventSource only after the back-off.
    es.fail(true);
    expect(FakeEventSource.live()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(FakeEventSource.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeEventSource.all).toHaveLength(2);
    release();
    list.off();
  });

  it('closes on pagehide (back/forward cache) and reopens on a persisted pageshow', () => {
    const qc = new QueryClient();
    const release = acquireLiveSignal(qc);
    win.dispatchEvent(new Event('pagehide'));
    expect(FakeEventSource.live()).toHaveLength(0);
    const show = Object.assign(new Event('pageshow'), { persisted: true });
    win.dispatchEvent(show);
    expect(FakeEventSource.live()).toHaveLength(1);
    release();
  });
});
