/**
 * Zod schemas, the window rule and cursor encoding for `/api/v1/events*` and `/api/v1/me/events`.
 * Pure (no server imports) so the limits are testable on their own.
 */
import { z } from 'zod';
import { UPDATE_MAX } from '@/lib/events/updates';

export const WINDOW_MAX_DAYS = 31;
export const WINDOW_MAX_MS = WINDOW_MAX_DAYS * 86_400_000;
export const PAGE_MAX = 100;
export const PAGE_DEFAULT = 25;
const ID_MAX = 64;

const DATE_OR_STAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** An ISO 8601 date (UTC midnight) or timestamp with an offset. */
export const isoWindowEdge = z
  .string()
  .max(40)
  .refine((v) => DATE_OR_STAMP.test(v) && !Number.isNaN(Date.parse(v)), 'Use an ISO 8601 date or timestamp.')
  .transform((v) => new Date(v));

/** An ISO 8601 instant with an offset: the original start of one date of a repeating event. */
export const isoInstant = z
  .string()
  .max(40)
  .refine((v) => STAMP.test(v) && !Number.isNaN(Date.parse(v)), 'Use an ISO 8601 timestamp, e.g. 2026-11-30T18:00:00Z.')
  .transform((v) => new Date(v));

const idParam = z.string().min(1).max(ID_MAX);
const limit = z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT);
const cursor = z.string().min(1).max(300).optional();

export const eventPath = z.object({
  id: idParam,
});

/** `?from&to&community&limit&cursor`; a repeated parameter is not supported. */
export const listQuery = z.object({
  from: isoWindowEdge.optional(),
  to: isoWindowEdge.optional(),
  community: idParam.optional(),
  limit,
  cursor,
});

export const myEventsQuery = z.object({
  from: isoWindowEdge.optional(),
  to: isoWindowEdge.optional(),
  limit,
  cursor,
});

export const attendeesQuery = z.object({
  occurrence: isoInstant.optional(),
  limit,
  cursor,
});

export const rsvpBody = z
  .object({
    status: z.enum(['going', 'maybe']),
    occurrence: isoInstant.optional(),
    everyTime: z.boolean().optional(),
  })
  .strict();

export const unrsvpQuery = z.object({
  occurrence: isoInstant.optional(),
  everyTime: z.enum(['true', 'false']).optional(),
});

/** The window of a request: `from` defaults to now, `to` to `from` + 31 days; at most 31 days wide. */
export function resolveWindow(
  q: {
    from?: Date | undefined;
    to?: Date | undefined;
  },
  now: Date,
):
  | {
      ok: true;
      from: Date;
      to: Date;
    }
  | {
      ok: false;
      message: string;
    } {
  const from = q.from ?? now;
  const to = q.to ?? new Date(from.getTime() + WINDOW_MAX_MS);
  if (to.getTime() <= from.getTime())
    return {
      ok: false,
      message: '`to` must be after `from`.',
    };
  if (to.getTime() - from.getTime() > WINDOW_MAX_MS)
    return {
      ok: false,
      message: `The window may be at most ${WINDOW_MAX_DAYS} days.`,
    };
  return {
    ok: true,
    from,
    to,
  };
}

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): string | null => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

export interface OccurrenceCursor {
  startsAtMs: number;
  id: string;
  originalMs: number;
}

export function encodeOccurrenceCursor(c: OccurrenceCursor): string {
  return b64(`${c.startsAtMs}|${c.originalMs}|${c.id}`);
}

export function decodeOccurrenceCursor(cursor: string): OccurrenceCursor | null {
  const raw = unb64(cursor);
  if (raw === null) return null;
  const [a, b, ...rest] = raw.split('|');
  const id = rest.join('|');
  const startsAtMs = Number(a);
  const originalMs = Number(b);
  if (!id || !Number.isFinite(startsAtMs) || !Number.isFinite(originalMs)) return null;
  return {
    startsAtMs,
    id,
    originalMs,
  };
}

export const encodeUserCursor = (userId: string): string => b64(userId);
export const decodeUserCursor = (cursor: string): string | null => {
  const raw = unb64(cursor);
  return raw && raw.length <= ID_MAX ? raw : null;
};

/* ── Hosting (manage:events) ─────────────────────────────────────────────── */

/** Event dates are real calendar dates: from 2000 to the end of 2099 (the site's own limits are only "a valid date"). */
const EVENT_DATE_MIN = Date.UTC(2000, 0, 1);
const EVENT_DATE_MAX = Date.UTC(2100, 0, 1);
const eventInstant = isoInstant.refine(
  (d) => d.getTime() >= EVENT_DATE_MIN && d.getTime() < EVENT_DATE_MAX,
  'Use a date between 2000 and 2099.',
);

export const VENUE_KINDS = ['SPACE', 'TOURNAMENT', 'GAME', 'URL', 'IRL'] as const;

/** How an event repeats: `repeat` is `W` (weekly) or `M` (monthly) in `repeat_tz`, optionally until `repeat_until`. Host rotation stays on the site. */
const repeatFields = {
  repeat_tz: z.string().trim().min(1).max(64).optional(),
  repeat_until: eventInstant.optional(),
};

const repeatNeedsZone = (b: { repeat?: unknown; repeat_tz?: unknown; repeat_until?: unknown }) =>
  b.repeat ? b.repeat_tz !== undefined : b.repeat_tz === undefined && b.repeat_until === undefined;
const REPEAT_MESSAGE = '`repeat` needs `repeat_tz`, and `repeat_tz` and `repeat_until` need `repeat`.';

/**
 * `POST /events`. The community is a slug resolved on the server and the host is the key owner: no body field
 * names a host. Dates are checked by the site's own rules (`invalid_dates`, `invalid_venue_url`, ...).
 */
export const createEventBody = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).optional(),
    starts_at: eventInstant,
    ends_at: eventInstant.optional(),
    venue_kind: z.enum(VENUE_KINDS),
    venue: z.string().trim().max(191).optional(),
    capacity: z.number().int().min(1).max(1_000_000).optional(),
    community: z.string().trim().min(1).max(ID_MAX).optional(),
    visibility: z.enum(['public', 'private']).optional(),
    repeat: z.enum(['W', 'M']).optional(),
    ...repeatFields,
  })
  .strict()
  .refine(repeatNeedsZone, REPEAT_MESSAGE);

/** `PATCH /events/{id}`: what the host or a co-host may edit on the site. `null` clears `ends_at`, `venue`, `capacity` and `repeat`. */
export const updateEventBody = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    starts_at: eventInstant.optional(),
    ends_at: eventInstant.nullable().optional(),
    venue_kind: z.enum(VENUE_KINDS).optional(),
    venue: z.string().trim().max(191).nullable().optional(),
    capacity: z.number().int().min(1).max(1_000_000).nullable().optional(),
    repeat: z.enum(['W', 'M']).nullable().optional(),
    ...repeatFields,
  })
  .strict()
  .refine(
    (b) =>
      b.repeat === undefined || b.repeat === null
        ? b.repeat_tz === undefined && b.repeat_until === undefined
        : b.repeat_tz !== undefined,
    REPEAT_MESSAGE,
  )
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Send at least one field to change.');

/** `POST /events/{id}/updates`. `occurrence` (a repeating event): omitted is the next date, `null` the whole series. */
export const postUpdateApiBody = z
  .object({
    body: z.string().trim().min(1).max(UPDATE_MAX),
    occurrence: isoInstant.nullable().optional(),
  })
  .strict();
