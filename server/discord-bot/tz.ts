/**
 * Wall-clock arithmetic in an IANA zone, without a timezone library.
 *
 * The activity tracker measures every day boundary, "late night" judgement and hourly bucket in the
 * subject's zone (default America/New_York). The Go original leaned on `time.Date(..., loc)` and
 * `t.In(loc)`; these helpers are the same two operations over `Intl.DateTimeFormat`, which carries
 * the full tz database in Node (the Go binary had to embed `time/tzdata` for the same reason).
 *
 * All instants are epoch milliseconds (UTC). `zonedTime()` normalises overflowing fields exactly as
 * `time.Date` does (day 32 is the 1st of next month, hour 24 is the next midnight).
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday (Go's time.Weekday). */
  weekday: number;
}

const formatters =
  new Map<
    string,
    Intl.DateTimeFormat
  >();

function formatter(
  tz: string,
): Intl.DateTimeFormat {
  let f =
    formatters.get(
      tz,
    );
  if (
    !f
  ) {
    f =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            tz,
          hourCycle:
            'h23',
          year: 'numeric',
          month:
            '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute:
            '2-digit',
          second:
            '2-digit',
          weekday:
            'short',
        },
      );
    formatters.set(
      tz,
      f,
    );
  }
  return f;
}

const WEEKDAYS: Record<
  string,
  number
> =
  {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

/** True when the zone name is known to the runtime. */
export function isValidTimeZone(
  tz: string,
): boolean {
  try {
    formatter(
      tz,
    ).format(
      0,
    );
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock fields of an instant in a zone (Go's `t.In(loc)`). */
export function zonedParts(
  ms: number,
  tz: string,
): ZonedParts {
  const out: Partial<ZonedParts> =
    {};
  for (const p of formatter(
    tz,
  ).formatToParts(
    new Date(
      ms,
    ),
  )) {
    switch (
      p.type
    ) {
      case 'year':
        out.year =
          Number(
            p.value,
          );
        break;
      case 'month':
        out.month =
          Number(
            p.value,
          );
        break;
      case 'day':
        out.day =
          Number(
            p.value,
          );
        break;
      case 'hour':
        out.hour =
          Number(
            p.value,
          ) %
          24;
        break;
      case 'minute':
        out.minute =
          Number(
            p.value,
          );
        break;
      case 'second':
        out.second =
          Number(
            p.value,
          );
        break;
      case 'weekday':
        out.weekday =
          WEEKDAYS[
            p
              .value
          ] ??
          0;
        break;
    }
  }
  return out as ZonedParts;
}

/** The zone's UTC offset at an instant, in ms (whole seconds; sub-second precision is dropped). */
function offsetAt(
  ms: number,
  tz: string,
): number {
  const p =
    zonedParts(
      ms,
      tz,
    );
  const wall =
    Date.UTC(
      p.year,
      p.month -
        1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
  return (
    wall -
    Math.floor(
      ms /
        1000,
    ) *
      1000
  );
}

/**
 * The instant at a wall-clock time in a zone (Go's `time.Date(y, m, d, h, mi, s, 0, loc)`).
 * Overflowing fields normalise. A time that does not exist (a spring-forward gap) or exists twice
 * (fall back) resolves to one of its candidates, as Go's does.
 */
export function zonedTime(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const wall =
    Date.UTC(
      year,
      month -
        1,
      day,
      hour,
      minute,
      second,
    );
  let guess =
    wall -
    offsetAt(
      wall,
      tz,
    );
  const second2 =
    wall -
    offsetAt(
      guess,
      tz,
    );
  if (
    second2 !==
    guess
  )
    guess =
      second2;
  return guess;
}

const pad =
  (
    n: number,
    w = 2,
  ) =>
    String(
      n,
    ).padStart(
      w,
      '0',
    );

/** YYYY-MM-DD of an instant in a zone. */
export function dateKeyIn(
  ms: number,
  tz: string,
): string {
  const p =
    zonedParts(
      ms,
      tz,
    );
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** YYYY-MM of an instant in a zone. */
export function monthKeyIn(
  ms: number,
  tz: string,
): string {
  const p =
    zonedParts(
      ms,
      tz,
    );
  return `${pad(p.year, 4)}-${pad(p.month)}`;
}

/** HH:MM of an instant in a zone (Go's Format("15:04")). */
export function clockIn(
  ms: number,
  tz: string,
): string {
  const p =
    zonedParts(
      ms,
      tz,
    );
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** The most recent local midnight at or before `ms`. */
export function localMidnight(
  ms: number,
  tz: string,
): number {
  const p =
    zonedParts(
      ms,
      tz,
    );
  return zonedTime(
    tz,
    p.year,
    p.month,
    p.day,
  );
}

/** Parse YYYY-MM-DD strictly; null when malformed or out of range. */
export function parseDateKey(
  key: string,
): {
  year: number;
  month: number;
  day: number;
} | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      key,
    );
  if (
    !m
  )
    return null;
  const year =
    Number(
      m[1],
    );
  const month =
    Number(
      m[2],
    );
  const day =
    Number(
      m[3],
    );
  if (
    month <
      1 ||
    month >
      12 ||
    day <
      1
  )
    return null;
  const dim =
    new Date(
      Date.UTC(
        year,
        month,
        0,
      ),
    ).getUTCDate();
  if (
    day >
    dim
  )
    return null;
  return {
    year,
    month,
    day,
  };
}

/** Parse YYYY-MM strictly. */
export function parseMonthKey(
  key: string,
): {
  year: number;
  month: number;
} | null {
  const m =
    /^(\d{4})-(\d{2})$/.exec(
      key,
    );
  if (
    !m
  )
    return null;
  const year =
    Number(
      m[1],
    );
  const month =
    Number(
      m[2],
    );
  if (
    month <
      1 ||
    month >
      12
  )
    return null;
  return {
    year,
    month,
  };
}

/** Calendar arithmetic on a date (Go's AddDate on a date in a zone; normalises like it). */
export function addDays(
  d: {
    year: number;
    month: number;
    day: number;
  },
  years: number,
  months: number,
  days: number,
): {
  year: number;
  month: number;
  day: number;
} {
  const t =
    new Date(
      Date.UTC(
        d.year +
          years,
        d.month -
          1 +
          months,
        d.day +
          days,
      ),
    );
  return {
    year: t.getUTCFullYear(),
    month:
      t.getUTCMonth() +
      1,
    day: t.getUTCDate(),
  };
}

export function formatDate(d: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;
}

/** ISO-8601 week of a calendar date: [isoYear, week]. */
export function isoWeek(d: {
  year: number;
  month: number;
  day: number;
}): [
  number,
  number,
] {
  const t =
    new Date(
      Date.UTC(
        d.year,
        d.month -
          1,
        d.day,
      ),
    );
  const dow =
    (t.getUTCDay() +
      6) %
    7; // Monday = 0
  t.setUTCDate(
    t.getUTCDate() -
      dow +
      3,
  ); // the Thursday of this week
  const isoYear =
    t.getUTCFullYear();
  const jan4 =
    new Date(
      Date.UTC(
        isoYear,
        0,
        4,
      ),
    );
  const jan4dow =
    (jan4.getUTCDay() +
      6) %
    7;
  const week1Thursday =
    Date.UTC(
      isoYear,
      0,
      4 -
        jan4dow +
        3,
    );
  const week =
    1 +
    Math.round(
      (t.getTime() -
        week1Thursday) /
        (7 *
          86_400_000),
    );
  return [
    isoYear,
    week,
  ];
}
