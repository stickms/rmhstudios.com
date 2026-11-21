/**
 * Log publication (s03-05) — pure: the three states a Log can be in, the one filter every public reader uses,
 * schedule validation and the status transitions a save may make. No Prisma client at runtime, no `.server` imports.
 *
 * A Log is `draft` (only admins see it), `scheduled` (a draft with a time; the per-minute job publishes it) or
 * `published`. `published` is also the database default, so a release that knows no status keeps creating live Logs.
 */
import type { Prisma } from '@prisma/client';

export const LOG_STATUSES =
  [
    'draft',
    'scheduled',
    'published',
  ] as const;
export type LogStatus =
  (typeof LOG_STATUSES)[number];

export function isLogStatus(
  value: unknown,
): value is LogStatus {
  return (
    typeof value ===
      'string' &&
    (
      LOG_STATUSES as readonly string[]
    ).includes(
      value,
    )
  );
}

/** A scheduled Log must be at least this far ahead when it is scheduled. */
export const MIN_SCHEDULE_LEAD_MS =
  5 *
  60_000;
/** The farthest ahead a Log can be scheduled. */
export const MAX_SCHEDULE_AHEAD_MS =
  366 *
  24 *
  60 *
  60_000;
/** Revisions kept per Log; the oldest are pruned. */
export const MAX_REVISIONS_PER_LOG = 50;

/**
 * The only way public code filters Logs: live ones. `lib/__tests__/blog-published-filter.test.ts` fails a
 * `prisma.blogPost.find*` anywhere else that does not use it.
 */
export function publishedLogWhere(
  now: Date,
): Prisma.BlogPostWhereInput {
  return {
    status:
      'published',
    publishedAt:
      {
        lte: now,
      },
  };
}

export type ScheduleCheck =
  | {
      ok: true;
      at: Date;
    }
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'too-soon'
        | 'too-far';
    };

/** A wanted publish time (ISO instant) checked against `now`: parseable, 5 minutes to a year ahead. */
export function validateSchedule(
  publishAt:
    | string
    | null
    | undefined,
  now: Date,
): ScheduleCheck {
  if (
    typeof publishAt !==
      'string' ||
    publishAt ===
      ''
  )
    return {
      ok: false,
      reason:
        'invalid',
    };
  const at =
    new Date(
      publishAt,
    );
  const ms =
    at.getTime();
  if (
    Number.isNaN(
      ms,
    )
  )
    return {
      ok: false,
      reason:
        'invalid',
    };
  if (
    ms <
    now.getTime() +
      MIN_SCHEDULE_LEAD_MS
  )
    return {
      ok: false,
      reason:
        'too-soon',
    };
  if (
    ms >
    now.getTime() +
      MAX_SCHEDULE_AHEAD_MS
  )
    return {
      ok: false,
      reason:
        'too-far',
    };
  return {
    ok: true,
    at,
  };
}

export interface StatusColumns {
  status: LogStatus;
  publishAt: Date | null;
  publishedAt: Date | null;
}

export type Transition =
  | {
      ok: true;
      columns: StatusColumns;
      becamePublished: boolean;
    }
  | {
      ok: false;
      reason:
        | 'invalid-schedule'
        | 'too-soon'
        | 'too-far'
        | 'already-published';
    };

/**
 * What a save that asks for `requested` writes. `current` is null for a new Log.
 * - draft: no time, no publication date (an unpublished Log is no longer "published at" anything);
 * - scheduled: needs a valid time, and a live Log cannot be scheduled (unpublish it first);
 * - published: stamped now when it was not live, and keeps its date when it already was.
 * `becamePublished` tells the caller to start the announcement and fan-out clocks.
 */
export function resolveTransition(
  current: {
    status: LogStatus;
    publishedAt: Date | null;
  } | null,
  requested: LogStatus,
  publishAt:
    | string
    | null
    | undefined,
  now: Date,
): Transition {
  if (
    requested ===
    'draft'
  ) {
    return {
      ok: true,
      columns:
        {
          status:
            'draft',
          publishAt:
            null,
          publishedAt:
            null,
        },
      becamePublished: false,
    };
  }
  if (
    requested ===
    'scheduled'
  ) {
    if (
      current?.status ===
      'published'
    )
      return {
        ok: false,
        reason:
          'already-published',
      };
    const check =
      validateSchedule(
        publishAt,
        now,
      );
    if (
      !check.ok
    ) {
      return {
        ok: false,
        reason:
          check.reason ===
          'invalid'
            ? 'invalid-schedule'
            : check.reason,
      };
    }
    return {
      ok: true,
      columns:
        {
          status:
            'scheduled',
          publishAt:
            check.at,
          publishedAt:
            null,
        },
      becamePublished: false,
    };
  }
  const wasLive =
    current?.status ===
    'published';
  return {
    ok: true,
    columns:
      {
        status:
          'published',
        publishAt:
          null,
        publishedAt:
          wasLive
            ? (current?.publishedAt ??
              now)
            : now,
      },
    becamePublished:
      !wasLive,
  };
}

/** Words in a text, for the revision list's delta. */
export function wordCount(
  text: string,
): number {
  const trimmed =
    text.trim();
  return trimmed ===
    ''
    ? 0
    : trimmed.split(
        /\s+/,
      )
        .length;
}

/** Did a save change what a revision records? */
export function revisionChanged(
  before: {
    title: string;
    description: string;
    tags: readonly string[];
    content: string;
  },
  after: {
    title: string;
    description: string;
    tags: readonly string[];
    content: string;
  },
): boolean {
  return (
    before.title !==
      after.title ||
    before.description !==
      after.description ||
    before.content !==
      after.content ||
    before
      .tags
      .length !==
      after
        .tags
        .length ||
    before.tags.some(
      (
        tag,
        i,
      ) =>
        tag !==
        after
          .tags[
          i
        ],
    )
  );
}

/** An ISO instant as `YYYY-MM-DD HH:mm` in UTC: the same on the server and in the browser, so it can render in SSR. */
export function formatUtcMinute(
  iso: string,
): string {
  const ms =
    Date.parse(
      iso,
    );
  return Number.isNaN(
    ms,
  )
    ? ''
    : new Date(
        ms,
      )
        .toISOString()
        .slice(
          0,
          16,
        )
        .replace(
          'T',
          ' ',
        );
}

/** The statuses an admin list can be filtered to; `all` is every Log. */
export type LogFilter =
  | 'all'
  | LogStatus;

export function filterLogs<
  T extends
    {
      status: LogStatus;
    },
>(
  rows: readonly T[],
  filter: LogFilter,
): T[] {
  return filter ===
    'all'
    ? [
        ...rows,
      ]
    : rows.filter(
        (
          r,
        ) =>
          r.status ===
          filter,
      );
}
