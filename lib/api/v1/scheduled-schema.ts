/**
 * Zod schemas, bounds and cursor encoding for `/api/v1/me/scheduled*`. Pure (no server imports) so the
 * limits are testable on their own. The body is the v1 post body (`media_ids` as `POST /api/v1/posts`
 * takes them) plus `scheduledAt`.
 */
import { z } from 'zod';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';
import { contentWarningFieldSchema } from '@/lib/feed/content-warning-schema';
import { pollSchema } from '@/lib/scheduled/scheduled-schema';

export const SCHEDULED_PAGE_MAX = 50;
export const SCHEDULED_PAGE_DEFAULT = 20;
/** A scheduled time is at least this far ahead (a draft has none). */
export const MIN_LEAD_MS = 2 * 60_000;
/** ...and at most this far ahead. */
export const MAX_LEAD_MS = 365 * 24 * 60 * 60_000;

export const SCHEDULED_KINDS = ['draft', 'scheduled', 'capsule'] as const;
export type ScheduledKind = (typeof SCHEDULED_KINDS)[number];

const idParam = z.string().min(1).max(64);

export const scheduledPath = z.object({ id: idParam });

const blankIsAbsent = (v: unknown) => (v === '' || v === null ? undefined : v);

/** `?kind&limit&cursor`. A repeated parameter does not survive, so `kind` is one value. */
export const scheduledListQuery = z.object({
  kind: z.preprocess(blankIsAbsent, z.enum(SCHEDULED_KINDS).optional()),
  limit: z.preprocess(
    blankIsAbsent,
    z.coerce.number().int().min(1).max(SCHEDULED_PAGE_MAX).default(SCHEDULED_PAGE_DEFAULT),
  ),
  cursor: z.preprocess(blankIsAbsent, z.string().min(1).max(300).optional()),
});

const bodyFields = {
  content: z.string().max(MAX_RMHARK_LENGTH),
  poll: pollSchema,
  media_ids: z.array(z.string().min(1).max(64)).max(4),
  media_alts: z.array(z.string().max(1000)).max(4),
  audience: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']),
  replyControl: z.enum(['EVERYONE', 'FOLLOWING', 'MENTIONED']),
  contentWarning: contentWarningFieldSchema,
  communityId: z.string().min(1).max(64),
  /** Absent or null = a draft. */
  scheduledAt: z.string().datetime(),
  /** Accepted only to refuse it with a clear message: a capsule is a ceremony of the site. */
  capsule: z.boolean(),
};

export const createScheduledBody = z.object({
  content: bodyFields.content.optional(),
  poll: bodyFields.poll.optional(),
  media_ids: bodyFields.media_ids.optional(),
  media_alts: bodyFields.media_alts.optional(),
  audience: bodyFields.audience.optional(),
  replyControl: bodyFields.replyControl.optional(),
  contentWarning: bodyFields.contentWarning,
  communityId: bodyFields.communityId.optional(),
  scheduledAt: bodyFields.scheduledAt.nullable().optional(),
  capsule: bodyFields.capsule.optional(),
});

export const patchScheduledBody = z
  .object({
    content: bodyFields.content.optional(),
    poll: bodyFields.poll.nullable().optional(),
    media_ids: bodyFields.media_ids.optional(),
    media_alts: bodyFields.media_alts.optional(),
    audience: bodyFields.audience.optional(),
    replyControl: bodyFields.replyControl.optional(),
    contentWarning: bodyFields.contentWarning,
    communityId: bodyFields.communityId.nullable().optional(),
    scheduledAt: bodyFields.scheduledAt.nullable().optional(),
    capsule: bodyFields.capsule.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Send at least one field to change.',
  });

/** The message when `scheduledAt` is outside the allowed window, or null. Checked in UTC. */
export function scheduleBoundsError(scheduledAt: string, now: number = Date.now()): string | null {
  const t = Date.parse(scheduledAt);
  if (!Number.isFinite(t)) return 'scheduledAt must be an ISO 8601 date and time.';
  if (t < now + MIN_LEAD_MS) return 'scheduledAt must be at least 2 minutes from now.';
  if (t > now + MAX_LEAD_MS) return 'scheduledAt must be at most 365 days from now.';
  return null;
}

/** Why a row is not going out, or null. Computed from the publish checks; never stored. */
export type HeldReason = 'community_sanction' | 'image_descriptions' | 'automod';

/** The list is newest-updated first; a cursor is the last row's `(createdAt, id)`. */
export function encodeScheduledCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.getTime()}:${id}`).toString('base64url');
}

export function decodeScheduledCursor(raw: string): { ms: number; id: string } | null {
  let text: string;
  try {
    text = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const i = text.indexOf(':');
  if (i < 1) return null;
  const ms = Number(text.slice(0, i));
  const id = text.slice(i + 1);
  if (!Number.isInteger(ms) || ms < 0 || id.length === 0 || id.length > 64) return null;
  return { ms, id };
}
