/**
 * Audience maths. Pure: days are `YYYY-MM-DD` keys in the viewer's time zone, so the server
 * and the page agree on which day a change lands on.
 */
import { addDays, dayKeyInZone } from '@/lib/study/stats';

export const AUDIENCE_RANGES = [30, 90, 365] as const;
export type AudienceRange = (typeof AUDIENCE_RANGES)[number];
/** The engagement grid looks back this many days, whatever range the charts show. */
export const ENGAGEMENT_DAYS = 90;
/** Up to this many new followers are listed. */
export const NEW_FOLLOWER_LIMIT = 20;

/** Follows gained and follows lost on one day. Several rows for one day add up. */
export interface DayDelta {
  date: string;
  gained: number;
  lost: number;
}

export interface FollowerDay extends DayDelta {
  /** Followers at the end of the day. */
  followers: number;
  net: number;
  /** True before the log began: only gains are known, so losses read as zero. */
  gainsOnly: boolean;
}

/**
 * One point per day for the last `days` days, oldest first, ending today in `timeZone`.
 * The count at the end of today is `currentCount`; every earlier day's count is the next
 * day's minus that next day's net change. Days before `logStart` (the day of the first
 * logged event, or null when nothing is logged) are flagged `gainsOnly`.
 */
export function reconstructDaily(
  currentCount: number,
  deltas: DayDelta[],
  days: number,
  timeZone: string,
  logStart: string | null = null,
  now: Date = new Date(),
): FollowerDay[] {
  const today = dayKeyInZone(now, timeZone);
  const byDay = new Map<
    string,
    {
      gained: number;
      lost: number;
    }
  >();
  for (const d of deltas) {
    const sum = byDay.get(d.date) ?? {
      gained: 0,
      lost: 0,
    };
    sum.gained += d.gained;
    sum.lost += d.lost;
    byDay.set(d.date, sum);
  }

  const out: FollowerDay[] = [];
  let followers = currentCount;
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -i);
    const { gained, lost } = byDay.get(date) ?? {
      gained: 0,
      lost: 0,
    };
    const net = gained - lost;
    out.push({
      date,
      gained,
      lost,
      net,
      followers: Math.max(0, followers),
      gainsOnly: logStart === null || date < logStart,
    });
    followers -= net;
  }
  return out.reverse();
}

/**
 * Net change per week. Weeks are runs of seven days counted back from the last day, so the
 * first one may be shorter. The nets add up to the range's net. `start` is the first day.
 */
export function weeklyNet(days: FollowerDay[]): {
  start: string;
  net: number;
}[] {
  const weeks: {
    start: string;
    net: number;
  }[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const slice = days.slice(Math.max(0, end - 7), end);
    const first = slice[0];
    if (!first) continue;
    weeks.push({
      start: first.date,
      net: slice.reduce((sum, d) => sum + d.net, 0),
    });
  }
  return weeks.reverse();
}

/** Engagement counts as 7 rows (Sunday first, as `getUTCDay` and SQL `dow` count) of 24 hours. */
export type EngagementGrid = number[][];

export function emptyGrid(): EngagementGrid {
  return Array.from(
    {
      length: 7,
    },
    () => Array<number>(24).fill(0),
  );
}

/** Fill a grid from `{ dow, hour, n }` rows, ignoring any outside 0-6 / 0-23. */
export function gridFromRows(
  rows: {
    dow: number;
    hour: number;
    n: number;
  }[],
): EngagementGrid {
  const grid = emptyGrid();
  for (const { dow, hour, n } of rows) {
    const row = grid[dow];
    if (row && hour >= 0 && hour < 24) row[hour] = (row[hour] ?? 0) + n;
  }
  return grid;
}

export interface Slot {
  dow: number;
  hour: number;
  count: number;
}

/** The `n` busiest day-and-hour slots, busiest first; ties go to the earlier day then hour. Empty slots never count. */
export function busiestSlots(grid: EngagementGrid, n: number): Slot[] {
  const slots: Slot[] = [];
  grid.forEach((row, dow) =>
    row.forEach((count, hour) => {
      if (count > 0)
        slots.push({
          dow,
          hour,
          count,
        });
    }),
  );
  slots.sort((a, b) => b.count - a.count || a.dow - b.dow || a.hour - b.hour);
  return slots.slice(0, n);
}
