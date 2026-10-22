// One-minute rollups of the fleet's own telemetry, for /admin/alarms graphs and
// threshold alarms. Pure: snapshots in, rows out, so every metric is tested.
//
// The per-process collector (lib/perf/process-metrics.ts) keeps CUMULATIVE
// histograms and counters since the process started. Each check (once a
// minute, in the jobs worker) diffs them against the previous check, per
// process, and sums the differences across processes — so a worker restart
// (new pid) only costs one minute of baseline, never a negative or doubled row.
//
// Metrics (dim in parentheses):
//   http.latency   (ssr | api | auth | v1)   p50/p95/p99/max ms, count = requests
//   http.5xx_pct   (ssr | api | auth | v1)   value = % of requests that were 5xx
//   llm.latency    (<provider>:<kind>)        from lib/ai/timed-fetch.server.ts
//   llm.error_pct  (<provider>:<kind>)
//   rum.lcp / rum.inp / rum.ttfb / rum.fcp   (core | content | interactive | realtime)
//   process.event_loop_p99 (service)          value = worst process, ms
//   process.heap_pct       (service)          value = worst process, % of V8 limit
//   db.pool_waiting        ("")               value = web requests waiting for a DB connection
//
// Client-safe: type imports + the pure histogram module only.

import {
  fromCounts,
  mergeHistograms,
  newHistogram,
  percentile,
  type HistogramData,
} from '../perf/histogram';
import type { ProcessSnapshot } from '../perf/process-metrics';

export interface MetricRow {
  at: Date;
  metric: string;
  dim: string;
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  value: number | null;
}

/** Cumulative values last seen, per process. */
export interface RollupMemory {
  hist: Record<string, Record<string, HistogramData>>;
  count: Record<string, Record<string, number>>;
}

export const newRollupMemory = (): RollupMemory => ({ hist: {}, count: {} });

export type RouteGroup = 'ssr' | 'api' | 'auth' | 'v1';

/** Which latency group a route label belongs to; null = not a page or API call (static assets). */
export function routeGroup(route: string): RouteGroup | null {
  if (route.startsWith('static:')) return null;
  if (route.startsWith('/api/v1')) return 'v1';
  if (route.startsWith('/api/auth')) return 'auth';
  if (route.startsWith('/api/') || route === '/api') return 'api';
  return route.startsWith('/') ? 'ssr' : null;
}

const procKey = (s: ProcessSnapshot) => `${s.service}:${s.hostname}:${s.pid}`;

function histDelta(cur: HistogramData, prev: HistogramData | undefined): HistogramData | null {
  if (!prev) return null; // first sighting of this process: baseline only
  if (cur.count < prev.count) return cur; // restarted under the same key
  const counts = cur.counts.map((c, i) => Math.max(0, c - (prev.counts[i] ?? 0)));
  // max 0 = unknown: the cumulative max says nothing about this minute, and the
  // histogram code then interpolates the top from bucket bounds instead.
  return { counts, count: cur.count - prev.count, sum: Math.max(0, cur.sum - prev.sum), max: 0 };
}

function countDelta(cur: number, prev: number | undefined): number {
  if (prev === undefined) return 0;
  return cur >= prev ? cur - prev : cur;
}

const round = (n: number) => Math.round(n * 100) / 100;

function latencyRow(at: Date, metric: string, dim: string, h: HistogramData): MetricRow {
  return {
    at,
    metric,
    dim,
    count: h.count,
    p50: round(percentile(h, 50)),
    p95: round(percentile(h, 95)),
    p99: round(percentile(h, 99)),
    max: round(percentile(h, 100)),
    value: null,
  };
}

const gaugeRow = (at: Date, metric: string, dim: string, value: number): MetricRow => ({
  at,
  metric,
  dim,
  count: 0,
  p50: null,
  p95: null,
  p99: null,
  max: null,
  value: round(value),
});

/** Split a timing/counter name `metric|dim` (dim may be absent). */
function splitName(name: string): [string, string] {
  const i = name.indexOf('|');
  return i === -1 ? [name, ''] : [name.slice(0, i), name.slice(i + 1)];
}

export function rollup(
  snapshots: ProcessSnapshot[],
  clusterGauges: Record<string, number>,
  now: number,
  mem: RollupMemory,
): MetricRow[] {
  const at = new Date(Math.floor(now / 60_000) * 60_000);
  const latency = new Map<string, HistogramData>(); // `${metric}\u0000${dim}`
  const counts = new Map<string, number>();
  const add = (map: Map<string, HistogramData>, key: string, h: HistogramData) =>
    map.set(key, mergeHistograms(map.get(key) ?? newHistogram(), h));
  const bump = (key: string, n: number) => counts.set(key, (counts.get(key) ?? 0) + n);

  const present = new Set<string>();
  for (const s of snapshots) {
    const pk = procKey(s);
    present.add(pk);
    const prevHist = mem.hist[pk];
    const prevCount = mem.count[pk];
    const nextHist: Record<string, HistogramData> = {};
    const nextCount: Record<string, number> = {};

    // Routes → http.latency / http.5xx_pct per group (web only: hubs serve sockets).
    if (s.service === 'web') {
      for (const r of s.routes ?? []) {
        const group = routeGroup(r.route);
        if (!group) continue;
        const key = `route:${r.method}:${r.route}`;
        const cur = fromCounts(r.buckets, r.sumMs, r.maxMs);
        nextHist[key] = cur;
        const d = histDelta(cur, prevHist?.[key]);
        if (d && d.count > 0) add(latency, `http.latency\u0000${group}`, d);
        nextCount[`${key}:n`] = r.count;
        nextCount[`${key}:5xx`] = r.errors5xx;
        bump(`http.requests\u0000${group}`, countDelta(r.count, prevCount?.[`${key}:n`]));
        bump(`http.5xx\u0000${group}`, countDelta(r.errors5xx, prevCount?.[`${key}:5xx`]));
      }
    }

    // Named timings (llm.latency|deepseek:chat, rum.lcp|core, …).
    for (const [name, h] of Object.entries(s.timings ?? {})) {
      nextHist[`t:${name}`] = h;
      const d = histDelta(h, prevHist?.[`t:${name}`]);
      const [metric, dim] = splitName(name);
      if (d && d.count > 0) add(latency, `${metric}\u0000${dim}`, d);
    }
    // LLM error counters, for llm.error_pct.
    for (const [name, v] of Object.entries(s.counters ?? {})) {
      if (!name.startsWith('llm.error|')) continue;
      nextCount[`c:${name}`] = v;
      bump(`llm.errors\u0000${splitName(name)[1]}`, countDelta(v, prevCount?.[`c:${name}`]));
    }

    mem.hist[pk] = nextHist;
    mem.count[pk] = nextCount;
  }
  for (const pk of Object.keys(mem.hist)) if (!present.has(pk)) delete mem.hist[pk];
  for (const pk of Object.keys(mem.count)) if (!present.has(pk)) delete mem.count[pk];

  const rows: MetricRow[] = [];
  for (const [key, h] of latency) {
    const [metric, dim] = key.split('\u0000') as [string, string];
    rows.push(latencyRow(at, metric, dim, h));
    if (metric === 'llm.latency') {
      const errors = counts.get(`llm.errors\u0000${dim}`) ?? 0;
      rows.push({
        ...gaugeRow(at, 'llm.error_pct', dim, (errors / h.count) * 100),
        count: h.count,
      });
    }
  }
  for (const group of ['ssr', 'api', 'auth', 'v1'] as const) {
    const n = counts.get(`http.requests\u0000${group}`) ?? 0;
    if (n > 0) {
      const e = counts.get(`http.5xx\u0000${group}`) ?? 0;
      rows.push({ ...gaugeRow(at, 'http.5xx_pct', group, (e / n) * 100), count: n });
    }
  }

  // Per-service worst-process gauges.
  const byService = new Map<string, ProcessSnapshot[]>();
  for (const s of snapshots) byService.set(s.service, [...(byService.get(s.service) ?? []), s]);
  for (const [service, list] of byService) {
    rows.push(
      gaugeRow(
        at,
        'process.event_loop_p99',
        service,
        Math.max(...list.map((s) => s.eventLoop?.current?.p99 ?? 0)),
      ),
    );
    const heap = Math.max(
      ...list.map((s) =>
        s.memory?.heapLimit ? (s.memory.heapUsed / s.memory.heapLimit) * 100 : 0,
      ),
    );
    rows.push(gaugeRow(at, 'process.heap_pct', service, heap));
  }
  if (clusterGauges['db.pool.waiting'] !== undefined) {
    rows.push(gaugeRow(at, 'db.pool_waiting', '', clusterGauges['db.pool.waiting']));
  }
  return rows;
}
