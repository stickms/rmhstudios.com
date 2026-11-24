import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveSignal } from '../live-signal.server';
import { LIVE_STREAM_HEARTBEAT_MS, createLiveStream as create, type LiveStreamDeps } from './live-stream.server';

const HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
};
/** The module with the route's headers bound, as the route file calls it. */
function createLiveStream(deps: LiveStreamDeps) {
  const live = create(deps);
  return { ...live, handle: (r: Request) => live.handle(r, HEADERS) };
}

/** A fake bus: subscribe/unsubscribe are counted, `emit` delivers to every listener. */
function fakeBus() {
  const listeners = new Set<(s: LiveSignal) => void>();
  return {
    listeners,
    subscribe: vi.fn((fn: (s: LiveSignal) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    emit: () => {
      for (const fn of listeners) fn({ at: new Date().toISOString() });
    },
  };
}

function req(ip = '203.0.113.7') {
  const ctrl = new AbortController();
  const request = new Request('http://localhost/api/medschools/live/stream', {
    headers: { 'cf-connecting-ip': ip },
    signal: ctrl.signal,
  });
  return { request, abort: () => ctrl.abort() };
}

const decoder = new TextDecoder();
async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value } = await reader.read();
  return value ? decoder.decode(value) : '';
}

const ipOf = (r: Request) => r.headers.get('cf-connecting-ip') ?? 'none';

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/medschools/live/stream', () => {
  it('answers an anonymous, uncacheable event stream with the retry hint first', async () => {
    const bus = fakeBus();
    const live = createLiveStream({ subscribe: bus.subscribe, clientIp: ipOf });
    const { request, abort } = req();
    const res = live.handle(request);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(res.headers.get('cache-control')).toBe('no-store, no-transform');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    const reader = res.body!.getReader();
    expect(await readChunk(reader)).toBe('retry: 15000\n: connected\n\n');
    abort();
  });

  it('sends `event: new` with no data on each bus signal, and a heartbeat comment', async () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const live = createLiveStream({ subscribe: bus.subscribe, clientIp: ipOf });
    const { request, abort } = req();
    const reader = live.handle(request).body!.getReader();
    await readChunk(reader);
    bus.emit();
    expect(await readChunk(reader)).toBe('event: new\ndata: {}\n\n');
    vi.advanceTimersByTime(LIVE_STREAM_HEARTBEAT_MS);
    expect(await readChunk(reader)).toBe(': ping\n\n');
    abort();
  });

  it('unsubscribes, clears its timers and frees its slot on abort and on cancel', async () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const live = createLiveStream({ subscribe: bus.subscribe, clientIp: ipOf });
    const a = req('198.51.100.1');
    const ra = live.handle(a.request);
    const b = req('198.51.100.1');
    const rb = live.handle(b.request);
    expect(bus.listeners.size).toBe(2);
    expect(live.stats().open).toBe(2);
    expect(live.stats().perIp.get('198.51.100.1')).toBe(2);

    a.abort();
    expect(bus.listeners.size).toBe(1);
    await rb.body!.cancel();
    expect(bus.listeners.size).toBe(0);
    expect(live.stats().open).toBe(0);
    expect(live.stats().perIp.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    void ra;
  });

  it('closes itself at the end of its lifetime, so the browser reconnects', async () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const live = createLiveStream({ subscribe: bus.subscribe, clientIp: ipOf, lifetimeMs: () => 1000 });
    const reader = live.handle(req().request).body!.getReader();
    await readChunk(reader);
    vi.advanceTimersByTime(1000);
    expect((await reader.read()).done).toBe(true);
    expect(bus.listeners.size).toBe(0);
    expect(live.stats().open).toBe(0);
  });

  it('answers 429 past the per-address cap and 503 past the process cap, without subscribing', () => {
    const bus = fakeBus();
    const live = createLiveStream({ subscribe: bus.subscribe, clientIp: ipOf, maxPerIp: 2, maxConnections: 3 });
    const held = [req('192.0.2.1'), req('192.0.2.1'), req('192.0.2.2')];
    for (const r of held.slice(0, 2)) live.handle(r.request);
    const third = live.handle(req('192.0.2.1').request);
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBe('60');

    expect(live.handle(held[2]!.request).status).toBe(200);
    const full = live.handle(req('192.0.2.3').request);
    expect(full.status).toBe(503);
    expect(full.headers.get('retry-after')).toBe('120');
    expect(bus.subscribe).toHaveBeenCalledTimes(3);

    // A freed slot is usable again.
    held[0]!.abort();
    expect(live.handle(req('192.0.2.1').request).status).toBe(200);
  });
});
