import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectionClass,
  measuredRttMs,
  prefersLessData,
  shouldSpeculate,
} from '@/lib/network-quality';

/**
 * The client's single network/data policy. It gates every speculative fetch
 * (viewport prefetch, intent media warming, the globe's lock preload) and the
 * "auto" Data Saver, so its contract is pinned here: the visitor's own setting
 * wins, Chromium's hints come next, and browsers without the API fall back to
 * the round trip this page actually measured instead of reading as "fast".
 */

type Conn = { saveData?: boolean; effectiveType?: string; rtt?: number };

function stub({
  connection,
  onLine,
  setting,
  reducedData = false,
  handshake,
}: {
  connection?: Conn;
  onLine?: boolean;
  setting?: string | null;
  reducedData?: boolean;
  handshake?: number;
}) {
  vi.stubGlobal('navigator', { ...(connection ? { connection } : {}), ...(onLine === undefined ? {} : { onLine }) });
  vi.stubGlobal('localStorage', { getItem: () => setting ?? null });
  vi.stubGlobal('matchMedia', () => ({ matches: reducedData }));
  vi.stubGlobal('performance', {
    getEntriesByType: () =>
      handshake === undefined ? [] : [{ connectStart: 100, connectEnd: 100 + handshake }],
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('connectionClass', () => {
  it('reads offline first', () => {
    stub({ onLine: false, connection: { effectiveType: '4g' } });
    expect(connectionClass()).toBe('offline');
  });

  it('maps effectiveType buckets', () => {
    stub({ connection: { effectiveType: '2g' } });
    expect(connectionClass()).toBe('slow');
    stub({ connection: { effectiveType: 'slow-2g' } });
    expect(connectionClass()).toBe('slow');
    stub({ connection: { effectiveType: '3g' } });
    expect(connectionClass()).toBe('moderate');
    stub({ connection: { effectiveType: '4g' } });
    expect(connectionClass()).toBe('fast');
  });

  it('lets a live rtt overrule a saturated "4g"', () => {
    stub({ connection: { effectiveType: '4g', rtt: 600 } });
    expect(connectionClass()).toBe('moderate');
    stub({ connection: { effectiveType: '4g', rtt: 50 } });
    expect(connectionClass()).toBe('fast');
  });

  it('falls back to the measured handshake when the API is absent (Safari, Firefox)', () => {
    stub({ handshake: 1600 });
    expect(connectionClass()).toBe('slow');
    stub({ handshake: 400 });
    expect(connectionClass()).toBe('moderate');
    stub({ handshake: 40 });
    expect(connectionClass()).toBe('fast');
  });

  it('reads a reused connection (0ms handshake) as unknown, not as instant', () => {
    stub({ handshake: 0 });
    expect(measuredRttMs()).toBeUndefined();
    expect(connectionClass()).toBe('unknown');
  });
});

describe('prefersLessData', () => {
  it("honours the site's own Data Saver setting over the browser", () => {
    stub({ setting: 'on', connection: { effectiveType: '4g' } });
    expect(prefersLessData()).toBe(true);
    stub({ setting: 'off', connection: { saveData: true } });
    expect(prefersLessData()).toBe(false);
  });

  it('defers to Save-Data and prefers-reduced-data under auto', () => {
    stub({ setting: 'auto', connection: { saveData: true } });
    expect(prefersLessData()).toBe(true);
    stub({ setting: null, reducedData: true });
    expect(prefersLessData()).toBe(true);
    stub({ setting: null });
    expect(prefersLessData()).toBe(false);
  });

  it('survives a storage that throws (private mode)', () => {
    stub({});
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(prefersLessData()).toBe(false);
  });
});

describe('shouldSpeculate', () => {
  it('speculates on fast and on no signal', () => {
    stub({ connection: { effectiveType: '4g' } });
    expect(shouldSpeculate()).toBe(true);
    stub({});
    expect(shouldSpeculate()).toBe(true);
  });

  it('never speculates when less data is wanted or the link is slower than fast', () => {
    stub({ setting: 'on' });
    expect(shouldSpeculate()).toBe(false);
    stub({ connection: { effectiveType: '3g' } });
    expect(shouldSpeculate()).toBe(false);
    stub({ handshake: 900 });
    expect(shouldSpeculate()).toBe(false);
    stub({ onLine: false });
    expect(shouldSpeculate()).toBe(false);
  });
});
