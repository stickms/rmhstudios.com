/**
 * lib/route/intent-fetch — the head start a page's own GETs get as an open begins.
 *
 * The responses it holds are per-viewer (a post's liked state and visibility, a
 * profile's posts as this viewer may see them), so what matters is that one is
 * never served twice or after its window: a second consumer, a later remount,
 * or an answer older than the window must always go to the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  peekIntentFetch,
  startIntentFetch,
  takeIntentFetch,
  takeOrFetch,
} from '@/lib/route/intent-fetch';

/** A fetch that answers on the next microtask and records each URL it was asked for. */
function stubFetch() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url);
    return Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ url, n: calls.length }),
    });
  });
  return calls;
}

/** A fetch that never answers, for the in-flight cases. */
function stubHungFetch() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url);
    return new Promise(() => {});
  });
  return calls;
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('intent-fetch', () => {
  it('is a no-op on the server', () => {
    vi.stubGlobal('window', undefined);
    const calls = stubFetch();
    startIntentFetch('/api/a');
    expect(calls).toEqual([]);
    expect(takeIntentFetch('/api/a')).toBeNull();
  });

  it('starts one request per URL and hands it out exactly once', async () => {
    const calls = stubFetch();
    startIntentFetch('/api/once');
    startIntentFetch('/api/once');
    expect(calls).toEqual(['/api/once']);

    const first = takeIntentFetch('/api/once');
    expect(first).not.toBeNull();
    await expect(first).resolves.toEqual({ status: 200, data: { url: '/api/once', n: 1 } });

    // Taken: the next consumer (a remount, a back navigation) fetches fresh.
    expect(takeIntentFetch('/api/once')).toBeNull();
    await takeOrFetch('/api/once');
    expect(calls).toEqual(['/api/once', '/api/once']);
  });

  it('exposes an answered response for first-render state without consuming it', async () => {
    stubFetch();
    startIntentFetch('/api/peek');
    expect(peekIntentFetch('/api/peek')).toBeUndefined();
    await flush();
    expect(peekIntentFetch('/api/peek')?.status).toBe(200);
    expect(takeIntentFetch('/api/peek')).not.toBeNull();
    expect(peekIntentFetch('/api/peek')).toBeUndefined();
  });

  it('serves an answer only briefly — not across a long-press reaction and then an open', async () => {
    vi.useFakeTimers();
    const calls = stubFetch();
    startIntentFetch('/api/answered');
    await flush();
    vi.advanceTimersByTime(1_500);
    expect(peekIntentFetch('/api/answered')).toBeUndefined();
    expect(takeIntentFetch('/api/answered')).toBeNull();
    // And a new start really goes to the network again.
    startIntentFetch('/api/answered');
    expect(calls).toEqual(['/api/answered', '/api/answered']);
  });

  it('keeps an unanswered request usable on a slow network, but not forever', () => {
    vi.useFakeTimers();
    const calls = stubHungFetch();
    startIntentFetch('/api/slow');
    vi.advanceTimersByTime(5_000);
    startIntentFetch('/api/slow');
    expect(calls).toEqual(['/api/slow']);
    expect(takeIntentFetch('/api/slow')).not.toBeNull();

    startIntentFetch('/api/hung');
    vi.advanceTimersByTime(16_000);
    expect(takeIntentFetch('/api/hung')).toBeNull();
  });

  it('does not let a failed head start surface as an unhandled rejection', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    startIntentFetch('/api/fails');
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    // A failed answer is not "answered": the page takes it and handles the
    // failure exactly as it handles its own fetch.
    await expect(takeIntentFetch('/api/fails')).rejects.toThrow('offline');
  });
});
