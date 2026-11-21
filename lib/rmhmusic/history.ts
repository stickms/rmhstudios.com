/**
 * RMHMusic practice-log maths. Pure: days are `YYYY-MM-DD` keys in the member's time zone
 * (`lib/calendar/tz.ts`), so the server and the page agree on which day an entry lands on.
 * Every entry counts on the day it was written, which is the day the activity finished.
 */
import {
  addDays,
  dayOf,
} from '@/lib/calendar/tz';

/** The four things that write an entry (`MusicPracticeEntry.kind`). */
export const PRACTICE_KINDS =
  [
    'lesson',
    'song',
    'sprint',
    'cards',
  ] as const;
export type PracticeKind =
  (typeof PRACTICE_KINDS)[number];

export function isPracticeKind(
  v: unknown,
): v is PracticeKind {
  return (
    typeof v ===
      'string' &&
    (
      PRACTICE_KINDS as readonly string[]
    ).includes(
      v,
    )
  );
}

/** The list's filter tabs: every kind, or one. */
export type PracticeFilter =
  | 'all'
  | PracticeKind;

/** A song entry's mode, or a sprint entry's: `daily` is the daily challenge, `free` a free-play run. */
export const SPRINT_ENTRY_MODES =
  [
    'daily',
    'free',
  ] as const;

/** The longest activity one entry may claim (two hours); longer is clamped, never rejected. */
export const MAX_DURATION_MS =
  2 *
  3_600_000;
/** Entries in one page of the recent-activity list. */
export const ENTRIES_PAGE_SIZE = 30;
/** Most attempts the song progress view returns (the newest ones). */
export const SONG_ATTEMPTS_MAX = 200;
/** Bound on the range any aggregate reads. */
export const HISTORY_WINDOW_DAYS = 400;
export const HEATMAP_DAYS = 365;
/** The week selector reaches this many weeks back (the current week and the seven before). */
export const MAX_WEEK_OFFSET = 7;

/** A client-sent duration as stored: a whole number of ms in 0 to two hours, or null when unknown. */
export function clampDurationMs(
  value:
    | number
    | null
    | undefined,
):
  | number
  | null {
  if (
    typeof value !==
      'number' ||
    !Number.isFinite(
      value,
    )
  )
    return null;
  return Math.min(
    MAX_DURATION_MS,
    Math.max(
      0,
      Math.round(
        value,
      ),
    ),
  );
}

/** A score as stored: a whole number in 0 to 100, or null when the activity has none. */
export function clampScore(
  value:
    | number
    | null
    | undefined,
):
  | number
  | null {
  if (
    typeof value !==
      'number' ||
    !Number.isFinite(
      value,
    )
  )
    return null;
  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        value,
      ),
    ),
  );
}

export interface WeekBounds {
  /** First day of the week, `YYYY-MM-DD`. */
  start: string;
  /** Last day of the week, `YYYY-MM-DD`. */
  end: string;
  /** The seven day keys, first day first. */
  days: string[];
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

/**
 * The calendar week holding the instant `ms` in `timeZone`. `firstDay` is the week's first day as
 * `Date#getUTCDay()` numbers (0 Sunday). Weeks are built from calendar day keys, so a DST change
 * inside the week never makes it 6 or 8 days long.
 */
export function weekBounds(
  ms: number,
  timeZone: string,
  firstDay: number,
): WeekBounds {
  const key =
    dayOf(
      ms,
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

/** One day of practice: finished activities and the minutes known for them. */
export interface PracticeDay {
  date: string;
  /** Whole minutes from the entries that carried a duration (0 when none did). */
  minutes: number;
  /** Finished activities, with or without a duration. */
  count: number;
}

/** A SQL day row (`ms` summed over the entries that carried a duration) as a day. */
export function toPracticeDay(row: {
  date: string;
  count: number;
  ms: number;
}): PracticeDay {
  return {
    date: row.date,
    count:
      row.count,
    minutes:
      Math.max(
        0,
        Math.round(
          row.ms /
            60_000,
        ),
      ),
  };
}

/** Minutes summed over the days of `week` (days missing from `days` count as 0). */
export function weekMinutes(
  days: readonly PracticeDay[],
  week: Pick<
    WeekBounds,
    | 'start'
    | 'end'
  >,
): number {
  return days.reduce(
    (
      sum,
      d,
    ) =>
      d.date >=
        week.start &&
      d.date <=
        week.end
        ? sum +
          d.minutes
        : sum,
    0,
  );
}

/**
 * Days of `week` that met the daily goal, out of the days of the week up to `today` (a week that
 * is under way has not had its later days yet). `dailyGoal` counts activities, not minutes: a day
 * meets it with that many finished activities.
 */
export function goalMetDays(
  days: readonly PracticeDay[],
  week: WeekBounds,
  dailyGoal: number,
  today: string,
): {
  met: number;
  elapsed: number;
} {
  const byDay =
    new Map(
      days.map(
        (
          d,
        ) => [
          d.date,
          d.count,
        ],
      ),
    );
  let met = 0;
  let elapsed = 0;
  for (const date of week.days) {
    if (
      date >
      today
    )
      break;
    elapsed += 1;
    if (
      (byDay.get(
        date,
      ) ??
        0) >=
      Math.max(
        1,
        dailyGoal,
      )
    )
      met += 1;
  }
  return {
    met,
    elapsed,
  };
}

/**
 * One value per day for the `count` days ending on `today`, for the heatmap: the day's minutes,
 * or, when the day has none (an activity with no duration), its activity count, so a day with
 * finished lessons is never blank.
 */
export function heatDays(
  days: readonly PracticeDay[],
  today: string,
  count: number,
): {
  date: string;
  count: number;
}[] {
  const byDay =
    new Map(
      days.map(
        (
          d,
        ) => [
          d.date,
          d,
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
      const day =
        byDay.get(
          date,
        );
      return {
        date,
        count:
          day
            ? day.minutes >
              0
              ? day.minutes
              : day.count
            : 0,
      };
    },
  );
}

/** The days of `week` as one entry each (days with no entries are zero). */
export function weekDays(
  days: readonly PracticeDay[],
  week: WeekBounds,
): PracticeDay[] {
  const byDay =
    new Map(
      days.map(
        (
          d,
        ) => [
          d.date,
          d,
        ],
      ),
    );
  return week.days.map(
    (
      date,
    ) =>
      byDay.get(
        date,
      ) ?? {
        date,
        minutes: 0,
        count: 0,
      },
  );
}
