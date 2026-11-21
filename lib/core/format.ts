/** Formatters with the unit in the NAME — never an ambiguous `formatTime`. */

/** `m:ss` from seconds (floored, negatives clamp to 0). `hours: true` → `h:mm:ss` once past an hour. */
export function formatClockSeconds(
  seconds: number,
  opts: {
    hours?: boolean;
  } = {},
): string {
  const s =
    Math.max(
      0,
      Math.floor(
        seconds,
      ),
    );
  const pad =
    (
      n: number,
    ) =>
      String(
        n,
      ).padStart(
        2,
        '0',
      );
  if (
    opts.hours
  ) {
    const h =
      Math.floor(
        s /
          3600,
      );
    const m =
      Math.floor(
        (s %
          3600) /
          60,
      );
    if (
      h >
      0
    )
      return `${h}:${pad(m)}:${pad(s % 60)}`;
    return `${m}:${pad(s % 60)}`;
  }
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Short duration from milliseconds, rounded to the second: `42s` / `3m 7s`. */
export function formatDurationMs(
  ms: number,
): string {
  const totalSec =
    Math.round(
      ms /
        1000,
    );
  const m =
    Math.floor(
      totalSec /
        60,
    );
  const s =
    totalSec %
    60;
  return m >
    0
    ? `${m}m ${s}s`
    : `${s}s`;
}

/**
 * `Mar 5, 2026`: short month, day and year, in `locale` and `timeZone` (the
 * runtime's for either when omitted). Throws on an invalid date, like the
 * `Intl.DateTimeFormat` it wraps; guard first where the value can be missing.
 */
export function formatDateShort(
  value:
    | Date
    | string
    | number,
  locale?: string,
  timeZone?: string,
): string {
  const options: Intl.DateTimeFormatOptions =
    {
      month:
        'short',
      day: 'numeric',
      year: 'numeric',
    };
  if (
    timeZone
  )
    options.timeZone =
      timeZone;
  return new Intl.DateTimeFormat(
    locale,
    options,
  ).format(
    value instanceof
      Date
      ? value
      : new Date(
          value,
        ),
  );
}

/** Compact count (`1.2K`, `3.4M`) via Intl; `locale` defaults to the runtime's. */
export function formatCompact(
  n: number,
  locale?: string,
): string {
  return new Intl.NumberFormat(
    locale,
    {
      notation:
        'compact',
      maximumFractionDigits: 1,
    },
  ).format(
    n,
  );
}

/**
 * Locale-bound `Intl` formatting for the whole site (dates, times, numbers).
 *
 * A bare `toLocaleString()` formats in the browser's locale on the client and the
 * server's during SSR, so the two renders disagree and React throws the server
 * tree away. These take the locale explicitly. Formatter instances are cached per
 * (kind, locale, options) in a map bounded at 200 entries, so a list of rows never
 * builds one per row. React code reaches them through `hooks/useLocaleFormat.ts`.
 */
const FORMATTER_CACHE_MAX = 200;
const formatterCache = new Map<
  string,
  Intl.DateTimeFormat | Intl.NumberFormat
>();

function cached<
  T extends
    | Intl.DateTimeFormat
    | Intl.NumberFormat,
>(
  kind: string,
  locale: string,
  options: object | undefined,
  make: () => T,
): T {
  const key = `${kind}|${locale}|${options ? JSON.stringify(options) : ''}`;
  const hit =
    formatterCache.get(
      key,
    );
  if (hit) return hit as T;
  const made = make();
  if (
    formatterCache.size >=
    FORMATTER_CACHE_MAX
  ) {
    const oldest =
      formatterCache
        .keys()
        .next();
    if (!oldest.done)
      formatterCache.delete(
        oldest.value,
      );
  }
  formatterCache.set(
    key,
    made,
  );
  return made;
}

/** Number of cached formatters (for tests). */
export function formatterCacheSize(): number {
  return formatterCache.size;
}

/** Empties the formatter cache (for tests). */
export function clearFormatterCache(): void {
  formatterCache.clear();
}

/**
 * The language the page is rendered in: `<html lang>` (set by `lib/i18n/dom.ts`),
 * else `en`. For engine code with no React and no locale in scope; React code
 * uses `useLocaleFormat()`.
 */
export function currentDocumentLocale(): string {
  if (
    typeof document ===
    'undefined'
  )
    return 'en';
  return (
    document
      .documentElement
      ?.lang ||
    'en'
  );
}

type DateInput =
  | Date
  | string
  | number;

const DATE_FIELDS = [
  'weekday',
  'year',
  'month',
  'day',
] as const;
const TIME_FIELDS = [
  'dayPeriod',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
] as const;

function hasAny(
  opts: Intl.DateTimeFormatOptions,
  keys: readonly string[],
): boolean {
  const o =
    opts as Record<
      string,
      unknown
    >;
  return keys.some(
    (k) =>
      o[k] !==
      undefined,
  );
}

/**
 * The field defaults `Date.prototype.toLocale{Date,Time,}String` apply, so the
 * helpers print the same fields the call they replaced did.
 */
function withDefaults(
  kind:
    | 'date'
    | 'time'
    | 'dateTime',
  opts:
    | Intl.DateTimeFormatOptions
    | undefined,
): Intl.DateTimeFormatOptions {
  const o = {
    ...opts,
  };
  if (
    o.dateStyle !==
      undefined ||
    o.timeStyle !==
      undefined
  )
    return o;
  const needDate =
    kind ===
      'date' ||
    kind ===
      'dateTime';
  const needTime =
    kind ===
      'time' ||
    kind ===
      'dateTime';
  let defaults =
    kind ===
      'dateTime'
      ? !hasAny(
          o,
          DATE_FIELDS,
        ) &&
        !hasAny(
          o,
          TIME_FIELDS,
        )
      : kind ===
          'date'
        ? !hasAny(
            o,
            DATE_FIELDS,
          )
        : !hasAny(
            o,
            TIME_FIELDS,
          );
  if (
    kind ===
      'time' &&
    hasAny(
      o,
      TIME_FIELDS,
    )
  )
    defaults = false;
  if (!defaults)
    return o;
  if (needDate) {
    o.year ??=
      'numeric';
    o.month ??=
      'numeric';
    o.day ??=
      'numeric';
  }
  if (needTime) {
    o.hour ??=
      'numeric';
    o.minute ??=
      'numeric';
    o.second ??=
      'numeric';
  }
  return o;
}

function dateFormatter(
  kind:
    | 'date'
    | 'time'
    | 'dateTime',
  locale: string,
  opts:
    | Intl.DateTimeFormatOptions
    | undefined,
): Intl.DateTimeFormat {
  const resolved =
    withDefaults(
      kind,
      opts,
    );
  return cached(
    `d:${kind}`,
    locale,
    resolved,
    () =>
      new Intl.DateTimeFormat(
        locale ||
          'en',
        resolved,
      ),
  );
}

function toDate(
  v: DateInput,
): Date {
  return v instanceof
    Date
    ? v
    : new Date(
        v,
      );
}

/** `toLocaleDateString(locale, opts)`: the date part (numeric y/m/d by default). */
export function formatDate(
  v: DateInput,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d =
    toDate(
      v,
    );
  // `toLocale*String` answers "Invalid Date"; `Intl` would throw.
  if (
    Number.isNaN(
      d.getTime(),
    )
  )
    return 'Invalid Date';
  return dateFormatter(
    'date',
    locale,
    opts,
  ).format(
    d,
  );
}

/** `toLocaleTimeString(locale, opts)`: the time part (h:mm:ss by default). */
export function formatTime(
  v: DateInput,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d =
    toDate(
      v,
    );
  // `toLocale*String` answers "Invalid Date"; `Intl` would throw.
  if (
    Number.isNaN(
      d.getTime(),
    )
  )
    return 'Invalid Date';
  return dateFormatter(
    'time',
    locale,
    opts,
  ).format(
    d,
  );
}

/** `toLocaleString(locale, opts)` on a Date: date and time. */
export function formatDateTime(
  v: DateInput,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d =
    toDate(
      v,
    );
  // `toLocale*String` answers "Invalid Date"; `Intl` would throw.
  if (
    Number.isNaN(
      d.getTime(),
    )
  )
    return 'Invalid Date';
  return dateFormatter(
    'dateTime',
    locale,
    opts,
  ).format(
    d,
  );
}

/** `n.toLocaleString(locale, opts)`: grouping and digits as `locale` writes them. */
export function formatNumber(
  n: number | bigint,
  locale: string,
  opts?: Intl.NumberFormatOptions,
): string {
  return cached(
    'n',
    locale,
    opts,
    () =>
      new Intl.NumberFormat(
        locale ||
          'en',
        opts,
      ),
  ).format(
    n,
  );
}

const DURATION_UNITS: [
  'day' | 'hour' | 'minute' | 'second',
  number,
][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1_000],
];

/**
 * A length of time with no "in"/"ago": `5 minutes`, `2 hours`, in `locale`. Rounds
 * to the largest whole unit that fits, like date-fns' `formatDistanceToNowStrict`.
 */
export function formatDurationLong(
  ms: number,
  locale: string,
): string {
  const abs = Math.abs(ms);
  const [unit, size] =
    DURATION_UNITS.find(
      ([, s]) => abs >= s,
    ) ??
    DURATION_UNITS[DURATION_UNITS.length - 1]!;
  return cached(
    `u:${unit}`,
    locale,
    undefined,
    () =>
      new Intl.NumberFormat(
        locale || 'en',
        {
          style: 'unit',
          unit,
          unitDisplay: 'long',
        },
      ),
  ).format(
    Math.round(
      abs / size,
    ),
  );
}
