import { afterEach, describe, expect, it, vi } from 'vitest';
import { newHistogram, observe, type HistogramData } from '../../perf/histogram';
import type { ProcessSnapshot } from '../../perf/process-metrics';
import { aiCallLabel, timedAiFetch } from '../../ai/timed-fetch.server';
import { snapshotProcess } from '../../perf/process-metrics';
import { newRollupMemory, rollup, routeGroup, type MetricRow } from '../metrics-rollup';

// The rollups are the history behind every graph and threshold alarm on
// /admin/alarms. A wrong delta here is a fake latency spike (or a hidden one).

const MIN = 60_000;
const T0 = 1_800_000_000_000;

function hist(ms: number, n: number): HistogramData {
  const h = newHistogram();
  for (let i = 0; i < n; i++) observe(h, ms);
  return h;
}

function route(path: string, n: number, ms: number, errors5xx = 0) {
  const h = hist(ms, n);
  return {
    route: path,
    method: 'GET',
    count: n,
    errors5xx,
    errors4xx: 0,
    buckets: h.counts,
    sumMs: h.sum,
    maxMs: h.max,
  };
}

function web(
  pid: number,
  routes: ReturnType<typeof route>[],
  extra: Partial<ProcessSnapshot> = {},
): ProcessSnapshot {
  return {
    service: 'web',
    hostname: 'h',
    pid,
    routes,
    counters: {},
    memory: { heapUsed: 300, heapLimit: 1000 },
    eventLoop: { current: { p99: 20 } },
    ...extra,
  } as unknown as ProcessSnapshot;
}

const find = (rows: MetricRow[], metric: string, dim = '') =>
  rows.find((r) => r.metric === metric && r.dim === dim);

describe('routeGroup', () => {
  it('separates pages, APIs, auth and the developer API; drops static assets', () => {
    expect(routeGroup('/feed')).toBe('ssr');
    expect(routeGroup('/api/posts')).toBe('api');
    expect(routeGroup('/api/auth/callback/discord')).toBe('auth');
    expect(routeGroup('/api/v1/users')).toBe('v1');
    expect(routeGroup('static:js')).toBeNull();
  });
});

describe('rollup', () => {
  it('the first check is a baseline; the next reports only that minute', () => {
    const mem = newRollupMemory();
    expect(
      find(rollup([web(1, [route('/feed', 100, 200)])], {}, T0, mem), 'http.latency', 'ssr'),
    ).toBeUndefined();

    const rows = rollup([web(1, [route('/feed', 160, 200, 3)])], {}, T0 + MIN, mem);
    expect(find(rows, 'http.latency', 'ssr')).toMatchObject({ count: 60 });
    expect(find(rows, 'http.latency', 'ssr')!.p95).toBeGreaterThan(100);
    expect(find(rows, 'http.5xx_pct', 'ssr')).toMatchObject({ count: 60, value: 5 });
    expect(find(rows, 'http.latency', 'ssr')!.at.getTime()).toBe(
      Math.floor((T0 + MIN) / MIN) * MIN,
    );
  });

  it('sums processes, and a restarted process does not produce a negative minute', () => {
    const mem = newRollupMemory();
    rollup([web(1, [route('/api/x', 50, 10)]), web(2, [route('/api/x', 50, 10)])], {}, T0, mem);
    // pid 1 served 10 more; pid 2 was replaced by pid 3 (baseline only).
    const rows = rollup(
      [web(1, [route('/api/x', 60, 10)]), web(3, [route('/api/x', 5, 10)])],
      {},
      T0 + MIN,
      mem,
    );
    expect(find(rows, 'http.latency', 'api')).toMatchObject({ count: 10 });
    expect(Object.keys(mem.hist)).toEqual(['web:h:1', 'web:h:3']);
  });

  it('turns named timings into llm/rum series, with an LLM error rate', () => {
    const mem = newRollupMemory();
    const at = (n: number, errs: number) =>
      web(1, [], {
        timings: { 'llm.latency|deepseek:chat': hist(1500, n), 'rum.lcp|core': hist(2200, n) },
        counters: { 'llm.error|deepseek:chat': errs },
      });
    rollup([at(10, 1)], {}, T0, mem);
    const rows = rollup([at(30, 3)], {}, T0 + MIN, mem);
    expect(find(rows, 'llm.latency', 'deepseek:chat')).toMatchObject({ count: 20 });
    expect(find(rows, 'llm.error_pct', 'deepseek:chat')).toMatchObject({ value: 10 });
    expect(find(rows, 'rum.lcp', 'core')!.p95).toBeGreaterThan(1500);
  });

  it('reports per-service worst-process gauges and pool waiting', () => {
    const rows = rollup(
      [web(1, [], { memory: { heapUsed: 900, heapLimit: 1000 } } as never), web(2, [])],
      { 'db.pool.waiting': 4 },
      T0,
      newRollupMemory(),
    );
    expect(find(rows, 'process.heap_pct', 'web')).toMatchObject({ value: 90 });
    expect(find(rows, 'db.pool_waiting')).toMatchObject({ value: 4 });
  });
});

describe('timedAiFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('labels by provider and endpoint', () => {
    expect(aiCallLabel('https://api.deepseek.com/v1/chat/completions')).toBe('deepseek:chat');
    expect(aiCallLabel('https://api.x.ai/v1/images/generations')).toBe('xai:image');
    expect(aiCallLabel('not a url')).toBe('other:other');
  });

  it('times every call and counts failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const before = snapshotProcess();
    await timedAiFetch('https://api.deepseek.com/chat/completions', { method: 'POST' });
    const after = snapshotProcess();
    const key = 'llm.latency|deepseek:chat';
    expect((after.timings?.[key]?.count ?? 0) - (before.timings?.[key]?.count ?? 0)).toBe(1);
    expect(
      (after.counters['llm.error|deepseek:chat'] ?? 0) -
        (before.counters['llm.error|deepseek:chat'] ?? 0),
    ).toBe(1);
  });
});
