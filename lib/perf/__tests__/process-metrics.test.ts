import { afterEach, describe, expect, it } from 'vitest';
import {
  Collector,
  MAX_COUNTERS,
  MAX_OPS,
  MAX_ROUTES,
  RING_SIZE,
  SERIES_MINUTES,
  cacheNamespace,
  mergeSnapshots,
  readCgroup,
  recordRequest,
  snapshotProcess,
} from '../process-metrics';

const collectors: Collector[] = [];
function make(slowQueryMs = 250): Collector {
  const c = new Collector({ service: 'test', slowQueryMs });
  collectors.push(c);
  return c;
}
afterEach(() => {
  for (const c of collectors.splice(0)) c.stop();
});

describe('Collector requests', () => {
  it('counts status classes, 429s and per-route latency', () => {
    const c = make();
    c.recordRequest({ route: '/api/feed', method: 'GET', status: 200, durationMs: 12, queries: 3 });
    c.recordRequest({ route: '/api/feed', method: 'GET', status: 200, durationMs: 18, queries: 5 });
    c.recordRequest({ route: '/api/feed', method: 'GET', status: 500, durationMs: 40, queries: 1 });
    c.recordRequest({ route: '/api/feed', method: 'POST', status: 429, durationMs: 1 });
    c.recordRequest({ route: '/', method: 'GET', status: 302, durationMs: 2 });

    const s = c.snapshot();
    expect(s.requests).toMatchObject({ count: 5, s2xx: 2, s3xx: 1, s4xx: 1, s5xx: 1, s429: 1 });
    const get = s.routes.find((r) => r.route === '/api/feed' && r.method === 'GET')!;
    expect(get.count).toBe(3);
    expect(get.errors5xx).toBe(1);
    expect(get.avgQueries).toBe(3);
    expect(get.maxMs).toBe(40);
    expect(s.routes.find((r) => r.method === 'POST')!.errors4xx).toBe(1);
  });

  it('caps route labels at MAX_ROUTES and folds the rest into "other"', () => {
    const c = make();
    for (let i = 0; i < MAX_ROUTES + 50; i++) {
      c.recordRequest({ route: `/r/${i}`, method: 'GET', status: 200, durationMs: 1 });
    }
    const s = c.snapshot();
    expect(s.routes.length).toBeLessThanOrEqual(MAX_ROUTES + 1);
    expect(s.routes.find((r) => r.route === 'other')!.count).toBe(50);
    expect(s.requests.count).toBe(MAX_ROUTES + 50);
  });

  it('folds an unknown HTTP method rather than minting labels from it', () => {
    const c = make();
    c.recordRequest({ route: '/x', method: 'PROPFIND', status: 200, durationMs: 1 });
    expect(c.snapshot().routes[0].method).toBe('OTHER');
  });
});

describe('Collector queries', () => {
  it('aggregates per op and keeps only slow queries in the ring', () => {
    const c = make(100);
    c.recordQuery({ op: 'user.findUnique', durationMs: 5, ok: true });
    c.recordQuery({ op: 'user.findUnique', durationMs: 7, ok: false });
    c.recordQuery({ op: 'post.findMany', durationMs: 150, ok: true, label: 'GET /api/feed' });
    const s = c.snapshot();
    expect(s.db.totals.count).toBe(3);
    expect(s.db.totals.errors).toBe(1);
    expect(s.db.totals.slow).toBe(1);
    expect(s.db.slowQueries).toHaveLength(1);
    expect(s.db.slowQueries[0]).toMatchObject({
      op: 'post.findMany',
      ms: 150,
      route: 'GET /api/feed',
    });
    expect(s.db.ops.find((o) => o.op === 'user.findUnique')!.count).toBe(2);
  });

  it('caps ops and the slow ring', () => {
    const c = make(1);
    for (let i = 0; i < MAX_OPS + 40; i++)
      c.recordQuery({ op: `m${i}.op`, durationMs: 2, ok: true });
    const s = c.snapshot();
    expect(s.db.ops.length).toBeLessThanOrEqual(MAX_OPS + 1);
    expect(s.db.slowQueries).toHaveLength(RING_SIZE);
    // Newest first: the last recorded op leads.
    expect(s.db.slowQueries[0].op).toBe(`m${MAX_OPS + 39}.op`);
  });
});

describe('Collector misc recorders', () => {
  it('truncates error messages and keeps the newest 50', () => {
    const c = make();
    for (let i = 0; i < RING_SIZE + 10; i++) {
      c.recordError({
        route: '/x',
        status: 500,
        message: `boom ${i} ${'y'.repeat(500)}`,
        traceId: 't',
      });
    }
    const s = c.snapshot();
    expect(s.errors).toHaveLength(RING_SIZE);
    expect(s.errors[0].message.length).toBe(300);
    expect(s.errors[0].message.startsWith(`boom ${RING_SIZE + 9} `)).toBe(true);
  });

  it('counts cache outcomes per namespace', () => {
    const c = make();
    c.recordCache('l1_hit', 'feed');
    c.recordCache('l1_hit', 'feed');
    c.recordCache('miss', 'feed');
    c.recordCache('stale', 'user');
    const s = c.snapshot();
    expect(s.cache.total).toEqual({ l1_hit: 2, l2_hit: 0, miss: 1, stale: 1 });
    expect(s.cache.namespaces.feed.l1_hit).toBe(2);
    expect(cacheNamespace('timeline:anon:v2:first:15')).toBe('timeline');
    expect(cacheNamespace('plain')).toBe('plain');
  });

  it('caps counters and evaluates gauges lazily, tolerating throwers', () => {
    const c = make();
    for (let i = 0; i < MAX_COUNTERS + 25; i++) c.recordCounter(`c${i}`);
    c.recordCounter('ratelimit.rejected', 3);
    let n = 1;
    c.setGauge('live', () => n);
    c.setGauge('boom', () => {
      throw new Error('nope');
    });
    c.setGauge('fixed', 7);
    n = 42;
    const s = c.snapshot();
    expect(Object.keys(s.counters).length).toBeLessThanOrEqual(MAX_COUNTERS + 1);
    expect(s.counters._other).toBeGreaterThan(0);
    expect(s.gauges).toMatchObject({ live: 42, boom: null, fixed: 7 });
  });
});

describe('minute rolling', () => {
  it('closes the minute into a bucket and starts a fresh one', () => {
    const c = make(100);
    c.recordRequest({ route: '/a', method: 'GET', status: 200, durationMs: 10 });
    c.recordRequest({ route: '/a', method: 'GET', status: 503, durationMs: 900 });
    c.recordQuery({ op: 'a.b', durationMs: 120, ok: true });
    const end = Date.UTC(2026, 0, 1, 12, 1, 0);
    c.roll(end);

    let s = c.snapshot();
    expect(s.timeseries).toHaveLength(1);
    const b = s.timeseries[0];
    expect(b.t).toBe(Date.UTC(2026, 0, 1, 12, 0, 0));
    expect(b).toMatchObject({ requests: 2, s5xx: 1, dbQueries: 1, slowQueries: 1 });
    expect(b.p95).toBeGreaterThan(b.p50);

    // The next minute starts empty, but lifetime totals keep accumulating.
    c.recordRequest({ route: '/a', method: 'GET', status: 200, durationMs: 5 });
    c.roll(end + 60_000);
    s = c.snapshot();
    expect(s.timeseries).toHaveLength(2);
    expect(s.timeseries[1].requests).toBe(1);
    expect(s.requests.count).toBe(3);
  });

  it('keeps only the last 60 minutes', () => {
    const c = make();
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 1; i <= SERIES_MINUTES + 15; i++) c.roll(start + i * 60_000);
    const s = c.snapshot();
    expect(s.timeseries).toHaveLength(SERIES_MINUTES);
    expect(s.timeseries[SERIES_MINUTES - 1].t).toBe(start + (SERIES_MINUTES + 15 - 1) * 60_000);
  });
});

describe('snapshot', () => {
  it('is JSON-serialisable and carries identity, memory and runtime sections', () => {
    const c = make();
    c.start('unit');
    const s = c.snapshot();
    const round = JSON.parse(JSON.stringify(s));
    expect(round.service).toBe('unit');
    expect(round.pid).toBe(process.pid);
    expect(round.memory.rss).toBeGreaterThan(0);
    expect(round.memory.heapLimit).toBeGreaterThan(0);
    expect(round.os.cpus).toBeGreaterThan(0);
    expect(round.requests.buckets).toHaveLength(15);
    expect(Array.isArray(round.memory.heapSpaces)).toBe(true);
  });

  it('start is idempotent', () => {
    const c = make();
    c.start('a');
    c.start('b');
    expect(c.snapshot().service).toBe('b');
    expect(c.started).toBe(true);
  });

  it('the module-level recorders never throw and feed the singleton', () => {
    expect(() =>
      recordRequest({ route: '/singleton', method: 'GET', status: 200, durationMs: 1 }),
    ).not.toThrow();
    expect(snapshotProcess().routes.some((r) => r.route === '/singleton')).toBe(true);
  });
});

describe('readCgroup', () => {
  it('returns null (not a throw) when the files do not exist', () => {
    expect(readCgroup('/definitely/not/a/cgroup')).toBeNull();
  });
});

describe('mergeSnapshots', () => {
  it('sums counts and recomputes percentiles from merged buckets', () => {
    const a = make();
    const b = make();
    for (let i = 0; i < 900; i++)
      a.recordRequest({ route: '/r', method: 'GET', status: 200, durationMs: 4, queries: 1 });
    for (let i = 0; i < 100; i++)
      b.recordRequest({ route: '/r', method: 'GET', status: 500, durationMs: 2000, queries: 2 });
    a.recordCache('l1_hit', 'feed');
    b.recordCache('miss', 'feed');
    a.recordCounter('ratelimit.rejected', 2);
    b.recordCounter('ratelimit.rejected', 3);
    a.setGauge('db.pool.waiting', 1);
    b.setGauge('db.pool.waiting', 2);
    a.recordQuery({ op: 'x.y', durationMs: 10, ok: true });
    b.recordQuery({ op: 'x.y', durationMs: 30, ok: false });

    const t = Date.UTC(2026, 0, 1, 12, 1, 0);
    a.roll(t);
    b.roll(t);

    const m = mergeSnapshots([a.snapshot(), b.snapshot()]);
    expect(m.processes).toBe(2);
    expect(m.requests).toMatchObject({ count: 1000, s2xx: 900, s5xx: 100, queries: 1100 });
    expect(m.requests.p95).toBeGreaterThan(1000);
    expect(m.requests.p50).toBeLessThan(10);

    const route = m.routes.find((r) => r.route === '/r')!;
    expect(route.count).toBe(1000);
    expect(route.errors5xx).toBe(100);
    expect(route.avgQueries).toBeCloseTo(1.1, 2);

    expect(m.cache.total).toMatchObject({ l1_hit: 1, miss: 1 });
    expect(m.counters['ratelimit.rejected']).toBe(5);
    expect(m.gauges['db.pool.waiting']).toBe(3);
    expect(m.db.ops.find((o) => o.op === 'x.y')).toMatchObject({ count: 2, errors: 1 });

    // Same wall-clock minute in both processes -> ONE merged bucket.
    expect(m.timeseries).toHaveLength(1);
    expect(m.timeseries[0].requests).toBe(1000);
    expect(m.timeseries[0].p95).toBeGreaterThan(1000);
  });

  it('copes with an empty list', () => {
    const m = mergeSnapshots([]);
    expect(m.processes).toBe(0);
    expect(m.requests.count).toBe(0);
    expect(m.cgroup).toBeNull();
  });
});
