/**
 * Build insights, pure parts (s04-05): the range, the empty days filled in, the comparison with the previous period of
 * the same length, release markers and the biggest days. No database and no strings: `insights.server.ts` queries and
 * the component translates. Days are UTC calendar days (`YYYY-MM-DD`), matching the coin statement.
 */
import { compare, dayKeys, utcDay, type Compared } from '@/lib/communities/insights';

export { rangeBounds } from '@/lib/communities/insights';
export type { Compared };

export const BUILD_INSIGHT_RANGES = [7, 30, 90] as const;
export type BuildInsightRange = (typeof BUILD_INSIGHT_RANGES)[number];
export const DEFAULT_BUILD_INSIGHT_RANGE: BuildInsightRange = 30;
export const BIGGEST_DAYS = 5;

/** One day's counts. `views` are first views: one per signed-in viewer or hashed address, ever. */
export interface BuildDayCounts {
  views: number;
  likes: number;
  comments: number;
  unlocks: number;
  /** Coins paid for unlocks that day. */
  coins: number;
}

export interface BuildDay extends BuildDayCounts {
  day: string;
}

export interface BuildReleaseMarker {
  day: string;
  version: string;
}

export interface BiggestDay extends BuildDay {
  /** Versions released that day. */
  releases: string[];
}

export type BuildTotalKey = keyof BuildDayCounts;

export interface BuildInsightsDTO {
  /** The build's title, for the page heading. */
  title: string;
  range: BuildInsightRange;
  /** False for a curated build: it records no `BuildView` rows, so first views are unknown, not zero. */
  hasViews: boolean;
  totals: Record<BuildTotalKey, Compared>;
  /** One entry per day of the range, oldest first, empty days included. */
  days: BuildDay[];
  releases: BuildReleaseMarker[];
  biggestDays: BiggestDay[];
}

export const EMPTY_COUNTS: BuildDayCounts = { views: 0, likes: 0, comments: 0, unlocks: 0, coins: 0 };

export function parseRange(value: string | undefined): BuildInsightRange {
  const n = Number(value);
  return (BUILD_INSIGHT_RANGES as readonly number[]).includes(n)
    ? (n as BuildInsightRange)
    : DEFAULT_BUILD_INSIGHT_RANGE;
}

/** Per-day counts keyed by UTC day, as the queries return them. */
export type DayMap = Map<string, Partial<BuildDayCounts>>;

/** `keys` with the counts of each day, zero where the build had none. */
export function fillDays(keys: readonly string[], counts: DayMap): BuildDay[] {
  return keys.map((day) => ({ day, ...EMPTY_COUNTS, ...counts.get(day) }));
}

/** Add up the counts of the given days. */
export function sumCounts(days: Iterable<string>, counts: DayMap): BuildDayCounts {
  const sum = { ...EMPTY_COUNTS };
  for (const day of days) {
    const row = counts.get(day);
    if (!row) continue;
    for (const key of Object.keys(sum) as BuildTotalKey[]) sum[key] += row[key] ?? 0;
  }
  return sum;
}

export function totalsOf(current: BuildDayCounts, previous: BuildDayCounts): Record<BuildTotalKey, Compared> {
  return {
    views: compare(current.views, previous.views),
    likes: compare(current.likes, previous.likes),
    comments: compare(current.comments, previous.comments),
    unlocks: compare(current.unlocks, previous.unlocks),
    coins: compare(current.coins, previous.coins),
  };
}

/** Releases (any order) as markers on the days of the range; older and newer ones are dropped. Oldest first. */
export function releaseMarkers(
  releases: readonly { version: string; createdAt: string }[],
  keys: readonly string[],
): BuildReleaseMarker[] {
  const inRange = new Set(keys);
  return releases
    .map((r) => ({ day: utcDay(Date.parse(r.createdAt)), version: r.version }))
    .filter((m) => inRange.has(m.day))
    .sort((a, b) => (a.day === b.day ? a.version.localeCompare(b.version) : a.day.localeCompare(b.day)));
}

/**
 * The days that counted most, best first: most first views, then most likes, comments and unlocks, then the more recent
 * day. A build with no view data (curated) ranks by those other three together. Days with nothing at all are not
 * "big", so fewer than `limit` come back for a quiet build.
 */
export function biggestDays(
  days: readonly BuildDay[],
  markers: readonly BuildReleaseMarker[],
  hasViews: boolean,
  limit: number = BIGGEST_DAYS,
): BiggestDay[] {
  const activity = (d: BuildDay) => d.likes + d.comments + d.unlocks;
  const score = (d: BuildDay) => (hasViews ? d.views : activity(d));
  return days
    .filter((d) => score(d) > 0)
    .sort((a, b) => score(b) - score(a) || activity(b) - activity(a) || b.day.localeCompare(a.day))
    .slice(0, limit)
    .map((d) => ({ ...d, releases: markers.filter((m) => m.day === d.day).map((m) => m.version) }));
}

/** Assemble the answer from per-day counts spanning the previous period and the range. `nowMs` fixes "today". */
export function buildInsights(
  nowMs: number,
  range: BuildInsightRange,
  build: { title: string; isCurated: boolean },
  counts: DayMap,
  releases: readonly { version: string; createdAt: string }[],
): BuildInsightsDTO {
  const hasViews = !build.isCurated;
  const keys = dayKeys(nowMs, range);
  const previousKeys = dayKeys(Date.parse(`${keys[0]}T00:00:00Z`) - 86_400_000, range);
  const days = fillDays(keys, counts);
  const markers = releaseMarkers(releases, keys);
  return {
    title: build.title,
    range,
    hasViews,
    totals: totalsOf(sumCounts(keys, counts), sumCounts(previousKeys, counts)),
    days,
    releases: markers,
    biggestDays: biggestDays(days, markers, hasViews),
  };
}
