/**
 * Pure helpers for the DeepSeek balance history (admin /admin/deepseek).
 * No I/O, so the client page and the unit tests can both import them; the
 * fetching and persistence live in `balance.server.ts`.
 */

export interface BalanceSample {
  createdAt: Date | string;
  currency: string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
  source: string;
}

export interface HourlyPoint {
  /** ISO timestamp of the start of the hour (UTC). */
  hour: string;
  total: number;
  granted: number;
  toppedUp: number;
  source: string;
  /** Change versus the previous point; null for the first one. */
  delta: number | null;
}

export interface BurnSummary {
  /** Total spent (sum of negative deltas) over the window. */
  spent: number;
  /** Hours between the first and last point. */
  spanHours: number;
  perHour: number | null;
  perDay: number | null;
  /** Latest balance divided by burn rate; null when there is no burn. */
  hoursRemaining: number | null;
  daysRemaining: number | null;
  latest: number | null;
  /** Sum of positive deltas (top-ups / grants), shown for context. */
  toppedUp: number;
}

const HOUR_MS = 3_600_000;

/** Truncate to the start of the UTC hour. */
export function hourBucket(date: Date | string | number): Date {
  const ms = new Date(date).getTime();
  return new Date(Math.floor(ms / HOUR_MS) * HOUR_MS);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * One point per hour for one currency: the latest sample inside each hour
 * bucket, oldest first, each carrying its delta from the previous point.
 */
export function buildHourlySeries(samples: BalanceSample[], currency: string): HourlyPoint[] {
  const latest = new Map<number, BalanceSample & { ts: number }>();
  for (const s of samples) {
    if (s.currency !== currency) continue;
    const ts = new Date(s.createdAt).getTime();
    if (!Number.isFinite(ts)) continue;
    const key = hourBucket(ts).getTime();
    const prev = latest.get(key);
    if (!prev || ts >= prev.ts) latest.set(key, { ...s, ts });
  }
  const points: HourlyPoint[] = [];
  for (const key of [...latest.keys()].sort((a, b) => a - b)) {
    const s = latest.get(key)!;
    const prev = points[points.length - 1];
    points.push({
      hour: new Date(key).toISOString(),
      total: s.totalBalance,
      granted: s.grantedBalance,
      toppedUp: s.toppedUpBalance,
      source: s.source,
      delta: prev ? round4(s.totalBalance - prev.total) : null,
    });
  }
  return points;
}

/** Currencies present in the samples, most-sampled first. */
export function currenciesOf(samples: Pick<BalanceSample, 'currency'>[]): string[] {
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.currency, (counts.get(s.currency) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

/**
 * Burn rate over a series. Positive deltas are top-ups or grants and are
 * excluded from spend (they would otherwise cancel real usage). Where hours are
 * missing from the series, the span still counts them, so a gap dilutes the
 * rate instead of inflating it.
 */
export function summarizeBurn(points: HourlyPoint[]): BurnSummary {
  const latest = points.length ? points[points.length - 1].total : null;
  let spent = 0;
  let toppedUp = 0;
  for (const p of points) {
    if (p.delta === null) continue;
    if (p.delta < 0) spent += -p.delta;
    else toppedUp += p.delta;
  }
  const spanHours =
    points.length >= 2
      ? Math.round(
          (new Date(points[points.length - 1].hour).getTime() -
            new Date(points[0].hour).getTime()) /
            HOUR_MS,
        )
      : 0;
  const perHour = spanHours > 0 ? spent / spanHours : null;
  const perDay = perHour === null ? null : perHour * 24;
  const hoursRemaining =
    perHour !== null && perHour > 0 && latest !== null ? latest / perHour : null;
  return {
    spent: round4(spent),
    spanHours,
    perHour,
    perDay,
    hoursRemaining,
    daysRemaining: hoursRemaining === null ? null : hoursRemaining / 24,
    latest,
    toppedUp: round4(toppedUp),
  };
}
