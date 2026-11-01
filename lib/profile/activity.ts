/**
 * Profile activity heatmap maths. Posts are bucketed by UTC calendar day so the
 * server and every viewer agree on which cell a post lands in.
 */

export const HEATMAP_WEEKS = 26;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` in UTC. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start of the window: the UTC midnight `weeks * 7 - 1` days before `now`'s day. */
export function windowStart(now: Date, weeks: number = HEATMAP_WEEKS): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (weeks * 7 - 1) * DAY_MS);
}

/** Count `dates` per UTC day, ignoring any that fall outside the window. */
export function bucketByDay(
  dates: Date[],
  now: Date,
  weeks: number = HEATMAP_WEEKS,
): Record<string, number> {
  const start = windowStart(now, weeks).getTime();
  const end = start + weeks * 7 * DAY_MS;
  const out: Record<string, number> = {};
  for (const d of dates) {
    const t = d.getTime();
    if (t < start || t >= end) continue;
    const k = dayKey(d);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Shade 0 (none) to 4 (busiest) for a day's count relative to the window's max. */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

/** Every day in the window, oldest first, with its count. */
export function windowDays(
  data: Record<string, number>,
  now: Date,
  weeks: number = HEATMAP_WEEKS,
): Array<{ date: string; count: number }> {
  const start = windowStart(now, weeks).getTime();
  const days: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = dayKey(new Date(start + i * DAY_MS));
    days.push({ date, count: data[date] ?? 0 });
  }
  return days;
}
