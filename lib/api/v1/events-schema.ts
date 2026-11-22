/**
 * Zod schemas, the window rule and cursor encoding for `/api/v1/events*` and `/api/v1/me/events`.
 * Pure (no server imports) so the limits are testable on their own.
 */
import { z } from 'zod';

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
