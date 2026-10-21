// Application alarm rules — what in the app's own telemetry pages on-call.
//
// Pure: inputs in, alarm transitions out, so every threshold is unit-tested and
// readable in one place (docs/runbooks/oncall/README.md lists the same IDs).
// `checks.server.ts` gathers the inputs once a minute in the jobs worker and
// sends the transitions to the watchdog.
//
// Each rule yields a CONDITION per check; `Debouncer` turns conditions into
// fire/resolve transitions: a condition must hold `forChecks` checks in a row
// to fire and be false `clearChecks` in a row to resolve, so one bad minute
// never pages. A firing alarm is re-sent every REFRESH_MS so the watchdog's
// copy survives a lost request.
//
// Pure and client-safe (type imports + the pure histogram module only).

import { fromCounts, mergeHistograms, newHistogram, percentile } from '../perf/histogram';
import type { PerfOverview } from '../perf/admin-types';
import type { MinuteBucket, ProcessSnapshot } from '../perf/process-metrics';

export const REFRESH_MS = 10 * 60 * 1000;
export const STRIPE_WEBHOOK_ROUTE = '/api/auth/stripe/webhook';
/** Queues whose failures move money; any failure pages. */
export const MONEY_QUEUE_PREFIX = 'economy.';

export interface QueueFacts {
  name: string;
  failedCount: number;
  readyCount: number;
}

export interface CheckInputs {
  now: number;
  /** null when collection failed: perf rules hold their state this check. */
  overview: PerfOverview | null;
  db: { backends: number; maxConnections: number } | null;
  queues: QueueFacts[] | null;
  /** Age of the oldest undelivered, not-dead outbox row; 0 when none; null if unknown. */
  outboxOldestPendingMs: number | null;
}

export interface Condition {
  id: string;
  instance?: string;
  sev: number;
  title: string;
  active: boolean;
  detail: string;
  forChecks: number;
  clearChecks: number;
}

/** Memory carried between checks (cumulative counters → deltas). */
export interface RuleMemory {
  /** Per process (service:hostname:pid) cumulative counter values last seen. */
  lastCounters: Record<string, Record<string, number>>;
  /** Per queue failedCount last seen. */
  lastFailed: Record<string, number>;
  /** Rolling per-check deltas, newest last. */
  windows: Record<string, number[]>;
}

export const newMemory = (): RuleMemory => ({ lastCounters: {}, lastFailed: {}, windows: {} });

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const round = (n: number) => Math.round(n * 10) / 10;

function pushWindow(mem: RuleMemory, key: string, value: number, size: number): number {
  const w = (mem.windows[key] ??= []);
  w.push(value);
  while (w.length > size) w.shift();
  return w.reduce((a, b) => a + b, 0);
}

/** Increase of a cumulative per-process counter since the last check (a restarted process starts from 0). */
function counterDelta(mem: RuleMemory, snaps: ProcessSnapshot[], read: (s: ProcessSnapshot) => number, name: string): number {
  let total = 0;
  for (const s of snaps) {
    const key = `${s.service}:${s.hostname}:${s.pid}`;
    const cur = read(s);
    const prev = mem.lastCounters[key]?.[name];
    (mem.lastCounters[key] ??= {})[name] = cur;
    if (prev === undefined) continue; // first sighting: baseline only
    total += cur >= prev ? cur - prev : cur;
  }
  return total;
}

/** Complete one-minute buckets in the last `minutes`. */
function lastMinutes(series: MinuteBucket[], now: number, minutes: number): MinuteBucket[] {
  return series.filter((b) => b.t + 60_000 <= now && b.t >= now - (minutes + 1) * 60_000).slice(-minutes);
}

function windowStats(buckets: MinuteBucket[]) {
  const requests = buckets.reduce((n, b) => n + b.requests, 0);
  const s5xx = buckets.reduce((n, b) => n + b.s5xx, 0);
  const hist = buckets.reduce((acc, b) => mergeHistograms(acc, fromCounts(b.lat)), newHistogram());
  return { requests, s5xx, p95: hist.count ? percentile(hist, 95) : 0 };
}

export function evaluate(input: CheckInputs, mem: RuleMemory): Condition[] {
  const out: Condition[] = [];
  const o = input.overview;

  if (o) {
    // ── Web 5xx and latency (cluster of web workers) ──────────────────────────
    const short = windowStats(lastMinutes(o.cluster.timeseries, input.now, 3));
    const long = windowStats(lastMinutes(o.cluster.timeseries, input.now, 10));
    const shortBad = short.requests >= 50 && pct(short.s5xx, short.requests) > 5;
    const longBad = long.requests >= 200 && pct(long.s5xx, long.requests) > 2;
    out.push({
      id: 'A08',
      sev: 2,
      title: 'Web 5xx error rate high',
      active: shortBad || longBad,
      detail: `5xx: ${round(pct(short.s5xx, short.requests))}% of ${short.requests} requests (last 3m), ${round(pct(long.s5xx, long.requests))}% of ${long.requests} (last 10m). Thresholds: >5% / 3m, >2% / 10m.`,
      forChecks: 1, // the 3- and 10-minute windows already smooth it
      clearChecks: 3,
    });
    out.push({
      id: 'A09',
      sev: 2,
      title: 'Web latency high (p95)',
      active: long.requests >= 100 && long.p95 > 2500,
      detail: `p95 ${Math.round(long.p95)}ms over the last 10m (${long.requests} requests). Threshold: 2500ms.`,
      forChecks: 1,
      clearChecks: 3,
    });

    // ── Per-service process health (web, jobs, hubs) ──────────────────────────
    const snaps = [...o.processes, ...o.hubs.filter((h): h is ProcessSnapshot => !('error' in h))];
    // Forget processes that are gone (restarts mint new pids), so memory stays bounded.
    const present = new Set(snaps.map((s) => `${s.service}:${s.hostname}:${s.pid}`));
    for (const key of Object.keys(mem.lastCounters)) if (!present.has(key)) delete mem.lastCounters[key];
    const byService = new Map<string, ProcessSnapshot[]>();
    for (const s of snaps) byService.set(s.service, [...(byService.get(s.service) ?? []), s]);
    for (const [service, list] of byService) {
      const heap = Math.max(...list.map((s) => (s.memory.heapLimit ? pct(s.memory.heapUsed, s.memory.heapLimit) : 0)));
      out.push({
        id: 'B02',
        instance: service,
        sev: 3,
        title: `Heap pressure on ${service}`,
        active: heap > 85,
        detail: `Highest heap use ${round(heap)}% of the V8 limit across ${list.length} process(es). Threshold: >85% for 10m (OOM risk).`,
        forChecks: 10,
        clearChecks: 3,
      });
      const lag = Math.max(...list.map((s) => s.eventLoop.current.p99));
      out.push({
        id: 'B03',
        instance: service,
        sev: 3,
        title: `Event loop lag on ${service}`,
        active: lag > 500,
        detail: `Event-loop delay p99 ${Math.round(lag)}ms. Threshold: >500ms for 5m.`,
        forChecks: 5,
        clearChecks: 3,
      });
    }

    // ── Process-level errors (lib/perf/process-guards.ts counters) ────────────
    const rejections = pushWindow(mem, 'rejections', counterDelta(mem, snaps, (s) => s.counters['process.unhandled_rejection'] ?? 0, 'rej'), 10);
    const uncaught = pushWindow(mem, 'uncaught', counterDelta(mem, snaps, (s) => s.counters['process.uncaught_exception'] ?? 0, 'unc'), 10);
    const poolErrors = pushWindow(mem, 'poolErrors', counterDelta(mem, snaps, (s) => s.counters['db.pool_error'] ?? 0, 'pool'), 10);
    out.push({
      id: 'B14',
      sev: 3,
      title: 'Process errors spiking',
      active: rejections > 20 || uncaught > 0 || poolErrors > 10,
      detail: `Last 10m: ${rejections} unhandled rejections, ${uncaught} uncaught exceptions, ${poolErrors} DB pool errors. Search logs for "unhandled_rejection" / "uncaught_exception" / "db_pool_error".`,
      forChecks: 1,
      clearChecks: 10,
    });

    // ── DB pool saturation (web workers) ──────────────────────────────────────
    const waiting = o.cluster.gauges['db.pool.waiting'];
    if (waiting !== undefined) {
      out.push({
        id: 'A06',
        instance: 'pool',
        sev: 2,
        title: 'Web DB pool saturated',
        active: waiting >= 5,
        detail: `${waiting} requests waiting for a database connection across web workers. Threshold: >=5 for 2m.`,
        forChecks: 2,
        clearChecks: 2,
      });
    }

    // ── Stripe webhook failures ───────────────────────────────────────────────
    const stripeFails = pushWindow(
      mem,
      'stripe',
      counterDelta(
        mem,
        o.processes.filter((s) => s.service === 'web'),
        (s) => {
          const r = s.routes.find((x) => x.route === STRIPE_WEBHOOK_ROUTE);
          return r ? r.errors4xx + r.errors5xx : 0;
        },
        'stripe',
      ),
      15,
    );
    out.push({
      id: 'A17',
      sev: 2,
      title: 'Stripe webhook failing',
      active: stripeFails > 3,
      detail: `${stripeFails} non-2xx responses on ${STRIPE_WEBHOOK_ROUTE} in the last 15m. Stripe retries, then disables the endpoint — check its delivery log.`,
      forChecks: 1,
      clearChecks: 15,
    });
  }

  // ── Postgres connections ───────────────────────────────────────────────────
  if (input.db && input.db.maxConnections > 0) {
    const used = pct(input.db.backends, input.db.maxConnections);
    out.push({
      id: 'A06',
      instance: 'connections',
      sev: 2,
      title: 'Postgres connections near the limit',
      active: used > 85,
      detail: `${input.db.backends} of max_connections ${input.db.maxConnections} in use (${round(used)}%). Threshold: >85% for 3m.`,
      forChecks: 3,
      clearChecks: 2,
    });
  }

  // ── pg-boss queues ─────────────────────────────────────────────────────────
  if (input.queues) {
    for (const q of input.queues) {
      const prev = mem.lastFailed[q.name];
      mem.lastFailed[q.name] = q.failedCount;
      // failedCount is a retained rolling count, so it can drop as old rows age out.
      const fresh = prev === undefined ? 0 : Math.max(0, q.failedCount - prev);
      const recent = pushWindow(mem, `failed:${q.name}`, fresh, 15);
      const money = q.name.startsWith(MONEY_QUEUE_PREFIX);
      out.push({
        id: money ? 'A15' : 'B13',
        instance: q.name,
        sev: money ? 2 : 3,
        title: money ? `Economy job failing: ${q.name}` : `Background job failing: ${q.name}`,
        active: money ? recent > 0 : recent >= 5,
        detail: `${recent} new failed job(s) in ${q.name} in the last 15m (${q.failedCount} retained). ${money ? 'Coins/gifts may not have been applied.' : ''}`.trim(),
        forChecks: 1,
        clearChecks: 15,
      });
      out.push({
        id: 'B13',
        instance: `${q.name}:backlog`,
        sev: 3,
        title: `Job backlog: ${q.name}`,
        active: q.readyCount > 500,
        detail: `${q.readyCount} jobs ready but not picked up in ${q.name}. Threshold: >500 for 15m — is the jobs worker running?`,
        forChecks: 15,
        clearChecks: 3,
      });
    }
  }

  // ── Outbox (webhooks / notifications delivery) ─────────────────────────────
  if (input.outboxOldestPendingMs !== null) {
    out.push({
      id: 'A15',
      instance: 'outbox',
      sev: 2,
      title: 'Outbox delivery stuck',
      active: input.outboxOldestPendingMs > 10 * 60_000,
      detail: `Oldest undelivered outbox event is ${Math.round(input.outboxOldestPendingMs / 60_000)}m old. Threshold: >10m.`,
      forChecks: 2,
      clearChecks: 2,
    });
  }

  return out;
}

export interface Transition {
  state: 'firing' | 'resolved';
  condition: Condition;
}

interface Track {
  streakOn: number;
  streakOff: number;
  firing: boolean;
  lastSentAt: number;
}

/** Turns per-check conditions into debounced fire/resolve transitions. */
export class Debouncer {
  private tracks = new Map<string, Track>();

  static key(c: Pick<Condition, 'id' | 'instance'>): string {
    return c.instance ? `${c.id}:${c.instance}` : c.id;
  }

  step(conditions: Condition[], now: number): Transition[] {
    const out: Transition[] = [];
    for (const c of conditions) {
      const key = Debouncer.key(c);
      const t = this.tracks.get(key) ?? { streakOn: 0, streakOff: 0, firing: false, lastSentAt: 0 };
      if (c.active) {
        t.streakOn += 1;
        t.streakOff = 0;
      } else {
        t.streakOff += 1;
        t.streakOn = 0;
      }
      if (!t.firing && t.streakOn >= c.forChecks) {
        t.firing = true;
        t.lastSentAt = now;
        out.push({ state: 'firing', condition: c });
      } else if (t.firing && t.streakOff >= c.clearChecks) {
        t.firing = false;
        t.lastSentAt = now;
        out.push({ state: 'resolved', condition: c });
      } else if (t.firing && now - t.lastSentAt >= REFRESH_MS) {
        t.lastSentAt = now;
        out.push({ state: 'firing', condition: c });
      }
      this.tracks.set(key, t);
    }
    return out;
  }

  /** Mark a transition as not delivered so the next check retries it. */
  undo(tr: Transition): void {
    const t = this.tracks.get(Debouncer.key(tr.condition));
    if (!t) return;
    if (tr.state === 'firing') {
      t.firing = false;
    } else {
      t.firing = true;
    }
    t.lastSentAt = 0;
  }
}
