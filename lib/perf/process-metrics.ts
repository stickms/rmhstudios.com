// In-process performance collector — one per Node process (web worker, hub, jobs).
//
// WHAT IT IS: a handful of bounded Maps and counters that the request hook, the
// Prisma extension, the cache helpers and the rate limiter feed, plus a snapshot
// function the admin page reads. It exists because the site had log lines about
// slowness (`[db:query-budget]`, `Server-Timing`) but no way to ask "what is the
// p95 right now, which route is eating it, is the event loop blocked, is the
// container being CPU-throttled". It answers those from memory, with no external
// collector and no new dependency.
//
// WHAT IT MUST NEVER DO: change what a user sees. Every `record*` entry point is
// wrapped in try/catch and does O(1) work (a Map lookup and a few increments).
// Nothing here awaits, does I/O, or runs on the request path except those
// increments. The only periodic JS timer is the 60 s minute roller; filesystem
// reads (cgroup) happen at snapshot / roll time, never per request.
//
// MEMORY IS BOUNDED BY CONSTRUCTION: routes <= 300 labels then "other"; query ops
// <= 300 then "other"; counters <= 200 names; cache namespaces <= 100; ring
// buffers of 50; 60 one-minute buckets. A hostile URL space cannot grow it.
//
// MULTI-PROCESS: production runs NITRO_CLUSTER_WORKERS=2 workers plus separate hub
// and jobs processes, each with its own copy of this state. `snapshotProcess()`
// serialises one process (histogram bucket COUNTS included, not just percentiles)
// and `mergeSnapshots()` folds several into a cluster view, recomputing
// percentiles from the summed buckets — averaging percentiles would be wrong.
//
// Pure Node, no `@/` imports: the hubs' esbuild bundles and the Nitro plugins
// both import it by relative path (server/CLAUDE.md gotcha 7).

import cluster from 'node:cluster';
import { readFileSync } from 'node:fs';
import { hostname, loadavg, cpus, totalmem, freemem } from 'node:os';
import {
  constants as perfConstants,
  monitorEventLoopDelay,
  performance,
  PerformanceObserver,
  type EventLoopUtilization,
} from 'node:perf_hooks';
import { getHeapSpaceStatistics, getHeapStatistics } from 'node:v8';
import {
  fromCounts,
  mean,
  mergeHistograms,
  newHistogram,
  observe,
  percentile,
  type HistogramData,
} from './histogram';

/* ─── Limits ─────────────────────────────────────────────────────────────── */

export const MAX_ROUTES = 300;
export const MAX_OPS = 300;
export const MAX_COUNTERS = 200;
export const MAX_CACHE_NAMESPACES = 100;
export const MAX_GAUGES = 100;
export const RING_SIZE = 50;
export const SERIES_MINUTES = 60;
const ERROR_MESSAGE_MAX = 300;
const DEFAULT_SLOW_QUERY_MS = 250;
/** A CPU/ELU "recent" window is advanced at most this often (see `recentRate`). */
const RECENT_MIN_MS = 5_000;
/** cgroup files are re-read at most this often by snapshots. */
const CGROUP_CACHE_MS = 5_000;

const KNOWN_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/* ─── Public types ───────────────────────────────────────────────────────── */

export type CacheKind = 'l1_hit' | 'l2_hit' | 'miss' | 'stale';

export interface RequestRecord {
  route: string;
  method?: string;
  status: number;
  durationMs: number;
  /** Prisma queries the request issued (the query budget's count). */
  queries?: number;
}

export interface QueryRecord {
  /** `model.operation`, e.g. `user.findUnique` (`raw.$queryRaw` for raw SQL). */
  op: string;
  durationMs: number;
  ok: boolean;
  /** The ambient request label, kept only on slow-query entries. */
  label?: string;
}

export interface ErrorRecord {
  route: string;
  status: number;
  message: string;
  traceId?: string;
}

export interface RouteRow {
  route: string;
  method: string;
  count: number;
  errors5xx: number;
  errors4xx: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  maxMs: number;
  sumMs: number;
  queries: number;
  avgQueries: number;
  buckets: number[];
}

export interface OpRow {
  op: string;
  count: number;
  errors: number;
  avgMs: number;
  p95: number;
  maxMs: number;
  totalMs: number;
  buckets: number[];
}

export interface SlowQuery {
  op: string;
  ms: number;
  route: string;
  at: number;
  service?: string;
  pid?: number;
}

export interface ErrorEntry {
  at: number;
  route: string;
  status: number;
  message: string;
  traceId: string | null;
  service?: string;
  pid?: number;
}

export interface MinuteBucket {
  /** Epoch ms of the START of the minute this bucket covers. */
  t: number;
  requests: number;
  s4xx: number;
  s5xx: number;
  p50: number;
  p95: number;
  eventLoopP99: number;
  elu: number;
  cpu: number;
  rss: number;
  heapUsed: number;
  dbQueries: number;
  dbMs: number;
  dbAvgMs: number;
  slowQueries: number;
  /** Latency bucket counts, kept so buckets can be merged across processes. */
  lat: number[];
}

export interface EventLoopStats {
  p50: number;
  p90: number;
  p99: number;
  max: number;
  mean: number;
}

export interface GcStats {
  count: number;
  pauseMs: number;
  byKind: Record<string, { count: number; pauseMs: number }>;
}

export interface CgroupReading {
  version: 1 | 2;
  memoryMax: number | null;
  memoryCurrent: number | null;
  memoryAnon: number | null;
  memoryFile: number | null;
  oom: number | null;
  oomKill: number | null;
  /** CPUs the quota allows (quota / period), or null when unlimited. */
  cpuCores: number | null;
  cpuUsageUsec: number | null;
  nrPeriods: number | null;
  nrThrottled: number | null;
  throttledUsec: number | null;
}

export interface CgroupSnapshot extends CgroupReading {
  /** Share of CFS periods that were throttled over the last full minute (0..100). */
  throttledPctLastMinute: number | null;
  /** Average cores of CPU the whole cgroup used over the last full minute. */
  cpuCoresUsedLastMinute: number | null;
}

export interface RequestTotals {
  count: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  s429: number;
  sumMs: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  maxMs: number;
  queries: number;
  buckets: number[];
}

export interface ProcessSnapshot {
  schema: 1;
  generatedAt: number;
  service: string;
  pid: number;
  hostname: string;
  nodeVersion: string;
  startedAt: number;
  uptimeSec: number;
  clusterWorkerId: string | number | null;
  cpu: {
    /** Over the most recent window of >= 5 s (see `recentRate`). */
    percent: number;
    userPercent: number;
    systemPercent: number;
    lastMinutePercent: number | null;
    userMsTotal: number;
    systemMsTotal: number;
  };
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    heapLimit: number;
    mallocedMemory: number;
    detachedContexts: number;
    heapSpaces: Array<{ name: string; size: number; used: number; available: number }>;
  };
  eventLoop: {
    current: EventLoopStats;
    lastMinute: EventLoopStats | null;
    eluRecent: number;
    eluLastMinute: number | null;
  };
  gc: { total: GcStats; lastMinute: GcStats | null };
  handles: Record<string, number>;
  os: { loadavg: number[]; cpus: number; totalmem: number; freemem: number };
  cgroup: CgroupSnapshot | null;
  requests: RequestTotals;
  routes: RouteRow[];
  timeseries: MinuteBucket[];
  db: {
    totals: { count: number; errors: number; totalMs: number; avgMs: number; slow: number };
    ops: OpRow[];
    slowQueries: SlowQuery[];
    slowThresholdMs: number;
  };
  cache: {
    total: Record<CacheKind, number>;
    namespaces: Record<string, Record<CacheKind, number>>;
  };
  counters: Record<string, number>;
  gauges: Record<string, number | null>;
  errors: ErrorEntry[];
}

/* ─── Small helpers ──────────────────────────────────────────────────────── */

/** A fixed-size ring: pushing past `cap` overwrites the oldest entry. */
class Ring<T> {
  private buf: T[] = [];
  private head = 0;
  constructor(private readonly cap: number) {}

  push(value: T): void {
    if (this.buf.length < this.cap) this.buf.push(value);
    else {
      this.buf[this.head] = value;
      this.head = (this.head + 1) % this.cap;
    }
  }

  get size(): number {
    return this.buf.length;
  }

  newestFirst(): T[] {
    const n = this.buf.length;
    const out: T[] = new Array(n);
    // Not yet full: `head` is 0 and the newest entry is the last one pushed.
    // Full: `head` is the oldest slot, so the newest is the one before it.
    const newest = n < this.cap ? n - 1 : (this.head - 1 + this.cap) % this.cap;
    for (let i = 0; i < n; i++) out[i] = this.buf[(newest - i + n) % n];
    return out;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (n: number) => (Number.isFinite(n) ? n : 0);

function classOf(status: number): 2 | 3 | 4 | 5 {
  if (status >= 500) return 5;
  if (status >= 400) return 4;
  if (status >= 300) return 3;
  return 2;
}

function zeroCache(): Record<CacheKind, number> {
  return { l1_hit: 0, l2_hit: 0, miss: 0, stale: 0 };
}

/* ─── cgroup (container limits) ──────────────────────────────────────────── */

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readNumber(path: string): number | null {
  const raw = readText(path);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'max') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** `key value` lines (cpu.stat, memory.stat, memory.events) → a record. */
function readKeyed(path: string): Record<string, number> | null {
  const raw = readText(path);
  if (raw === null) return null;
  const out: Record<string, number> = {};
  for (const line of raw.split('\n')) {
    const [k, v] = line.trim().split(/\s+/);
    const n = Number(v);
    if (k && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** v1 reports "no limit" as a number near 2^63. */
const unlimited = (n: number | null) => (n === null || n > 2 ** 60 ? null : n);

/**
 * The container's own limits and counters. cgroup v2 first, then v1, else null
 * (macOS, a bare host without the files). Each read is individually guarded so a
 * missing controller yields null fields rather than losing the whole block.
 */
export function readCgroup(root = '/sys/fs/cgroup'): CgroupReading | null {
  const v2 = readText(`${root}/memory.max`) !== null || readText(`${root}/cpu.max`) !== null;
  if (v2) {
    const cpuMax = readText(`${root}/cpu.max`)?.trim().split(/\s+/);
    const quota = cpuMax && cpuMax[0] !== 'max' ? Number(cpuMax[0]) : NaN;
    const period = cpuMax ? Number(cpuMax[1]) : NaN;
    const cpuStat = readKeyed(`${root}/cpu.stat`);
    const memStat = readKeyed(`${root}/memory.stat`);
    const memEvents = readKeyed(`${root}/memory.events`);
    return {
      version: 2,
      memoryMax: readNumber(`${root}/memory.max`),
      memoryCurrent: readNumber(`${root}/memory.current`),
      memoryAnon: memStat?.anon ?? null,
      memoryFile: memStat?.file ?? null,
      oom: memEvents?.oom ?? null,
      oomKill: memEvents?.oom_kill ?? null,
      cpuCores: quota > 0 && period > 0 ? quota / period : null,
      cpuUsageUsec: cpuStat?.usage_usec ?? null,
      nrPeriods: cpuStat?.nr_periods ?? null,
      nrThrottled: cpuStat?.nr_throttled ?? null,
      throttledUsec: cpuStat?.throttled_usec ?? null,
    };
  }

  const memLimit = readNumber(`${root}/memory/memory.limit_in_bytes`);
  const memUsage = readNumber(`${root}/memory/memory.usage_in_bytes`);
  if (memLimit === null && memUsage === null) return null;
  const cpuDir =
    readText(`${root}/cpu/cpu.cfs_quota_us`) !== null ? `${root}/cpu` : `${root}/cpu,cpuacct`;
  const quota = readNumber(`${cpuDir}/cpu.cfs_quota_us`);
  const period = readNumber(`${cpuDir}/cpu.cfs_period_us`);
  const cpuStat = readKeyed(`${cpuDir}/cpu.stat`);
  const memStat = readKeyed(`${root}/memory/memory.stat`);
  const oomControl = readKeyed(`${root}/memory/memory.oom_control`);
  const usageNs =
    readNumber(`${cpuDir}/cpuacct.usage`) ?? readNumber(`${root}/cpuacct/cpuacct.usage`);
  return {
    version: 1,
    memoryMax: unlimited(memLimit),
    memoryCurrent: memUsage,
    memoryAnon: memStat?.rss ?? null,
    memoryFile: memStat?.cache ?? null,
    oom: null,
    oomKill: oomControl?.oom_kill ?? null,
    cpuCores: quota !== null && quota > 0 && period ? quota / period : null,
    cpuUsageUsec: usageNs === null ? null : usageNs / 1000,
    nrPeriods: cpuStat?.nr_periods ?? null,
    nrThrottled: cpuStat?.nr_throttled ?? null,
    throttledUsec: cpuStat?.throttled_time === undefined ? null : cpuStat.throttled_time / 1000,
  };
}

/* ─── GC kinds ───────────────────────────────────────────────────────────── */

function gcKindName(kind: number | undefined): string {
  switch (kind) {
    case perfConstants.NODE_PERFORMANCE_GC_MINOR:
      return 'minor';
    case perfConstants.NODE_PERFORMANCE_GC_MAJOR:
      return 'major';
    case perfConstants.NODE_PERFORMANCE_GC_INCREMENTAL:
      return 'incremental';
    case perfConstants.NODE_PERFORMANCE_GC_WEAKCB:
      return 'weakcb';
    default:
      return 'other';
  }
}

function newGc(): GcStats {
  return { count: 0, pauseMs: 0, byKind: {} };
}

/* ─── Collector ──────────────────────────────────────────────────────────── */

interface RouteStat {
  route: string;
  method: string;
  hist: HistogramData;
  errors4xx: number;
  errors5xx: number;
  queries: number;
}

interface OpStat {
  hist: HistogramData;
  errors: number;
}

interface MinuteAcc {
  requests: number;
  s4xx: number;
  s5xx: number;
  lat: HistogramData;
  dbQueries: number;
  dbMs: number;
  slow: number;
}

const newMinute = (): MinuteAcc => ({
  requests: 0,
  s4xx: 0,
  s5xx: 0,
  lat: newHistogram(),
  dbQueries: 0,
  dbMs: 0,
  slow: 0,
});

type GaugeValue = number | (() => number | null | undefined);

export interface CollectorOptions {
  service?: string;
  slowQueryMs?: number;
}

export class Collector {
  service: string;
  readonly startedAt = Date.now();
  readonly slowQueryMs: number;
  started = false;

  private eld: ReturnType<typeof monitorEventLoopDelay> | null = null;
  private gcObserver: PerformanceObserver | null = null;
  private alignTimer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;

  // Request side.
  private totals = newHistogram();
  private total = { count: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, s429: 0, queries: 0 };
  private routes = new Map<string, RouteStat>();
  private cur = newMinute();
  private series: MinuteBucket[] = [];

  // Database side.
  private ops = new Map<string, OpStat>();
  private dbTotal = { count: 0, errors: 0, totalMs: 0, slow: 0 };
  private slow = new Ring<SlowQuery>(RING_SIZE);

  // Everything else.
  private errors = new Ring<ErrorEntry>(RING_SIZE);
  private cache = new Map<string, Record<CacheKind, number>>();
  private cacheTotal = zeroCache();
  private counters = new Map<string, number>();
  private gauges = new Map<string, GaugeValue>();

  // Runtime sampling.
  private gcTotal = newGc();
  private gcMinute = newGc();
  private gcLastMinute: GcStats | null = null;
  private elLastMinute: EventLoopStats | null = null;
  private eluLastMinute: number | null = null;
  private cpuLastMinute: number | null = null;
  private eluMinuteMark: EventLoopUtilization = performance.eventLoopUtilization();
  private cpuMinuteMark = { usage: process.cpuUsage(), t: performance.now() };
  private cpuRecent = {
    mark: { usage: process.cpuUsage(), t: performance.now() },
    total: 0,
    user: 0,
    system: 0,
  };
  private eluRecent = { mark: performance.eventLoopUtilization(), t: performance.now(), value: 0 };
  private cgroupMark: CgroupReading | null = null;
  private cgroupMarkAt = 0;
  private cgroupLastMinute: { throttledPct: number | null; cores: number | null } | null = null;
  private cgroupCache: { at: number; value: CgroupReading | null } | null = null;

  constructor(opts: CollectorOptions = {}) {
    this.service = opts.service ?? 'unknown';
    const env = Number(process.env.PERF_SLOW_QUERY_MS);
    this.slowQueryMs =
      opts.slowQueryMs ?? (Number.isFinite(env) && env > 0 ? env : DEFAULT_SLOW_QUERY_MS);
  }

  /* — lifecycle — */

  /** Idempotent. Starts the sampling hooks and the minute roller. */
  start(service?: string): void {
    if (service) this.service = service;
    if (this.started) return;
    this.started = true;

    try {
      this.eld = monitorEventLoopDelay({ resolution: 20 });
      this.eld.enable();
    } catch {
      this.eld = null;
    }

    try {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this.onGc(entry);
      });
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch {
      this.gcObserver = null; // unsupported runtime — GC section just stays empty
    }

    this.cgroupMark = readCgroup();
    this.cgroupMarkAt = performance.now();

    // Align the roller to the wall-clock minute so that buckets from different
    // processes carry the same `t` and can be merged by it. After the first
    // aligned roll it is the single plain setInterval.
    const untilNextMinute = 60_000 - (Date.now() % 60_000) + 25;
    this.alignTimer = setTimeout(() => {
      this.roll();
      this.interval = setInterval(() => this.roll(), 60_000);
      this.interval.unref();
    }, untilNextMinute);
    this.alignTimer.unref();
  }

  /** Stop timers and observers. For tests; production processes never stop it. */
  stop(): void {
    if (this.alignTimer) clearTimeout(this.alignTimer);
    if (this.interval) clearInterval(this.interval);
    this.alignTimer = this.interval = null;
    try {
      this.eld?.disable();
    } catch {
      /* already off */
    }
    this.gcObserver?.disconnect();
    this.eld = null;
    this.gcObserver = null;
    this.started = false;
  }

  /* — recording (hot path: keep O(1)) — */

  recordRequest(r: RequestRecord): void {
    const status = r.status || 200;
    const ms = r.durationMs;
    const queries = r.queries ?? 0;
    const cls = classOf(status);

    observe(this.totals, ms);
    this.total.count++;
    if (cls === 2) this.total.s2xx++;
    else if (cls === 3) this.total.s3xx++;
    else if (cls === 4) this.total.s4xx++;
    else this.total.s5xx++;
    if (status === 429) this.total.s429++;
    this.total.queries += queries;

    const method = r.method && KNOWN_METHODS.has(r.method) ? r.method : r.method ? 'OTHER' : 'GET';
    let key = `${method} ${r.route}`;
    let stat = this.routes.get(key);
    if (!stat) {
      if (this.routes.size >= MAX_ROUTES) {
        key = 'other';
        stat = this.routes.get(key);
      }
      if (!stat) {
        stat = {
          route: key === 'other' ? 'other' : r.route,
          method: key === 'other' ? '*' : method,
          hist: newHistogram(),
          errors4xx: 0,
          errors5xx: 0,
          queries: 0,
        };
        this.routes.set(key, stat);
      }
    }
    observe(stat.hist, ms);
    stat.queries += queries;
    if (cls === 4) stat.errors4xx++;
    else if (cls === 5) stat.errors5xx++;

    const m = this.cur;
    m.requests++;
    if (cls === 4) m.s4xx++;
    else if (cls === 5) m.s5xx++;
    observe(m.lat, ms);
  }

  recordQuery(q: QueryRecord): void {
    let key = q.op;
    let stat = this.ops.get(key);
    if (!stat) {
      if (this.ops.size >= MAX_OPS) {
        key = 'other';
        stat = this.ops.get(key);
      }
      if (!stat) {
        stat = { hist: newHistogram(), errors: 0 };
        this.ops.set(key, stat);
      }
    }
    observe(stat.hist, q.durationMs);
    if (!q.ok) {
      stat.errors++;
      this.dbTotal.errors++;
    }
    this.dbTotal.count++;
    this.dbTotal.totalMs += q.durationMs;
    this.cur.dbQueries++;
    this.cur.dbMs += q.durationMs;

    if (q.durationMs >= this.slowQueryMs) {
      this.dbTotal.slow++;
      this.cur.slow++;
      this.slow.push({
        op: q.op,
        ms: round1(q.durationMs),
        route: q.label ?? '',
        at: Date.now(),
      });
    }
  }

  recordError(e: ErrorRecord): void {
    this.errors.push({
      at: Date.now(),
      route: e.route,
      status: e.status,
      message:
        e.message.length > ERROR_MESSAGE_MAX ? e.message.slice(0, ERROR_MESSAGE_MAX) : e.message,
      traceId: e.traceId ?? null,
    });
  }

  recordCache(kind: CacheKind, namespace = '_'): void {
    this.cacheTotal[kind]++;
    let row = this.cache.get(namespace);
    if (!row) {
      if (this.cache.size >= MAX_CACHE_NAMESPACES) {
        namespace = '_other';
        row = this.cache.get(namespace);
      }
      if (!row) {
        row = zeroCache();
        this.cache.set(namespace, row);
      }
    }
    row[kind]++;
  }

  recordCounter(name: string, by = 1): void {
    let key = name;
    let cur = this.counters.get(key);
    if (cur === undefined && this.counters.size >= MAX_COUNTERS) {
      key = '_other';
      cur = this.counters.get(key);
    }
    this.counters.set(key, (cur ?? 0) + by);
  }

  setGauge(name: string, value: GaugeValue): void {
    if (!this.gauges.has(name) && this.gauges.size >= MAX_GAUGES) return;
    this.gauges.set(name, value);
  }

  private onGc(entry: { duration: number; detail?: unknown; kind?: number }): void {
    const kind = gcKindName((entry.detail as { kind?: number } | undefined)?.kind ?? entry.kind);
    for (const acc of [this.gcTotal, this.gcMinute]) {
      acc.count++;
      acc.pauseMs += entry.duration;
      const row = (acc.byKind[kind] ??= { count: 0, pauseMs: 0 });
      row.count++;
      row.pauseMs += entry.duration;
    }
  }

  /* — minute roller — */

  private eventLoopStats(reset: boolean): EventLoopStats {
    const h = this.eld;
    // An empty monitor reports a huge `min` and NaN mean — treat as zeros.
    if (!h || !(h.max > 0)) return { p50: 0, p90: 0, p99: 0, max: 0, mean: 0 };
    const ms = (ns: number) => round2(finite(ns) / 1e6);
    const stats = {
      p50: ms(h.percentile(50)),
      p90: ms(h.percentile(90)),
      p99: ms(h.percentile(99)),
      max: ms(h.max),
      mean: ms(h.mean),
    };
    if (reset) h.reset();
    return stats;
  }

  /**
   * Close the current minute into a bucket. Called by the roller; exposed so
   * tests can drive time (`now` is the moment the minute ended).
   */
  roll(now = Date.now()): void {
    const acc = this.cur;
    this.cur = newMinute();

    const el = this.eventLoopStats(true);
    this.elLastMinute = el;

    const eluNow = performance.eventLoopUtilization();
    const elu = performance.eventLoopUtilization(eluNow, this.eluMinuteMark).utilization;
    this.eluMinuteMark = eluNow;
    this.eluLastMinute = round2(finite(elu));

    const hr = performance.now();
    const cpuDelta = process.cpuUsage(this.cpuMinuteMark.usage);
    const wallMs = Math.max(hr - this.cpuMinuteMark.t, 1);
    const cpuPct = ((cpuDelta.user + cpuDelta.system) / 1000 / wallMs) * 100;
    this.cpuMinuteMark = { usage: process.cpuUsage(), t: hr };
    this.cpuLastMinute = round1(finite(cpuPct));

    this.gcLastMinute = this.gcMinute;
    this.gcMinute = newGc();

    try {
      const reading = readCgroup();
      if (reading && this.cgroupMark) {
        const dPeriods = (reading.nrPeriods ?? 0) - (this.cgroupMark.nrPeriods ?? 0);
        const dThrottled = (reading.nrThrottled ?? 0) - (this.cgroupMark.nrThrottled ?? 0);
        const dUsage = (reading.cpuUsageUsec ?? 0) - (this.cgroupMark.cpuUsageUsec ?? 0);
        const dWallUsec = Math.max(hr - this.cgroupMarkAt, 1) * 1000;
        this.cgroupLastMinute = {
          throttledPct:
            reading.nrPeriods === null || dPeriods <= 0
              ? null
              : round1(Math.min(100, (dThrottled / dPeriods) * 100)),
          cores: reading.cpuUsageUsec === null ? null : round2(dUsage / dWallUsec),
        };
      }
      this.cgroupMark = reading;
      this.cgroupMarkAt = hr;
    } catch {
      this.cgroupLastMinute = null;
    }

    const mem = process.memoryUsage();
    const p50 = percentile(acc.lat, 50);
    const p95 = percentile(acc.lat, 95);

    this.series.push({
      t: Math.round(now / 60_000) * 60_000 - 60_000,
      requests: acc.requests,
      s4xx: acc.s4xx,
      s5xx: acc.s5xx,
      p50: round1(p50),
      p95: round1(p95),
      eventLoopP99: el.p99,
      elu: this.eluLastMinute,
      cpu: this.cpuLastMinute,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      dbQueries: acc.dbQueries,
      dbMs: round1(acc.dbMs),
      dbAvgMs: acc.dbQueries ? round2(acc.dbMs / acc.dbQueries) : 0,
      slowQueries: acc.slow,
      lat: acc.lat.counts,
    });
    if (this.series.length > SERIES_MINUTES)
      this.series.splice(0, this.series.length - SERIES_MINUTES);
  }

  /* — snapshot — */

  /**
   * A rate over "the recent window" that does not depend on who asks.
   *
   * Snapshots are taken by the 10 s Redis publisher AND by admin requests; if
   * each call measured "since the previous call" the numbers would depend on
   * which caller came last. Instead the window only advances once it is at least
   * `RECENT_MIN_MS` old, and in between callers get the last computed value.
   */
  private recentCpu(): { total: number; user: number; system: number } {
    const hr = performance.now();
    const elapsed = hr - this.cpuRecent.mark.t;
    if (elapsed >= RECENT_MIN_MS || (this.cpuRecent.total === 0 && elapsed >= 1000)) {
      const d = process.cpuUsage(this.cpuRecent.mark.usage);
      this.cpuRecent.user = finite((d.user / 1000 / elapsed) * 100);
      this.cpuRecent.system = finite((d.system / 1000 / elapsed) * 100);
      this.cpuRecent.total = this.cpuRecent.user + this.cpuRecent.system;
      if (elapsed >= RECENT_MIN_MS) this.cpuRecent.mark = { usage: process.cpuUsage(), t: hr };
    }
    return this.cpuRecent;
  }

  private recentElu(): number {
    const hr = performance.now();
    const elapsed = hr - this.eluRecent.t;
    if (elapsed >= RECENT_MIN_MS || (this.eluRecent.value === 0 && elapsed >= 1000)) {
      const now = performance.eventLoopUtilization();
      this.eluRecent.value = finite(
        performance.eventLoopUtilization(now, this.eluRecent.mark).utilization,
      );
      if (elapsed >= RECENT_MIN_MS) {
        this.eluRecent.mark = now;
        this.eluRecent.t = hr;
      }
    }
    return this.eluRecent.value;
  }

  private cgroupNow(): CgroupSnapshot | null {
    const t = performance.now();
    if (!this.cgroupCache || t - this.cgroupCache.at > CGROUP_CACHE_MS) {
      this.cgroupCache = { at: t, value: readCgroup() };
    }
    const reading = this.cgroupCache.value;
    if (!reading) return null;
    return {
      ...reading,
      throttledPctLastMinute: this.cgroupLastMinute?.throttledPct ?? null,
      cpuCoresUsedLastMinute: this.cgroupLastMinute?.cores ?? null,
    };
  }

  snapshot(): ProcessSnapshot {
    const now = Date.now();
    const mem = process.memoryUsage();
    const heap = getHeapStatistics();
    const cpuTotals = process.cpuUsage();
    const cpuRecent = this.recentCpu();

    const routes: RouteRow[] = [];
    for (const stat of this.routes.values()) {
      const h = stat.hist;
      routes.push({
        route: stat.route,
        method: stat.method,
        count: h.count,
        errors5xx: stat.errors5xx,
        errors4xx: stat.errors4xx,
        avgMs: round1(mean(h)),
        p50: round1(percentile(h, 50)),
        p95: round1(percentile(h, 95)),
        p99: round1(percentile(h, 99)),
        maxMs: round1(h.max),
        sumMs: round1(h.sum),
        queries: stat.queries,
        avgQueries: h.count ? round2(stat.queries / h.count) : 0,
        buckets: h.counts.slice(),
      });
    }
    routes.sort((a, b) => b.count - a.count);

    const ops: OpRow[] = [];
    for (const [op, stat] of this.ops) {
      const h = stat.hist;
      ops.push({
        op,
        count: h.count,
        errors: stat.errors,
        avgMs: round2(mean(h)),
        p95: round2(percentile(h, 95)),
        maxMs: round1(h.max),
        totalMs: round1(h.sum),
        buckets: h.counts.slice(),
      });
    }
    ops.sort((a, b) => b.totalMs - a.totalMs);

    const handles: Record<string, number> = {};
    try {
      for (const name of process.getActiveResourcesInfo()) handles[name] = (handles[name] ?? 0) + 1;
    } catch {
      /* older runtime */
    }

    const gauges: Record<string, number | null> = {};
    for (const [name, v] of this.gauges) {
      try {
        const value = typeof v === 'function' ? v() : v;
        gauges[name] = typeof value === 'number' && Number.isFinite(value) ? value : null;
      } catch {
        gauges[name] = null;
      }
    }

    const cache: ProcessSnapshot['cache']['namespaces'] = {};
    for (const [ns, row] of this.cache) cache[ns] = { ...row };

    const t = this.totals;
    return {
      schema: 1,
      generatedAt: now,
      service: this.service,
      pid: process.pid,
      hostname: hostname(),
      nodeVersion: process.version,
      startedAt: this.startedAt,
      uptimeSec: Math.round(process.uptime()),
      clusterWorkerId: cluster.worker?.id ?? process.env.NITRO_CLUSTER_WORKER_ID ?? null,
      cpu: {
        percent: round1(cpuRecent.total),
        userPercent: round1(cpuRecent.user),
        systemPercent: round1(cpuRecent.system),
        lastMinutePercent: this.cpuLastMinute,
        userMsTotal: Math.round(cpuTotals.user / 1000),
        systemMsTotal: Math.round(cpuTotals.system / 1000),
      },
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers,
        heapLimit: heap.heap_size_limit,
        mallocedMemory: heap.malloced_memory,
        detachedContexts: heap.number_of_detached_contexts,
        heapSpaces: getHeapSpaceStatistics().map((s) => ({
          name: s.space_name,
          size: s.space_size,
          used: s.space_used_size,
          available: s.space_available_size,
        })),
      },
      eventLoop: {
        current: this.eventLoopStats(false),
        lastMinute: this.elLastMinute,
        eluRecent: round2(this.recentElu()),
        eluLastMinute: this.eluLastMinute,
      },
      gc: {
        total: JSON.parse(JSON.stringify(this.gcTotal)) as GcStats,
        lastMinute: this.gcLastMinute,
      },
      handles,
      os: { loadavg: loadavg(), cpus: cpus().length, totalmem: totalmem(), freemem: freemem() },
      cgroup: this.cgroupNow(),
      requests: {
        ...this.total,
        sumMs: round1(t.sum),
        avgMs: round1(mean(t)),
        p50: round1(percentile(t, 50)),
        p95: round1(percentile(t, 95)),
        p99: round1(percentile(t, 99)),
        maxMs: round1(t.max),
        buckets: t.counts.slice(),
      },
      routes,
      timeseries: this.series.slice(),
      db: {
        totals: {
          ...this.dbTotal,
          totalMs: round1(this.dbTotal.totalMs),
          avgMs: this.dbTotal.count ? round2(this.dbTotal.totalMs / this.dbTotal.count) : 0,
        },
        ops,
        slowQueries: this.slow.newestFirst(),
        slowThresholdMs: this.slowQueryMs,
      },
      cache: { total: { ...this.cacheTotal }, namespaces: cache },
      counters: Object.fromEntries(this.counters),
      gauges,
      errors: this.errors.newestFirst(),
    };
  }
}

/* ─── Process-wide singleton + safe entry points ─────────────────────────── */

// Held on `globalThis` behind a registered symbol so HMR re-evaluation, or two
// copies of this module in one process (a Nitro chunk and a lazily imported
// one), share a single collector instead of each counting half the traffic.
const SINGLETON = Symbol.for('rmh.perf.processMetrics');

function collector(): Collector {
  const g = globalThis as unknown as Record<symbol, Collector | undefined>;
  return (g[SINGLETON] ??= new Collector());
}

/** Idempotent. Call once at process start, e.g. `startProcessMetrics({ service: 'web' })`. */
export function startProcessMetrics(opts: { service: string }): void {
  try {
    collector().start(opts.service);
  } catch {
    /* telemetry must never stop a process from booting */
  }
}

export function recordRequest(r: RequestRecord): void {
  try {
    collector().recordRequest(r);
  } catch {
    /* never throw into a request */
  }
}

export function recordQuery(q: QueryRecord): void {
  try {
    collector().recordQuery(q);
  } catch {
    /* never throw into a query */
  }
}

export function recordError(e: ErrorRecord): void {
  try {
    collector().recordError(e);
  } catch {
    /* swallow */
  }
}

export function recordCache(kind: CacheKind, namespace?: string): void {
  try {
    collector().recordCache(kind, namespace);
  } catch {
    /* swallow */
  }
}

export function recordCounter(name: string, by = 1): void {
  try {
    collector().recordCounter(name, by);
  } catch {
    /* swallow */
  }
}

export function setGauge(name: string, valueOrFn: GaugeValue): void {
  try {
    collector().setGauge(name, valueOrFn);
  } catch {
    /* swallow */
  }
}

/** Cache namespace of a key: everything before the first `:` (or the whole key). */
export function cacheNamespace(key: string): string {
  const i = key.indexOf(':');
  return i === -1 ? key : key.slice(0, i);
}

/** This process's current state, JSON-serialisable. */
export function snapshotProcess(): ProcessSnapshot {
  return collector().snapshot();
}

/* ─── Cluster merge ──────────────────────────────────────────────────────── */

export interface ClusterSnapshot {
  generatedAt: number;
  processes: number;
  services: string[];
  requests: RequestTotals;
  routes: RouteRow[];
  timeseries: MinuteBucket[];
  db: {
    totals: { count: number; errors: number; totalMs: number; avgMs: number; slow: number };
    ops: OpRow[];
    slowQueries: SlowQuery[];
  };
  cache: ProcessSnapshot['cache'];
  counters: Record<string, number>;
  gauges: Record<string, number>;
  memory: { rss: number; heapUsed: number; heapTotal: number; heapLimit: number; external: number };
  cpu: { percent: number; lastMinutePercent: number };
  eventLoop: { p99Max: number; maxMs: number; eluMax: number; lastMinuteP99Max: number };
  cgroup: CgroupSnapshot | null;
  errors: ErrorEntry[];
}

function sumInto(target: Record<string, number>, source: Record<string, number> | undefined): void {
  if (!source) return;
  for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + (v ?? 0);
}

/**
 * Fold several process snapshots into one cluster view.
 *
 * Counts add; percentiles are recomputed from the SUMMED histogram buckets (never
 * averaged); for "is anything unhealthy" figures — event-loop p99, ELU — the worst
 * process wins, because one blocked worker is a problem however idle its sibling is.
 * Tolerates missing fields so a snapshot from an older build still merges.
 */
export function mergeSnapshots(snaps: ProcessSnapshot[]): ClusterSnapshot {
  const reqHist = newHistogram();
  const total = { count: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, s429: 0, queries: 0 };
  const routeMap = new Map<string, RouteRow & { hist: HistogramData }>();
  const opMap = new Map<string, OpRow & { hist: HistogramData }>();
  const seriesMap = new Map<number, MinuteBucket & { hist: HistogramData }>();
  const dbTotals = { count: 0, errors: 0, totalMs: 0, slow: 0 };
  const cacheTotal = zeroCache();
  const cacheNs: Record<string, Record<CacheKind, number>> = {};
  const counters: Record<string, number> = {};
  const gauges: Record<string, number> = {};
  const slowQueries: SlowQuery[] = [];
  const errors: ErrorEntry[] = [];
  const memory = { rss: 0, heapUsed: 0, heapTotal: 0, heapLimit: 0, external: 0 };
  const cpu = { percent: 0, lastMinutePercent: 0 };
  const eventLoop = { p99Max: 0, maxMs: 0, eluMax: 0, lastMinuteP99Max: 0 };
  let cgroup: CgroupSnapshot | null = null;
  let maxMs = 0;
  let sumMs = 0;

  for (const s of snaps) {
    const r = s.requests;
    if (r) {
      total.count += r.count ?? 0;
      total.s2xx += r.s2xx ?? 0;
      total.s3xx += r.s3xx ?? 0;
      total.s4xx += r.s4xx ?? 0;
      total.s5xx += r.s5xx ?? 0;
      total.s429 += r.s429 ?? 0;
      total.queries += r.queries ?? 0;
      maxMs = Math.max(maxMs, r.maxMs ?? 0);
      sumMs += r.sumMs ?? 0;
      const h = fromCounts(r.buckets ?? [], r.sumMs ?? 0, r.maxMs ?? 0);
      const merged = mergeHistograms(reqHist, h);
      reqHist.counts = merged.counts;
      reqHist.count = merged.count;
      reqHist.sum = merged.sum;
      reqHist.max = merged.max;
    }

    for (const row of s.routes ?? []) {
      const key = `${row.method} ${row.route}`;
      const h = fromCounts(row.buckets ?? [], row.sumMs ?? 0, row.maxMs ?? 0);
      const prev = routeMap.get(key);
      if (!prev) {
        routeMap.set(key, { ...row, hist: h });
      } else {
        prev.hist = mergeHistograms(prev.hist, h);
        prev.errors4xx += row.errors4xx;
        prev.errors5xx += row.errors5xx;
        prev.queries += row.queries;
      }
    }

    for (const row of s.db?.ops ?? []) {
      const h = fromCounts(row.buckets ?? [], row.totalMs ?? 0, row.maxMs ?? 0);
      const prev = opMap.get(row.op);
      if (!prev) opMap.set(row.op, { ...row, hist: h });
      else {
        prev.hist = mergeHistograms(prev.hist, h);
        prev.errors += row.errors;
      }
    }
    if (s.db?.totals) {
      dbTotals.count += s.db.totals.count;
      dbTotals.errors += s.db.totals.errors;
      dbTotals.totalMs += s.db.totals.totalMs;
      dbTotals.slow += s.db.totals.slow;
    }
    for (const q of s.db?.slowQueries ?? [])
      slowQueries.push({ ...q, service: s.service, pid: s.pid });
    for (const e of s.errors ?? []) errors.push({ ...e, service: s.service, pid: s.pid });

    for (const b of s.timeseries ?? []) {
      const prev = seriesMap.get(b.t);
      const h = fromCounts(b.lat ?? []);
      if (!prev) {
        seriesMap.set(b.t, { ...b, hist: h });
      } else {
        prev.requests += b.requests;
        prev.s4xx += b.s4xx;
        prev.s5xx += b.s5xx;
        prev.hist = mergeHistograms(prev.hist, h);
        prev.eventLoopP99 = Math.max(prev.eventLoopP99, b.eventLoopP99);
        prev.elu = Math.max(prev.elu, b.elu);
        prev.cpu += b.cpu;
        prev.rss += b.rss;
        prev.heapUsed += b.heapUsed;
        prev.dbQueries += b.dbQueries;
        prev.dbMs += b.dbMs;
        prev.slowQueries += b.slowQueries;
      }
    }

    for (const kind of ['l1_hit', 'l2_hit', 'miss', 'stale'] as const) {
      cacheTotal[kind] += s.cache?.total?.[kind] ?? 0;
    }
    for (const [ns, row] of Object.entries(s.cache?.namespaces ?? {})) {
      const into = (cacheNs[ns] ??= zeroCache());
      for (const kind of ['l1_hit', 'l2_hit', 'miss', 'stale'] as const)
        into[kind] += row[kind] ?? 0;
    }
    sumInto(counters, s.counters);
    for (const [k, v] of Object.entries(s.gauges ?? {})) {
      if (typeof v === 'number') gauges[k] = (gauges[k] ?? 0) + v;
    }

    if (s.memory) {
      memory.rss += s.memory.rss;
      memory.heapUsed += s.memory.heapUsed;
      memory.heapTotal += s.memory.heapTotal;
      memory.heapLimit += s.memory.heapLimit;
      memory.external += s.memory.external;
    }
    cpu.percent += s.cpu?.percent ?? 0;
    cpu.lastMinutePercent += s.cpu?.lastMinutePercent ?? 0;
    eventLoop.p99Max = Math.max(eventLoop.p99Max, s.eventLoop?.current?.p99 ?? 0);
    eventLoop.maxMs = Math.max(eventLoop.maxMs, s.eventLoop?.current?.max ?? 0);
    eventLoop.eluMax = Math.max(eventLoop.eluMax, s.eventLoop?.eluRecent ?? 0);
    eventLoop.lastMinuteP99Max = Math.max(
      eventLoop.lastMinuteP99Max,
      s.eventLoop?.lastMinute?.p99 ?? 0,
    );

    // Workers in one container read the same cgroup; keep the fullest reading.
    if (s.cgroup && (!cgroup || (s.cgroup.memoryCurrent ?? 0) > (cgroup.memoryCurrent ?? 0))) {
      cgroup = s.cgroup;
    }
  }

  const routes: RouteRow[] = [...routeMap.values()].map(({ hist, ...row }) => ({
    ...row,
    count: hist.count,
    avgMs: round1(mean(hist)),
    p50: round1(percentile(hist, 50)),
    p95: round1(percentile(hist, 95)),
    p99: round1(percentile(hist, 99)),
    maxMs: round1(hist.max),
    sumMs: round1(hist.sum),
    avgQueries: hist.count ? round2(row.queries / hist.count) : 0,
    buckets: hist.counts,
  }));
  routes.sort((a, b) => b.count - a.count);

  const ops: OpRow[] = [...opMap.values()].map(({ hist, ...row }) => ({
    ...row,
    count: hist.count,
    avgMs: round2(mean(hist)),
    p95: round2(percentile(hist, 95)),
    maxMs: round1(hist.max),
    totalMs: round1(hist.sum),
    buckets: hist.counts,
  }));
  ops.sort((a, b) => b.totalMs - a.totalMs);

  const timeseries: MinuteBucket[] = [...seriesMap.values()]
    .sort((a, b) => a.t - b.t)
    .slice(-SERIES_MINUTES)
    .map(({ hist, ...b }) => ({
      ...b,
      p50: round1(percentile(hist, 50)),
      p95: round1(percentile(hist, 95)),
      dbAvgMs: b.dbQueries ? round2(b.dbMs / b.dbQueries) : 0,
      lat: hist.counts,
    }));

  slowQueries.sort((a, b) => b.at - a.at);
  errors.sort((a, b) => b.at - a.at);

  return {
    generatedAt: Date.now(),
    processes: snaps.length,
    services: [...new Set(snaps.map((s) => s.service))],
    requests: {
      ...total,
      sumMs: round1(sumMs),
      avgMs: round1(mean(reqHist)),
      p50: round1(percentile(reqHist, 50)),
      p95: round1(percentile(reqHist, 95)),
      p99: round1(percentile(reqHist, 99)),
      maxMs: round1(maxMs),
      buckets: reqHist.counts,
    },
    routes,
    timeseries,
    db: {
      totals: {
        ...dbTotals,
        totalMs: round1(dbTotals.totalMs),
        avgMs: dbTotals.count ? round2(dbTotals.totalMs / dbTotals.count) : 0,
      },
      ops,
      slowQueries: slowQueries.slice(0, RING_SIZE),
    },
    cache: { total: cacheTotal, namespaces: cacheNs },
    counters,
    gauges,
    memory,
    cpu: { percent: round1(cpu.percent), lastMinutePercent: round1(cpu.lastMinutePercent) },
    eventLoop,
    cgroup,
    errors: errors.slice(0, RING_SIZE),
  };
}
