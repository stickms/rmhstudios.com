/**
 * RMHStudy focus-history maths. Pure: days are `YYYY-MM-DD` keys in the viewer's time zone, so
 * the server and the page agree on which day a run lands on. A run counts on the day it
 * started (`startedAt`), even when it ends after midnight.
 */
import {
  addDays,
  dayKeyInZone,
} from '@/lib/study/stats';

export const GOAL_MIN_MINUTES = 30;
export const GOAL_MAX_MINUTES = 3000;
/** The week selector reaches this many weeks back (the current week and the seven before). */
export const MAX_WEEK_OFFSET = 7;
/** Bound on the range any aggregate reads. */
export const HISTORY_WINDOW_DAYS = 400;
export const HEATMAP_DAYS = 365;
export const SESSIONS_PAGE_SIZE = 20;

export interface DayMinutes {
  date: string;
  minutes: number;
}

export interface WeekBounds {
  /** First day of the week, `YYYY-MM-DD`. */
  start: string;
  /** Last day of the week, `YYYY-MM-DD`. */
  end: string;
  /** The seven day keys, first day first. */
  days: string[];
}

/**
 * The calendar week holding `date` in `timeZone`. `firstDay` is the week's first day as
 * `Date#getUTCDay()` numbers (0 Sunday), from `firstDayOfWeek(locale)`. Weeks are built from
 * calendar day keys, so a DST change inside the week never makes it 6 or 8 days long.
 */
export function weekBounds(
  date: Date,
  timeZone: string,
  firstDay: number,
): WeekBounds {
  const key =
    dayKeyInZone(
      date,
      timeZone,
    );
  const dow =
    new Date(
      `${key}T00:00:00Z`,
    ).getUTCDay();
  return weekFrom(
    addDays(
      key,
      -(
        (dow -
          firstDay +
          7) %
        7
      ),
    ),
  );
}

/** The week that starts on the day key `start`. */
export function weekFrom(
  start: string,
): WeekBounds {
  return {
    start,
    end: addDays(
      start,
      6,
    ),
    days: Array.from(
      {
        length: 7,
      },
      (
        _,
        i,
      ) =>
        addDays(
          start,
          i,
        ),
    ),
  };
}

/** Minutes summed over the days of `week` (days missing from `days` count as 0). */
export function weekTotal(
  days: DayMinutes[],
  week: Pick<
    WeekBounds,
    | 'start'
    | 'end'
  >,
): number {
  return days
    .filter(
      (
        d,
      ) =>
        d.date >=
          week.start &&
        d.date <=
          week.end,
    )
    .reduce(
      (
        sum,
        d,
      ) =>
        sum +
        d.minutes,
      0,
    );
}

export interface GoalProgress {
  /** The true share of the goal done, rounded; may be over 100. */
  percent: number;
  /** The share to draw: `percent` capped at 100. */
  barPercent: number;
  /** Minutes left to the goal, 0 once it is reached. */
  remaining: number;
  reached: boolean;
}

/** Progress toward `goal` minutes; null when no goal is set. */
export function goalProgress(
  minutes: number,
  goal:
    | number
    | null,
): GoalProgress | null {
  if (
    goal ===
      null ||
    goal <=
      0
  )
    return null;
  const done =
    Math.max(
      0,
      minutes,
    );
  const percent =
    Math.round(
      (done /
        goal) *
        100,
    );
  return {
    percent,
    barPercent:
      Math.min(
        100,
        percent,
      ),
    remaining:
      Math.max(
        0,
        goal -
          done,
      ),
    reached:
      done >=
      goal,
  };
}

export interface FocusRecords {
  /** The busiest day, or null when there is no focus time. */
  bestDay: DayMinutes | null;
  /** The week (by its first day) with the most focus time, or null when there is none. */
  bestWeek: {
    start: string;
    minutes: number;
  } | null;
}

/** The best day and best week among `days`; the earliest wins a tie. */
export function records(
  days: DayMinutes[],
  firstDay: number,
): FocusRecords {
  let bestDay: DayMinutes | null =
    null;
  const byWeek =
    new Map<
      string,
      number
    >();
  for (const d of [
    ...days,
  ].sort(
    (
      a,
      b,
    ) =>
      a.date.localeCompare(
        b.date,
      ),
  )) {
    if (
      d.minutes <=
      0
    )
      continue;
    if (
      !bestDay ||
      d.minutes >
        bestDay.minutes
    )
      bestDay =
        d;
    const dow =
      new Date(
        `${d.date}T00:00:00Z`,
      ).getUTCDay();
    const start =
      addDays(
        d.date,
        -(
          (dow -
            firstDay +
            7) %
          7
        ),
      );
    byWeek.set(
      start,
      (byWeek.get(
        start,
      ) ??
        0) +
        d.minutes,
    );
  }
  let bestWeek: FocusRecords['bestWeek'] =
    null;
  for (const [
    start,
    minutes,
  ] of [
    ...byWeek,
  ].sort(
    (
      a,
      b,
    ) =>
      a[0].localeCompare(
        b[0],
      ),
  )) {
    if (
      !bestWeek ||
      minutes >
        bestWeek.minutes
    )
      bestWeek =
        {
          start,
          minutes,
        };
  }
  return {
    bestDay,
    bestWeek,
  };
}

/** A sparse day list as one entry per day for the `count` days ending on `today`. */
export function fillMinutes(
  days: DayMinutes[],
  today: string,
  count: number,
): DayMinutes[] {
  const byDay =
    new Map(
      days.map(
        (
          d,
        ) => [
          d.date,
          d.minutes,
        ],
      ),
    );
  return Array.from(
    {
      length:
        count,
    },
    (
      _,
      i,
    ) => {
      const date =
        addDays(
          today,
          i -
            (count -
              1),
        );
      return {
        date,
        minutes:
          byDay.get(
            date,
          ) ??
          0,
      };
    },
  );
}

/** Whole minutes of `ms`, rounded, never negative. */
export function msToMinutes(
  ms: number,
): number {
  return Math.max(
    0,
    Math.round(
      ms /
        60_000,
    ),
  );
}

/**
 * `minutes` as a localized duration ("4 hr, 10 min"), through `Intl.NumberFormat` unit style
 * where the runtime has it and a plain "4h 10m" otherwise.
 */
export function formatMinutes(
  minutes: number,
  locale: string,
): string {
  const total =
    Math.max(
      0,
      Math.round(
        minutes,
      ),
    );
  const hours =
    Math.floor(
      total /
        60,
    );
  const mins =
    total %
    60;
  try {
    const unit =
      (
        value: number,
        name:
          | 'hour'
          | 'minute',
      ) =>
        new Intl.NumberFormat(
          locale,
          {
            style:
              'unit',
            unit: name,
            unitDisplay:
              'short',
          },
        ).format(
          value,
        );
    const parts: string[] =
      [];
    if (
      hours >
      0
    )
      parts.push(
        unit(
          hours,
          'hour',
        ),
      );
    if (
      mins >
        0 ||
      hours ===
        0
    )
      parts.push(
        unit(
          mins,
          'minute',
        ),
      );
    return parts.join(
      ' ',
    );
  } catch {
    return hours >
      0
      ? `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
      : `${mins}m`;
  }
}

/** One day of runs: focus and break minutes, and whether its rows record break time. */
export interface DayBreaks {
  date: string;
  focusMinutes: number;
  breakMinutes: number;
  /** True when any run that day was written with break tracking (it has an `endedAt`). */
  tracked: boolean;
}

export interface WeekBreaks {
  breakMinutes: number;
  /** Minutes of focus per minute of break, rounded; null when there was no break time. */
  focusPerBreak: number | null;
}

/**
 * Break time over the days of `week`, or null when no run in it records breaks (rows from before
 * break tracking), so the page shows "—" rather than a misleading zero.
 */
export function weekBreaks(
  days: DayBreaks[],
  week: Pick<WeekBounds, 'start' | 'end'>,
): WeekBreaks | null {
  const inWeek = days.filter((d) => d.date >= week.start && d.date <= week.end);
  if (!inWeek.some((d) => d.tracked)) return null;
  const breakMinutes = inWeek.reduce((sum, d) => sum + d.breakMinutes, 0);
  const focusMinutes = inWeek.reduce((sum, d) => sum + d.focusMinutes, 0);
  return {
    breakMinutes,
    focusPerBreak: breakMinutes > 0 ? Math.max(1, Math.round(focusMinutes / breakMinutes)) : null,
  };
}
