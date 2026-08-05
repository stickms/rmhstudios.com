/**
 * Version bucketing and ranking for speedrun boards (design K1).
 *
 * ## The honest hard part
 *
 * A game update invalidates old replays: the same inputs no longer produce the
 * same run, so a time set on `lo-1` and a time set on `lo-2` are times in two
 * different games. Every speedrun community solves this the same way and this
 * module encodes it — **boards are per game version**, and the "all versions"
 * view does not merge them, it LABELS them. A board that silently mixes versions
 * looks tidier and is worthless: the top of it is whichever version happened to
 * be easiest.
 *
 * That is why `SpeedrunCategory` carries `version` in its unique key: "any%" on
 * `lo-1` and "any%" on `lo-2` are two category rows, two boards, one slug.
 *
 * Pure and client-safe — the page ranks in the browser when it filters, the
 * server ranks when it queries, and neither may disagree about who is first.
 */

import { ALL_VERSIONS, type SpeedrunEntryView, type SpeedrunMetric } from './types';

/** A board scoped to one game version. */
export interface VersionBucket<T> {
  version: string;
  entries: T[];
}

/**
 * Order versions newest-first for the version picker.
 *
 * Versions on this site are short tags (`lo-1`, `si-2`) rather than semver, so
 * the comparison is: same prefix → numeric suffix descending; otherwise
 * alphabetical. Numeric-aware because a plain string sort puts `v10` before `v2`,
 * which would hand the picker's default — the newest board — to an old version
 * the moment a game reaches its tenth revision.
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string): [string, number] => {
    const match = /^(.*?)(\d+)$/.exec(v);
    return match ? [match[1], Number(match[2])] : [v, Number.NaN];
  };
  const [prefixA, numA] = split(a);
  const [prefixB, numB] = split(b);
  if (prefixA === prefixB && Number.isFinite(numA) && Number.isFinite(numB)) {
    return numB - numA;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every distinct version present, newest first. */
export function versionsOf<T extends { version: string }>(items: readonly T[]): string[] {
  return [...new Set(items.map((i) => i.version))].sort(compareVersions);
}

/**
 * Split entries into one bucket per version, newest version first. Used by the
 * "all versions" view, which renders the buckets in sequence — each with its own
 * ranking — instead of one merged list.
 */
export function bucketByVersion<T extends { version: string }>(
  items: readonly T[],
): VersionBucket<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const bucket = buckets.get(item.version);
    if (bucket) bucket.push(item);
    else buckets.set(item.version, [item]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => compareVersions(a, b))
    .map(([version, entries]) => ({ version, entries }));
}

/** `'all'` keeps everything; any other value filters to that one version. */
export function filterVersion<T extends { version: string }>(
  items: readonly T[],
  version: string,
): T[] {
  if (version === ALL_VERSIONS) return [...items];
  return items.filter((i) => i.version === version);
}

/**
 * Rank runs within ONE version.
 *
 * `time`: fastest first. `score`: highest first, with the faster run breaking a
 * tie — a tie on both is settled by whoever set it first, because a record
 * belongs to whoever got there, not to whoever submitted most recently.
 *
 * Only `verified` runs are ranked. Pending and rejected runs still travel to the
 * UI (a runner needs to see their own run sitting in a queue) but they are not
 * given a position on the board.
 */
export function rankEntries<
  T extends { timeMs: number; score: number | null; status: string; createdAt: string },
>(entries: readonly T[], metric: SpeedrunMetric): T[] {
  return entries
    .filter((e) => e.status === 'verified')
    .slice()
    .sort((a, b) => {
      if (metric === 'score') {
        const scoreA = a.score ?? Number.NEGATIVE_INFINITY;
        const scoreB = b.score ?? Number.NEGATIVE_INFINITY;
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
}

/**
 * The board for a version selection: ranked buckets, newest version first.
 *
 * The `all` view returns several buckets and a single-version view returns one,
 * so the caller renders the same component either way and the version label is
 * always attached to the runs it belongs to.
 */
export function buildBoard(
  entries: readonly SpeedrunEntryView[],
  metric: SpeedrunMetric,
  version: string,
): VersionBucket<SpeedrunEntryView>[] {
  const scoped = filterVersion(entries, version);
  return bucketByVersion(scoped).map((bucket) => ({
    version: bucket.version,
    entries: rankEntries(bucket.entries, metric),
  }));
}

/** `mm:ss.mmm` — the speedrun convention, not a localized duration. */
export function formatRunTime(timeMs: number): string {
  const safe = Math.max(0, Math.trunc(timeMs));
  const ms = safe % 1000;
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const body = `${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
  return hours > 0 ? `${hours}:${body}` : body;
}
