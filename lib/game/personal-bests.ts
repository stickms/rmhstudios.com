/**
 * Personal best history (sprint 05 #04) — the pure half: the step series for the chart, the
 * improvement over a window, and number formatting. Client-safe; the database half is
 * `personal-bests.server.ts`.
 *
 * A lower-is-better game's score is a duration in milliseconds, so it is shown as a time, and an
 * improvement is a reduction.
 */
import { formatDurationMs } from '@/lib/core/format';

export interface BestRow {
  score: number;
  previous: number | null;
  /** ISO time the record was set. */
  at: string;
}

const DAY_MS = 86_400_000;

/** Oldest first, without touching the caller's array. */
export function oldestFirst<
  T extends {
    at: string;
  },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * The best over time as a step line: each record after the first adds the old level one millisecond
 * before it, so the line runs flat and then rises (or drops) at the moment the record was set. `x` is
 * the ISO time, which sorts as text.
 */
export function stepSeries(rows: readonly BestRow[]): {
  x: string;
  y: number;
}[] {
  const points: {
    x: string;
    y: number;
  }[] = [];
  let level: number | null = null;
  for (const row of oldestFirst(rows)) {
    if (level !== null && level !== row.score) {
      points.push({
        x: new Date(Date.parse(row.at) - 1).toISOString(),
        y: level,
      });
    }
    points.push({
      x: row.at,
      y: row.score,
    });
    level = row.score;
  }
  return points;
}

/** The change a record made: null for a first score, negative when a lower-is-better game improved. */
export function changeOf(row: Pick<BestRow, 'score' | 'previous'>): number | null {
  return row.previous === null ? null : row.score - row.previous;
}

/**
 * How far the best moved over the last `windowDays`: the current best minus the best the window
 * started with, so a higher-is-better game reads positive and a lower-is-better one negative.
 * Null when no record was set in the window. A window that holds a first score measures from that
 * first score.
 */
export function improvementOver(rows: readonly BestRow[], windowDays: number, now: number): number | null {
  const sorted = oldestFirst(rows).filter((r) => Date.parse(r.at) <= now);
  const since = now - windowDays * DAY_MS;
  const first = sorted.find((r) => Date.parse(r.at) >= since);
  const last = sorted.at(-1);
  if (!first || !last) return null;
  return last.score - (first.previous ?? first.score);
}

/** A score for display: a duration for a time-based game, a grouped number otherwise. */
export function formatBest(score: number, lowerIsBetter: boolean, locale: string): string {
  return lowerIsBetter ? formatDurationMs(score) : new Intl.NumberFormat(locale).format(score);
}

/** A change with its sign (`+1,240`, `−3.2 s`); a time-based game's change is in seconds. */
export function formatChange(delta: number, lowerIsBetter: boolean, locale: string): string {
  if (lowerIsBetter) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'narrow',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(delta / 1000);
  }
  return new Intl.NumberFormat(locale, {
    signDisplay: 'exceptZero',
  }).format(delta);
}
