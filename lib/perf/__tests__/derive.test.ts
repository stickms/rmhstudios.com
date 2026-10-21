import { afterEach, describe, expect, it } from 'vitest';
import { THRESHOLDS, deriveKpis, toneFor } from '../derive';
import type { PerfOverview } from '../admin-types';
import { Collector, mergeSnapshots } from '../process-metrics';

const collectors: Collector[] = [];
afterEach(() => {
  for (const c of collectors.splice(0)) c.stop();
});

function overview(setup: (c: Collector) => void): PerfOverview {
  const c = new Collector({ service: 'web' });
  collectors.push(c);
  setup(c);
  const snap = c.snapshot();
  return {
    generatedAt: Date.now(),
    self: { pid: snap.pid, hostname: snap.hostname, service: 'web' },
    processes: [snap],
    cluster: mergeSnapshots([snap]),
    hubs: [{ service: 'socket', error: 'unreachable' }],
    redis: { enabled: false, distinct: false, cache: null, state: null },
  };
}

describe('toneFor', () => {
  it('is ok at or below warn, warn above it, danger above danger', () => {
    expect(toneFor(1000, THRESHOLDS.p95Ms)).toBe('ok');
    expect(toneFor(1001, THRESHOLDS.p95Ms)).toBe('warn');
    expect(toneFor(2501, THRESHOLDS.p95Ms)).toBe('danger');
    expect(toneFor(null, THRESHOLDS.p95Ms)).toBe('none');
  });

  it('treats any waiting pool client as a warning', () => {
    expect(toneFor(0, THRESHOLDS.poolWaiting)).toBe('ok');
    expect(toneFor(1, THRESHOLDS.poolWaiting)).toBe('warn');
  });
});

describe('deriveKpis', () => {
  it('falls back to lifetime figures before the first minute closes', () => {
    const o = overview((c) => {
      for (let i = 0; i < 100; i++)
        c.recordRequest({ route: '/a', method: 'GET', status: 200, durationMs: 10 });
      for (let i = 0; i < 2; i++)
        c.recordRequest({ route: '/a', method: 'GET', status: 500, durationMs: 10 });
    });
    const k = deriveKpis(o);
    expect(k.windowMinutes).toBe(0);
    expect(k.reqPerMin.value).toBeNull();
    expect(k.error5xxPct.value).toBeCloseTo(2, 0);
    expect(k.error5xxPct.tone).toBe('warn');
  });

  it('uses the recent minutes once buckets exist, and flags a slow p95', () => {
    const o = overview((c) => {
      for (let i = 0; i < 50; i++)
        c.recordRequest({ route: '/slow', method: 'GET', status: 200, durationMs: 4000 });
      c.roll(Date.UTC(2026, 0, 1, 12, 1, 0));
    });
    const k = deriveKpis(o);
    expect(k.windowMinutes).toBe(1);
    expect(k.reqPerMin.value).toBe(50);
    expect(k.p95.value).toBeGreaterThan(2500);
    expect(k.p95.tone).toBe('danger');
    expect(k.error5xxPct.tone).toBe('ok');
  });

  it('reads the pool from gauges and warns on waiters', () => {
    const o = overview((c) => {
      c.setGauge('db.pool.total', 10);
      c.setGauge('db.pool.idle', 4);
      c.setGauge('db.pool.waiting', 2);
      c.setGauge('db.pool.max', 20);
    });
    const k = deriveKpis(o);
    expect(k.pool).toMatchObject({ inUse: 6, waiting: 2, max: 20, tone: 'warn' });
  });

  it('computes the cache hit ratio, counting stale serves as hits', () => {
    const o = overview((c) => {
      c.recordCache('l1_hit', 'a');
      c.recordCache('l2_hit', 'a');
      c.recordCache('stale', 'a');
      c.recordCache('miss', 'a');
    });
    expect(deriveKpis(o).cacheHitPct.value).toBe(75);
  });

  it('survives an empty process list', () => {
    const o = overview(() => {});
    o.processes = [];
    o.cluster = mergeSnapshots([]);
    const k = deriveKpis(o);
    expect(k.eventLoopP99.value).toBeNull();
    expect(k.cpu.value).toBeNull();
  });
});
