/**
 * Pure shaping for the outbox console (`/admin/outbox`): topic ordering, ages, id lists and the
 * rows the browser sees. Client-safe: no Prisma, no zod. A payload goes through `toJsonField` from
 * the jobs console (redacted, formatted, capped at 8 KB).
 */
import { errorFirstLine } from '@/lib/admin/jobs';

export type { JsonField } from '@/lib/admin/jobs';
import type { JsonField } from '@/lib/admin/jobs';

/** The event states the console lists, in tab order. */
export const OUTBOX_LIST_STATES =
  [
    'dead',
    'pending',
  ] as const;
export type OutboxListState =
  (typeof OUTBOX_LIST_STATES)[number];

export type OutboxAction =
  | 'requeue'
  | 'discard';

/** Rows per page of a topic's event list. */
export const OUTBOX_PAGE_SIZE = 50;
/** Most event ids one requeue or discard call may name. */
export const MAX_BULK_EVENTS = 100;
/** Most dead events "requeue all in this topic" touches in one call. */
export const MAX_TOPIC_EVENTS = 500;

/** A topic name: lowercase words joined by `.`, `:`, `_` or `-`. */
export const TOPIC_PATTERN =
  /^[a-z0-9._:-]{1,80}$/;
/** An event id is a Postgres `bigint`: decimal digits, at most 19 of them. */
export const EVENT_ID_PATTERN =
  /^\d{1,19}$/;
const MAX_BIGINT =
  9223372036854775807n;

export interface TopicSummary {
  topic: string;
  /** Not delivered, not dead, due now. */
  pendingDue: number;
  /** Not delivered, not dead, waiting for a later attempt. */
  scheduled: number;
  dead: number;
  /** Delivered in the last 24 hours. */
  delivered24h: number;
  /** ISO creation time of the oldest event still pending; null when none is. */
  oldestPendingAt:
    | string
    | null;
}

export interface OutboxEventRow {
  /** The bigint id as a decimal string. */
  id: string;
  createdAt: string;
  attempts: number;
  nextAttempt: string;
  deadAt:
    | string
    | null;
  /** First line of the last error. */
  error:
    | string
    | null;
}

export interface OutboxEventDetail extends OutboxEventRow {
  topic: string;
  deliveredAt:
    | string
    | null;
  /** The whole last error (the column holds at most 500 characters). */
  lastError:
    | string
    | null;
  payload: JsonField;
}

/** Topics with dead events first (most dead first), then the rest; each group by name. */
export function sortTopics<
  T extends
    {
      topic: string;
      dead: number;
    },
>(
  topics: readonly T[],
): T[] {
  return [
    ...topics,
  ].sort(
    (
      a,
      b,
    ) => {
      const ad =
        a.dead >
        0
          ? 0
          : 1;
      const bd =
        b.dead >
        0
          ? 0
          : 1;
      if (
        ad !==
        bd
      )
        return (
          ad -
          bd
        );
      if (
        ad ===
          0 &&
        a.dead !==
          b.dead
      )
        return (
          b.dead -
          a.dead
        );
      return a.topic <
        b.topic
        ? -1
        : a.topic >
            b.topic
          ? 1
          : 0;
    },
  );
}

/**
 * An age as at most two units, largest first: `45s`, `3m`, `2h 5m`, `4d 3h`. Negative or invalid
 * ages (a clock that moved back) read as `0s`. Locale-neutral: letters are unit symbols.
 */
export function formatAge(
  ms: number,
): string {
  if (
    !Number.isFinite(
      ms,
    ) ||
    ms <
      1000
  )
    return '0s';
  const s =
    Math.floor(
      ms /
        1000,
    );
  const d =
    Math.floor(
      s /
        86400,
    );
  const h =
    Math.floor(
      (s %
        86400) /
        3600,
    );
  const m =
    Math.floor(
      (s %
        3600) /
        60,
    );
  if (
    d >
    0
  )
    return h >
      0
      ? `${d}d ${h}h`
      : `${d}d`;
  if (
    h >
    0
  )
    return m >
      0
      ? `${h}h ${m}m`
      : `${h}h`;
  if (
    m >
    0
  )
    return `${m}m`;
  return `${s}s`;
}

/** Age of `iso` at `now`; null when there is nothing pending. */
export function ageOf(
  iso:
    | string
    | null,
  now: number,
):
  | string
  | null {
  if (
    !iso
  )
    return null;
  const t =
    new Date(
      iso,
    ).getTime();
  return Number.isNaN(
    t,
  )
    ? null
    : formatAge(
        now -
          t,
      );
}

/** The event ids of a comma-separated list as bigints, deduplicated; null when empty, over the cap or any is not an id. */
export function parseEventIds(
  csv: string,
):
  | bigint[]
  | null {
  const parts =
    csv
      .split(
        ',',
      )
      .map(
        (
          s,
        ) =>
          s.trim(),
      );
  if (
    parts.length ===
      0 ||
    parts.length >
      MAX_BULK_EVENTS
  )
    return null;
  if (
    !parts.every(
      (
        p,
      ) =>
        EVENT_ID_PATTERN.test(
          p,
        ),
    )
  )
    return null;
  const ids =
    parts.map(
      (
        p,
      ) =>
        BigInt(
          p,
        ),
    );
  if (
    ids.some(
      (
        id,
      ) =>
        id >
        MAX_BIGINT,
    )
  )
    return null;
  return [
    ...new Set(
      ids,
    ),
  ];
}

/** One id, or null when it is not a valid event id. */
export function parseEventId(
  raw: string,
):
  | bigint
  | null {
  if (
    !EVENT_ID_PATTERN.test(
      raw,
    )
  )
    return null;
  const id =
    BigInt(
      raw,
    );
  return id >
    MAX_BIGINT
    ? null
    : id;
}

/** What a list row shows of an event's last error. */
export function rowError(
  lastError:
    | string
    | null,
):
  | string
  | null {
  return errorFirstLine(
    lastError,
  );
}

/** Which actions an event in a list state may have. Both apply to dead events only. */
export function actionsForState(
  state: OutboxListState,
): OutboxAction[] {
  return state ===
    'dead'
    ? [
        'requeue',
        'discard',
      ]
    : [];
}
