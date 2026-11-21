/**
 * Community insights, pure parts (s03-15): the member line rebuilt from today's total and the changes
 * since, the comparison with the previous range, the weekly axis, and the hour-by-weekday grid in a
 * time zone. No database and no strings: `insights.server.ts` queries, the components translate.
 *
 * Days are UTC calendar days (`YYYY-MM-DD`), except in the hour grid, which is the moderator's zone.
 */
import {
  addDays,
  wallTimeOf,
} from '@/lib/calendar/tz';

export const INSIGHT_RANGES =
  [
    28,
    90,
    365,
  ] as const;
export type InsightRange =
  (typeof INSIGHT_RANGES)[number];
export const DEFAULT_INSIGHT_RANGE: InsightRange = 28;

/** What `community_member_event.kind` holds. The community has no ban path, so there is no `banned` kind. */
export const MEMBER_EVENT_KINDS =
  [
    'join',
    'leave',
    'removed',
  ] as const;
export type MemberEventKind =
  (typeof MEMBER_EVENT_KINDS)[number];

/** A figure with the same figure for the previous range of equal length. */
export interface Compared {
  value: number;
  previous: number;
  /** `value - previous`. */
  change: number;
  /** `change / previous` as a fraction, or null when there was nothing before to compare with. */
  fraction:
    | number
    | null;
}

export interface TopPostDTO {
  id: string;
  /** The author's handle (or id when none), for the link `/u/<handle>/post/<id>`. */
  author: string;
  authorName:
    | string
    | null;
  excerpt: string;
  createdAt: string;
  /** `null` when the author hides the counts on their posts (lib/feed/quiet-counts). */
  likes: number | null;
  reactions: number | null;
  replies: number | null;
}

export interface CommunityInsightsDTO {
  range: InsightRange;
  /** The zone the hour grid is in. */
  timeZone: string;
  /** First UTC day a leave or removal was recorded anywhere; before it only joins are known. */
  lossesKnownFrom:
    | string
    | null;
  /** Members today. */
  members: number;
  netChange: Compared;
  joins: Compared;
  leaves: Compared;
  removed: Compared;
  posts: Compared;
  posters: Compared;
  reactors: Compared;
  /** Total members at the end of each day of the range, oldest first. */
  memberLine: {
    day: string;
    total: number;
  }[];
  /** Weeks (starting Monday) touching the range, oldest first. */
  weekly: {
    week: string;
    posts: number;
    posters: number;
    reactions: number;
  }[];
  topPosts: TopPostDTO[];
  /** Activity counts, `[weekday 0 = Sunday][hour 0-23]`, in `timeZone`. */
  hours: number[][];
  /** Posts per flair in the range, most used first; `name` is null for posts without one. */
  flairs: {
    name:
      | string
      | null;
    posts: number;
  }[];
}

const DAY_MS = 86_400_000;

/** The UTC day of an instant. */
export function utcDay(
  ms: number,
): string {
  return new Date(
    ms,
  )
    .toISOString()
    .slice(
      0,
      10,
    );
}

/** The `days` UTC days ending on the day of `nowMs`, oldest first. */
export function dayKeys(
  nowMs: number,
  days: number,
): string[] {
  const today =
    utcDay(
      nowMs,
    );
  return Array.from(
    {
      length:
        days,
    },
    (
      _,
      i,
    ) =>
      addDays(
        today,
        i -
          (days -
            1),
      ),
  );
}

/** The instants bounding a range: the previous range, the range, and the end (exclusive, tomorrow 00:00 UTC). */
export function rangeBounds(
  nowMs: number,
  days: number,
): {
  prevStart: Date;
  start: Date;
  end: Date;
} {
  const midnight =
    Date.parse(
      `${utcDay(nowMs)}T00:00:00Z`,
    );
  const end =
    midnight +
    DAY_MS;
  return {
    prevStart:
      new Date(
        end -
          2 *
            days *
            DAY_MS,
      ),
    start:
      new Date(
        end -
          days *
            DAY_MS,
      ),
    end: new Date(
      end,
    ),
  };
}

export function compare(
  value: number,
  previous: number,
): Compared {
  return {
    value,
    previous,
    change:
      value -
      previous,
    fraction:
      previous >
      0
        ? (value -
            previous) /
          previous
        : null,
  };
}

/** Add up the counts of `days` in a day-keyed map. */
export function sumDays(
  counts: ReadonlyMap<
    string,
    number
  >,
  days: readonly string[],
): number {
  let total = 0;
  for (const day of days)
    total +=
      counts.get(
        day,
      ) ??
      0;
  return total;
}

/**
 * Members at the end of each day: today's total, minus the joins after that day, plus the losses
 * after it. The last day is today and carries `total` as it stands now.
 */
export function reconstructMemberLine(a: {
  days: readonly string[];
  total: number;
  joins: ReadonlyMap<
    string,
    number
  >;
  losses: ReadonlyMap<
    string,
    number
  >;
}): {
  day: string;
  total: number;
}[] {
  const line: {
    day: string;
    total: number;
  }[] =
    [];
  let running =
    a.total;
  for (
    let i =
      a
        .days
        .length -
      1;
    i >=
    0;
    i--
  ) {
    const day =
      a
        .days[
        i
      ]!;
    line.push(
      {
        day,
        total:
          running,
      },
    );
    running =
      running -
      (a.joins.get(
        day,
      ) ??
        0) +
      (a.losses.get(
        day,
      ) ??
        0);
  }
  return line.reverse();
}

/** The Monday (UTC) on or before a day. */
export function weekStart(
  day: string,
): string {
  const weekday =
    new Date(
      `${day}T00:00:00Z`,
    ).getUTCDay();
  return addDays(
    day,
    -(
      (weekday +
        6) %
      7
    ),
  );
}

/** The Mondays of the weeks touching the days `first` to `last`, oldest first. */
export function weekKeys(
  first: string,
  last: string,
): string[] {
  const weeks: string[] =
    [];
  for (
    let w =
      weekStart(
        first,
      );
    w <=
    last;
    w =
      addDays(
        w,
        7,
      )
  )
    weeks.push(
      w,
    );
  return weeks;
}

/**
 * Activity counted in short UTC bins, laid out as weekday × hour in `timeZone` (weekday 0 = Sunday).
 * A bin is placed by its own start, so the grid follows the zone's rules for the day it fell on:
 * across a daylight-saving change the same UTC bin lands one hour apart before and after it. Bins
 * of 15 minutes or less put every count in the right hour even in zones with a half-hour offset.
 */
export function hourGrid(
  bins: readonly {
    at: string;
    n: number;
  }[],
  timeZone: string,
): number[][] {
  const grid =
    Array.from(
      {
        length: 7,
      },
      () =>
        Array<number>(
          24,
        ).fill(
          0,
        ),
    );
  for (const bin of bins) {
    const ms =
      Date.parse(
        bin.at,
      );
    if (
      Number.isNaN(
        ms,
      )
    )
      continue;
    const w =
      wallTimeOf(
        ms,
        timeZone,
      );
    const row =
      grid[
        w
          .weekday
      ];
    if (
      row
    )
      row[
        w.h
      ] =
        (row[
          w
            .h
        ] ??
          0) +
        bin.n;
  }
  return grid;
}

/** The largest count in a grid (0 for an empty one), for shading. */
export function gridMax(
  grid: readonly (readonly number[])[],
): number {
  return Math.max(
    0,
    ...grid.map(
      (
        row,
      ) =>
        Math.max(
          0,
          ...row,
        ),
    ),
  );
}
