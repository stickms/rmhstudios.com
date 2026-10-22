// Turns the Performance endpoint's payload into the numbers the Overview tab
// shows, and decides which of them are in trouble.
//
// WHY HERE AND NOT IN THE COMPONENT: the thresholds ARE the product — "p95 over a
// second is amber" is a decision that should be readable, testable and changed in
// one place, not buried in JSX. Pure and client-safe (type imports + the pure
// histogram module only).

import { fromCounts, mergeHistograms, newHistogram, percentile } from './histogram';
import type { PerfOverview } from './admin-types';
import type { MinuteBucket, ProcessSnapshot } from './process-metrics';

export type Tone = 'ok' | 'warn' | 'danger' | 'none';

/** [warn, danger] cut-offs; for every metric except cache hit, higher is worse. */
export const THRESHOLDS = {
  p95Ms: [1000, 2500],
  error5xxPct: [1, 5],
  eventLoopP99Ms: [100, 500],
  elu: [0.8, 0.95],
  throttledPct: [10, 30],
  heapPct: [80, 92],
  cgroupMemPct: [85, 95],
  cpuQuotaPct: [80, 95],
  poolWaiting: [0, 5],
  dbAvgMs: [50, 200],
} as const;

/** `value` is worse than `warn` -> warn, worse than `danger` -> danger. */
export function toneFor(value: number | null, [warn, danger]: readonly [number, number]): Tone {
  if (value === null || !Number.isFinite(value)) return 'none';
  if (value > danger) return 'danger';
  if (value > warn) return 'warn';
  return 'ok';
}

export interface Kpi {
  value: number | null;
  tone: Tone;
}

export interface Kpis {
  reqPerMin: Kpi;
  error5xxPct: Kpi;
  error4xxPct: Kpi;
  rate429: Kpi;
  p50: Kpi;
  p95: Kpi;
  p99: Kpi;
  eventLoopP99: Kpi;
  elu: Kpi;
  cpu: Kpi & { cores: number | null };
  rss: Kpi;
  heap: Kpi & { used: number; limit: number };
  throttled: Kpi;
  cgroupMem: Kpi & { current: number | null; max: number | null };
  pool: Kpi & { inUse: number | null; waiting: number | null; max: number | null };
  dbAvgMs: Kpi;
  cacheHitPct: Kpi;
  /** How many one-minute buckets the "recent" figures were computed from. */
  windowMinutes: number;
}

/** The recent window used for rates and latency: smooths a single noisy minute. */
export const RECENT_BUCKETS = 5;

const none: Kpi = { value: null, tone: 'none' };
const kpi = (value: number | null, limits?: readonly [number, number]): Kpi => ({
  value,
  tone: limits ? toneFor(value, limits) : 'none',
});

/** Every process that answered, hubs included (unreachable hubs dropped). */
export function allSnapshots(o: PerfOverview): ProcessSnapshot[] {
  const hubs = o.hubs.filter((h): h is ProcessSnapshot => !('error' in h));
  return [...o.processes, ...hubs];
}

export function deriveKpis(o: PerfOverview): Kpis {
  const c = o.cluster;
  const recent: MinuteBucket[] = c.timeseries.slice(-RECENT_BUCKETS);
  const recentRequests = recent.reduce((n, b) => n + b.requests, 0);

  // Percentiles over the recent window come from the merged per-minute latency
  // buckets; with no completed minute yet, fall back to everything since boot.
  const hist = recent.reduce((acc, b) => mergeHistograms(acc, fromCounts(b.lat)), newHistogram());
  const useRecent = hist.count > 0;
  const lifetime = fromCounts(c.requests.buckets, c.requests.sumMs, c.requests.maxMs);
  const lat = useRecent ? hist : lifetime;

  const errCount5 = useRecent ? recent.reduce((n, b) => n + b.s5xx, 0) : c.requests.s5xx;
  const errCount4 = useRecent ? recent.reduce((n, b) => n + b.s4xx, 0) : c.requests.s4xx;
  const denom = useRecent ? recentRequests : c.requests.count;
  const pct = (n: number) => (denom > 0 ? Math.round((n / denom) * 1000) / 10 : null);

  const snaps = allSnapshots(o);
  const eventLoopP99 = snaps.length ? Math.max(...snaps.map((s) => s.eventLoop.current.p99)) : null;
  const elu = snaps.length ? Math.max(...snaps.map((s) => s.eventLoop.eluRecent)) : null;

  const cg = c.cgroup;
  const cores = cg?.cpuCores ?? null;
  const cpuPct = o.cluster.processes ? c.cpu.percent : null;
  const heapPct = c.memory.heapLimit ? (c.memory.heapUsed / c.memory.heapLimit) * 100 : null;
  const cgMemPct =
    cg?.memoryMax && cg.memoryCurrent !== null ? (cg.memoryCurrent / cg.memoryMax) * 100 : null;

  const total = c.gauges['db.pool.total'];
  const idle = c.gauges['db.pool.idle'];
  const waiting = c.gauges['db.pool.waiting'];
  const poolMax = c.gauges['db.pool.max'];
  const havePool = total !== undefined && idle !== undefined;

  const recentDbQueries = recent.reduce((n, b) => n + b.dbQueries, 0);
  const recentDbMs = recent.reduce((n, b) => n + b.dbMs, 0);
  const dbAvg =
    recentDbQueries > 0
      ? recentDbMs / recentDbQueries
      : c.db.totals.count
        ? c.db.totals.avgMs
        : null;

  const hits = c.cache.total.l1_hit + c.cache.total.l2_hit + c.cache.total.stale;
  const lookups = hits + c.cache.total.miss;

  return {
    reqPerMin: recent.length ? kpi(recent[recent.length - 1].requests) : none,
    error5xxPct: kpi(pct(errCount5), THRESHOLDS.error5xxPct),
    error4xxPct: kpi(pct(errCount4)),
    rate429: kpi(c.requests.s429),
    p50: kpi(lat.count ? Math.round(percentile(lat, 50) * 10) / 10 : null),
    p95: kpi(lat.count ? Math.round(percentile(lat, 95) * 10) / 10 : null, THRESHOLDS.p95Ms),
    p99: kpi(lat.count ? Math.round(percentile(lat, 99) * 10) / 10 : null),
    eventLoopP99: kpi(eventLoopP99, THRESHOLDS.eventLoopP99Ms),
    elu: kpi(elu, THRESHOLDS.elu),
    cpu: {
      ...kpi(cpuPct, undefined),
      // Share of the container's CPU quota in use; only meaningful with a quota.
      tone: cores && cpuPct !== null ? toneFor(cpuPct / cores, THRESHOLDS.cpuQuotaPct) : 'none',
      cores,
    },
    rss: kpi(c.processes ? c.memory.rss : null),
    heap: {
      ...kpi(heapPct, THRESHOLDS.heapPct),
      used: c.memory.heapUsed,
      limit: c.memory.heapLimit,
    },
    throttled: kpi(cg?.throttledPctLastMinute ?? null, THRESHOLDS.throttledPct),
    cgroupMem: {
      ...kpi(cgMemPct, THRESHOLDS.cgroupMemPct),
      current: cg?.memoryCurrent ?? null,
      max: cg?.memoryMax ?? null,
    },
    pool: {
      value: havePool ? total - idle : null,
      tone: waiting !== undefined ? toneFor(waiting, THRESHOLDS.poolWaiting) : 'none',
      inUse: havePool ? total - idle : null,
      waiting: waiting ?? null,
      max: poolMax ?? null,
    },
    dbAvgMs: kpi(dbAvg === null ? null : Math.round(dbAvg * 100) / 100, THRESHOLDS.dbAvgMs),
    cacheHitPct: kpi(lookups > 0 ? Math.round((hits / lookups) * 1000) / 10 : null),
    windowMinutes: useRecent ? recent.length : 0,
  };
}
