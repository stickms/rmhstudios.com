/**
 * Contract tests for the `/api/rum` beacon schema.
 *
 * This schema is the seam between a client that ships in a cached JS chunk and
 * a server that redeploys without it, and `defineHandler` rejects the WHOLE
 * request when validation fails. So a schema mistake here does not lose a
 * column, it loses every Web Vitals sample the site collects — silently, since
 * nothing on the client reads the response of a `sendBeacon`. These tests fix
 * both directions of that compatibility:
 *
 *   - a beacon from the OLD client (no attribution fields) still validates;
 *   - a beacon from the NEW client (OPT-35 attribution, OPT-31 bfcache) validates;
 *   - an oversized/hostile payload is rejected or truncated, never logged whole.
 */

import { describe, it, expect, vi } from 'vitest';

// `@/app/routes/api/rum` pulls in `defineHandler`, which imports Better Auth at
// module scope. The schema under test needs none of it.
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import {
  MetricSchema,
  normalizeSelector,
  normalizeScript,
  normalizeReasons,
  normalizeEffectiveType,
} from '@/app/routes/api/rum';

/** Exactly what `lib/rum.ts` sent before OPT-35 landed. */
const OLD_SHAPE = {
  name: 'INP',
  value: 312.5,
  rating: 'needs-improvement',
  id: 'v5-1754400000000-1234567890123',
  navigationType: 'navigate',
  path: '/feed',
  ts: '2026-08-05T12:00:00.000Z',
} as const;

describe('backwards compatibility (cached clients must keep working)', () => {
  it('accepts the pre-attribution payload unchanged', () => {
    const parsed = MetricSchema.safeParse(OLD_SHAPE);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toMatchObject(OLD_SHAPE);
  });

  it('accepts a bare minimum payload — name and value only', () => {
    expect(MetricSchema.safeParse({ name: 'TTFB', value: 0 }).success).toBe(true);
  });

  it('leaves every attribution field undefined when the client sends none', () => {
    const parsed = MetricSchema.parse(OLD_SHAPE);
    for (const key of [
      'inputDelay',
      'processingDuration',
      'presentationDelay',
      'target',
      'script',
      'element',
      'ttfb',
      'resourceLoadDelay',
      'resourceLoadDuration',
      'elementRenderDelay',
      'shifted',
      'reasons',
      'traceId',
    ] as const) {
      expect(parsed[key]).toBeUndefined();
    }
  });

  it('strips an unknown field instead of rejecting the beacon', () => {
    // The forward-compatible direction: a client NEWER than the server must not
    // have its whole sample thrown away over one unrecognised key.
    const parsed = MetricSchema.safeParse({ ...OLD_SHAPE, somethingNewer: 'x' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'somethingNewer' in parsed.data).toBe(false);
  });
});

describe('new shape — OPT-35 attribution', () => {
  it('accepts a fully attributed INP beacon', () => {
    const parsed = MetricSchema.safeParse({
      ...OLD_SHAPE,
      traceId: 'a'.repeat(32),
      inputDelay: 12,
      processingDuration: 240,
      presentationDelay: 60,
      target: 'html>body>div#root>article.post-card>button.like-btn',
      script: 'https://rmhstudios.com/assets/feed-a1b2c3d4.js',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.processingDuration).toBe(240);
    expect(parsed.success && parsed.data.traceId).toBe('a'.repeat(32));
  });

  it('accepts an attributed LCP beacon with the load-phase breakdown', () => {
    const parsed = MetricSchema.safeParse({
      name: 'LCP',
      value: 2100,
      rating: 'needs-improvement',
      path: '/',
      element: 'html>body>main>img.hero',
      ttfb: 420,
      resourceLoadDelay: 90,
      resourceLoadDuration: 800,
      elementRenderDelay: 790,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts an attributed CLS beacon', () => {
    const parsed = MetricSchema.safeParse({
      name: 'CLS',
      value: 0.042,
      rating: 'good',
      path: '/blog/post',
      shifted: 'html>body>main>div.sidebar',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a zero-valued phase (0 is data, not absence)', () => {
    const parsed = MetricSchema.safeParse({ ...OLD_SHAPE, inputDelay: 0 });
    expect(parsed.success && parsed.data.inputDelay).toBe(0);
  });
});

describe('new shape — OPT-31 bfcache', () => {
  it('accepts a restored sample', () => {
    const parsed = MetricSchema.safeParse({
      name: 'BFCACHE',
      value: 1,
      rating: 'good',
      id: 'restored',
      navigationType: 'back-forward',
      path: '/feed',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a not-restored sample carrying its reasons', () => {
    const parsed = MetricSchema.safeParse({
      name: 'BFCACHE',
      value: 0,
      rating: 'poor',
      id: 'not-restored',
      navigationType: 'back-forward',
      path: '/feed',
      reasons: 'response-cache-control-no-store,unload-handler',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.reasons).toContain('unload-handler');
  });

  it('rejects a metric name it does not know', () => {
    expect(MetricSchema.safeParse({ name: 'CUSTOM', value: 1 }).success).toBe(false);
  });
});

describe('hostile payloads', () => {
  it('rejects a selector far beyond any real DOM path', () => {
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, target: 'a'.repeat(5_000) }).success).toBe(false);
  });

  it('rejects an oversized script URL and reason list', () => {
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, script: 'x'.repeat(9_999) }).success).toBe(false);
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, reasons: 'y'.repeat(2_001) }).success).toBe(
      false,
    );
  });

  it('accepts a selector slightly longer than the client cap, then truncates it', () => {
    // A client one deploy out of step must not be rejected for 130 characters.
    const long = `#root ${'div>'.repeat(60)}button`;
    const parsed = MetricSchema.safeParse({ ...OLD_SHAPE, target: long });
    expect(parsed.success).toBe(true);
    expect(normalizeSelector(parsed.success ? parsed.data.target : undefined)!.length).toBe(120);
  });

  it('rejects out-of-range and non-finite numbers', () => {
    expect(MetricSchema.safeParse({ name: 'LCP', value: -1 }).success).toBe(false);
    expect(MetricSchema.safeParse({ name: 'LCP', value: 1e9 }).success).toBe(false);
    // `JSON.stringify(NaN)` is `null`, which is how a bad round-off arrives.
    expect(MetricSchema.safeParse({ name: 'LCP', value: null }).success).toBe(false);
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, inputDelay: -5 }).success).toBe(false);
  });

  it('rejects a forged trace id and a non-absolute path', () => {
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, traceId: 'not-a-trace' }).success).toBe(false);
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, path: 'feed' }).success).toBe(false);
  });
});

describe('cardinality normalization', () => {
  it('collapses positional indexes', () => {
    expect(normalizeSelector('article.post:nth-child(37)>button.like')).toBe(
      'article.post:nth-child(n)>button.like',
    );
  });

  it('collapses generated ids down to a stable stem', () => {
    expect(normalizeSelector('#post-clx8f9k2m0001>span')).toBe('#post-clx*>span');
    expect(normalizeSelector('#item-42')).toBe('#item-*');
    expect(normalizeSelector('.row2')).toBe('.row*');
  });

  it('leaves an already-stable selector alone', () => {
    expect(normalizeSelector('html>body>div#root>main>button.like-btn')).toBe(
      'html>body>div#root>main>button.like-btn',
    );
  });

  it('reduces a script URL to a hash-free, origin-free path', () => {
    expect(normalizeScript('https://rmhstudios.com/assets/feed-a1b2c3d4e5.js?v=2')).toBe(
      '/assets/feed-*.js',
    );
  });

  it('sorts and dedupes bfcache reasons and drops smuggled text', () => {
    expect(normalizeReasons('unload-handler,response-cache-control-no-store,unload-handler')).toBe(
      'response-cache-control-no-store,unload-handler',
    );
    expect(normalizeReasons('<script>alert(1)</script>')).toBe('scriptalert1script');
  });

  it('returns undefined for absent or empty input', () => {
    expect(normalizeSelector(undefined)).toBeUndefined();
    expect(normalizeScript(undefined)).toBeUndefined();
    expect(normalizeReasons('')).toBeUndefined();
    expect(normalizeReasons(', ,')).toBeUndefined();
  });
});

/**
 * The device dimension. These are compatibility tests first and feature tests
 * second: the failure they exist to prevent is not "the form factor is wrong",
 * it is "adding a field 400'd every beacon the site collects" — the same class
 * of mistake the attribution fields above are pinned against.
 */
describe('device context', () => {
  const DEVICE = {
    formFactor: 'mobile',
    vw: 360,
    dpr: 3,
    mem: 4,
    cores: 8,
    net: '4g',
    saveData: false,
  } as const;

  it('accepts a full device block', () => {
    const parsed = MetricSchema.safeParse({ ...OLD_SHAPE, ...DEVICE });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toMatchObject(DEVICE);
  });

  it('still accepts a beacon with no device block at all', () => {
    // The load-bearing case: every client cached from before this shipped.
    const parsed = MetricSchema.parse(OLD_SHAPE);
    for (const key of ['formFactor', 'vw', 'dpr', 'mem', 'cores', 'net', 'saveData'] as const) {
      expect(parsed[key]).toBeUndefined();
    }
  });

  it('accepts a partial device block', () => {
    // Safari reports neither deviceMemory nor connection; Firefox reports no
    // connection. Each absence is normal, not a malformed beacon.
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, formFactor: 'desktop', dpr: 2 }).success).toBe(
      true,
    );
  });

  it('rejects a forged form factor rather than opening a new series', () => {
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, formFactor: 'toaster' }).success).toBe(false);
  });

  it('rejects out-of-range device numbers', () => {
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, vw: 99_999 }).success).toBe(false);
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, dpr: -1 }).success).toBe(false);
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, cores: 1.5 }).success).toBe(false);
  });

  it('keeps an unfamiliar effectiveType out of the cardinality budget', () => {
    expect(normalizeEffectiveType('4G')).toBe('4g');
    expect(normalizeEffectiveType('slow-2g')).toBe('slow-2g');
    // A future spec value is logged as `other`, not as its own series…
    expect(normalizeEffectiveType('5g')).toBe('other');
    // …but "not reported" stays distinct from "reported as something new".
    expect(normalizeEffectiveType(undefined)).toBeUndefined();
    expect(normalizeEffectiveType('  ')).toBeUndefined();
  });

  it('does not reject a beacon carrying an unfamiliar effectiveType', () => {
    // The schema must stay permissive where the normalizer is strict: a 400
    // loses the whole sample, `other` loses one field's precision.
    expect(MetricSchema.safeParse({ ...OLD_SHAPE, net: '5g' }).success).toBe(true);
  });
});
