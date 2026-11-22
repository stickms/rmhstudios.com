/**
 * Per-date skip and move for a repeating event (s06-10). Pure and client-safe.
 *
 * An override is keyed by the ORIGINAL occurrence start, which is also what `Rsvp.occurrenceAt`
 * holds, so a move never rewrites an answer: the answer stays keyed by the original time and only
 * the displayed and reminded time changes. {@link applyOverrides} is the one function every path
 * that lists occurrences runs them through ({@link OCCURRENCE_READ_PATHS}).
 */
import {
  occurrenceIndexOf,
  occurrencesBetween,
  type RecurringSeries,
} from '@/lib/calendar/recurrence';

export type OccurrenceKind =
  | 'skip'
  | 'move';
export type OccurrenceState =
  | 'normal'
  | 'moved'
  | 'skipped';

/** At most this many overridden dates per event. */
export const MAX_OVERRIDES = 52;
export const NOTE_MAX = 200;
/** A move stays within a month of its date, so readers widen their window by this much. */
export const OVERRIDE_MARGIN_MS =
  40 *
  86_400_000;

export interface OccurrenceOverride {
  /** The occurrence as the rule computes it. */
  occurrenceAt: Date;
  kind: OccurrenceKind;
  startsAt: Date | null;
  endsAt: Date | null;
  note:
    | string
    | null;
  /** When it was last changed; the ICS feed derives `SEQUENCE` from it. */
  updatedAt?: Date;
}

/**
 * Every server path that lists occurrences of a repeating event. Each one imports `applyOverrides`
 * (`occurrence-read-paths.test.ts` scans them), so a skipped date never reappears in one place
 * because a new reader forgot it.
 */
export const OCCURRENCE_READ_PATHS =
  [
    // The event list: the next live date, its attendance and the "Upcoming dates" list.
    'lib/calendar/recurring-events.server.ts',
    // Attendance dates behind the personal ICS feed and the "Yours" half of the calendar.
    'lib/calendar/feed-entries.ts',
    // The platform slots offered for the feed, with the next date shown.
    'lib/calendar/feed.server.ts',
    // The public "What's on" grid.
    'lib/schedule/grid.server.ts',
    // The dates a host sees right after changing one.
    'lib/events/occurrences.server.ts',
    // The developer API's events, their attendees and the dates a member answered (s07-10).
    'lib/api/v1/events.server.ts',
  ] as const;

/** Paths that only LOAD overrides for a reader above (they apply nothing themselves). */
export const OCCURRENCE_OVERRIDE_LOADERS =
  [
    'lib/calendar/my-events.server.ts',
  ] as const;

/** An occurrence after overrides: `startsAt`/`endsAt` are the effective ones. */
export type Overridden<
  T,
> =
  T & {
    /** The original start: the key answers and reminders are stored under. */
    originalAt: Date;
    state: OccurrenceState;
    note:
      | string
      | null;
  };

/**
 * Apply overrides to a list of occurrences (each with its ORIGINAL `startsAt`). Skipped dates are
 * dropped unless `keepSkipped`; a moved date takes its new start (and end, else keeps its length).
 * Linear in both lists; the result is ordered by effective start.
 */
export function applyOverrides<
  T extends
    {
      startsAt: Date;
      endsAt?: Date | null;
    },
>(
  occurrences: readonly T[],
  overrides: readonly OccurrenceOverride[],
  opts: {
    keepSkipped?: boolean;
  } = {},
): Overridden<T>[] {
  const byTime =
    new Map<
      number,
      OccurrenceOverride
    >();
  for (const o of overrides)
    byTime.set(
      o.occurrenceAt.getTime(),
      o,
    );
  const out: Overridden<T>[] =
    [];
  for (const occ of occurrences) {
    const o =
      byTime.get(
        occ.startsAt.getTime(),
      );
    if (
      !o
    ) {
      out.push(
        {
          ...occ,
          originalAt:
            occ.startsAt,
          state:
            'normal',
          note: null,
        },
      );
      continue;
    }
    if (
      o.kind ===
      'skip'
    ) {
      if (
        opts.keepSkipped
      )
        out.push(
          {
            ...occ,
            originalAt:
              occ.startsAt,
            state:
              'skipped',
            note: o.note,
          },
        );
      continue;
    }
    const startsAt =
      o.startsAt ??
      occ.startsAt;
    const keptSpan =
      occ.endsAt
        ? occ.endsAt.getTime() -
          occ.startsAt.getTime()
        : null;
    const endsAt =
      o.endsAt ??
      (keptSpan !=
      null
        ? new Date(
            startsAt.getTime() +
              keptSpan,
          )
        : null);
    const moved =
      {
        ...occ,
        startsAt,
        originalAt:
          occ.startsAt,
        state:
          'moved' as const,
        note: o.note,
      };
    out.push(
      'endsAt' in
        occ ||
        endsAt
        ? {
            ...moved,
            endsAt,
          }
        : moved,
    );
  }
  return out.sort(
    (
      a,
      b,
    ) =>
      a.startsAt.getTime() -
      b.startsAt.getTime(),
  );
}

/** The effective start of one occurrence (its original when it has no move), null when skipped. */
export function effectiveStart(
  at: Date,
  overrides: readonly OccurrenceOverride[],
): Date | null {
  const o =
    overrides.find(
      (
        x,
      ) =>
        x.occurrenceAt.getTime() ===
        at.getTime(),
    );
  if (
    !o
  )
    return at;
  return o.kind ===
    'skip'
    ? null
    : (o.startsAt ??
        at);
}

export type OccurrenceRefusal =
  | 'NOT_OCCURRENCE'
  | 'PAST'
  | 'MOVE_PAST'
  | 'BAD_END'
  | 'COLLIDES'
  | 'MISSING_START';

const DAY = 86_400_000;

/**
 * Can `occurrenceAt` be skipped or moved to `move.startsAt`? Only a future, real occurrence; a move
 * must be in the future, end after it starts and stay strictly between the neighbouring occurrences
 * (never on or past another date of the same series).
 */
export function checkOverride(
  series: RecurringSeries,
  input: {
    occurrenceAt: Date;
    kind: OccurrenceKind;
    startsAt?: Date | null;
    endsAt?: Date | null;
  },
  now: Date,
): OccurrenceRefusal | null {
  const at =
    input.occurrenceAt;
  if (
    occurrenceIndexOf(
      series,
      at,
    ) ===
    null
  )
    return 'NOT_OCCURRENCE';
  if (
    at.getTime() <=
    now.getTime()
  )
    return 'PAST';
  if (
    input.kind ===
    'skip'
  )
    return null;
  const start =
    input.startsAt;
  if (
    !start
  )
    return 'MISSING_START';
  if (
    start.getTime() <=
    now.getTime()
  )
    return 'MOVE_PAST';
  if (
    input.endsAt &&
    input.endsAt.getTime() <=
      start.getTime()
  )
    return 'BAD_END';
  const near =
    occurrencesBetween(
      series,
      new Date(
        at.getTime() -
          40 *
            DAY,
      ),
      new Date(
        at.getTime() +
          40 *
            DAY,
      ),
      90,
    );
  const prev =
    near
      .filter(
        (
          o,
        ) =>
          o.startsAt.getTime() <
          at.getTime(),
      )
      .pop();
  const next =
    near.find(
      (
        o,
      ) =>
        o.startsAt.getTime() >
        at.getTime(),
    );
  if (
    prev &&
    start.getTime() <=
      prev.startsAt.getTime()
  )
    return 'COLLIDES';
  if (
    next &&
    start.getTime() >=
      next.startsAt.getTime()
  )
    return 'COLLIDES';
  return null;
}

/** One upcoming date as the event card lists it. ISO strings, ready for the wire. */
export interface UpcomingDateDTO {
  /** The original start: what an answer is keyed by and what the host's menu acts on. */
  occurrenceAt: string;
  startsAt: string;
  endsAt:
    | string
    | null;
  state: OccurrenceState;
  note:
    | string
    | null;
}

/**
 * The upcoming occurrences of a series after overrides, skipped ones kept, in effective-start order.
 * The scan starts 40 days back so a date moved LATER than its original (which may have passed) is
 * still found; `index` is the occurrence's index in the series (the rotating host is by index).
 */
export function upcomingOccurrences(
  series: RecurringSeries,
  overrides: readonly OccurrenceOverride[],
  opts: {
    now: Date;
    spanMs: number;
    limit?: number;
  },
): Overridden<{
  startsAt: Date;
  endsAt: Date | null;
  index: number;
}>[] {
  const limit =
    opts.limit ??
    8;
  const from =
    new Date(
      opts.now.getTime() -
        40 *
          DAY,
    );
  const horizon =
    new Date(
      opts.now.getTime() +
        800 *
          DAY,
    );
  const raw =
    occurrencesBetween(
      series,
      from,
      horizon,
      limit +
        overrides.length +
        50,
    ).map(
      (
        o,
      ) => ({
        index:
          o.index,
        startsAt:
          o.startsAt,
        endsAt:
          opts.spanMs >
          0
            ? new Date(
                o.startsAt.getTime() +
                  opts.spanMs,
              )
            : null,
      }),
    );
  const cutoff =
    opts.now.getTime() -
    opts.spanMs /
      2;
  return applyOverrides(
    raw,
    overrides,
    {
      keepSkipped: true,
    },
  )
    .filter(
      (
        o,
      ) =>
        o.startsAt.getTime() >=
        cutoff,
    )
    .slice(
      0,
      limit,
    );
}

export const toUpcomingDTO =
  (
    o: Overridden<{
      startsAt: Date;
      endsAt: Date | null;
    }>,
  ): UpcomingDateDTO => ({
    occurrenceAt:
      o.originalAt.toISOString(),
    startsAt:
      o.startsAt.toISOString(),
    endsAt:
      o.endsAt
        ? o.endsAt.toISOString()
        : null,
    state:
      o.state,
    note: o.note,
  });

/** The next dates of a series after overrides, skipped ones kept (shown struck through). */
export function upcomingDates(
  series: RecurringSeries,
  overrides: readonly OccurrenceOverride[],
  opts: {
    now: Date;
    spanMs: number;
    limit?: number;
  },
): UpcomingDateDTO[] {
  return upcomingOccurrences(
    series,
    overrides,
    opts,
  ).map(
    toUpcomingDTO,
  );
}

/**
 * The sentence people are notified with. English, in the event's time zone (a notification row holds
 * one string); `restore` says the date is back on.
 */
export function occurrenceNotice(input: {
  title: string;
  change:
    | OccurrenceKind
    | 'restore';
  occurrenceAt: Date;
  startsAt?: Date | null;
  tz: string;
}): string {
  const day =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        day: 'numeric',
        month:
          'short',
        timeZone:
          input.tz,
      },
    );
  const when =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        weekday:
          'short',
        day: 'numeric',
        month:
          'short',
        hour: '2-digit',
        minute:
          '2-digit',
        hour12: false,
        timeZone:
          input.tz,
      },
    );
  const date =
    day.format(
      input.occurrenceAt,
    );
  if (
    input.change ===
    'skip'
  )
    return `${input.title} on ${date} is skipped`;
  if (
    input.change ===
    'restore'
  )
    return `${input.title} on ${date} is back on`;
  return `${input.title} on ${date} moves to ${when.format(input.startsAt ?? input.occurrenceAt)}`;
}
