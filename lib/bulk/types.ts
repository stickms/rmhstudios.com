/**
 * Bulk content management — the pure half (plan I2).
 *
 * A filter description, the zod schema that validates one off the wire, and the
 * translation from a filter into a Prisma `where`. Kept free of Prisma imports
 * so the filter→predicate mapping — the part with the actual blast radius — is
 * unit-testable without a database, and so the client can share the vocabulary.
 *
 * The blast radius is the whole risk here: every one of these operations is
 * irreversible for follows, history and bookmarks, and a filter that quietly
 * means something wider than the user read is how somebody loses four thousand
 * posts they meant to keep. Hence: one place that turns a filter into a
 * predicate, used identically by the preview count, the sample and the run.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Kinds                                                                      */
/* -------------------------------------------------------------------------- */

export const BULK_KINDS = [
  'delete-posts',
  'delete-comments',
  'unfollow',
  'clear-history',
  'clear-bookmarks',
] as const;

export type BulkKind = (typeof BULK_KINDS)[number];

export function isBulkKind(value: unknown): value is BulkKind {
  return typeof value === 'string' && (BULK_KINDS as readonly string[]).includes(value);
}

/** Mirrors `BulkOperation.status` (`VarChar(12)`). */
export const BULK_STATUSES = ['PENDING', 'RUNNING', 'DONE', 'CANCELLED', 'FAILED'] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

/** A run in one of these states is finished; nothing will move it again. */
export function isTerminal(status: string): boolean {
  return status === 'DONE' || status === 'CANCELLED' || status === 'FAILED';
}

/* -------------------------------------------------------------------------- */
/* Filter                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Rows per chunk. Small enough that a cancel lands within a second or two and
 * that no chunk's id array is a memory problem at 5,000+ matches; large enough
 * that the per-chunk round trips don't dominate.
 */
export const BULK_CHUNK_SIZE = 100;

/** Matches shown beside the count before the operation is confirmable. */
export const BULK_SAMPLE_SIZE = 10;

/** Hard ceiling on `olderThanDays`, ~10 years. Guards a nonsense filter. */
export const MAX_OLDER_THAN_DAYS = 3650;

export const bulkFilterSchema = z
  .object({
    /** Only rows older than N days. */
    olderThanDays: z.number().int().min(0).max(MAX_OLDER_THAN_DAYS).optional(),
    /** Only rows created strictly before this instant. */
    before: z.string().datetime().optional(),
    /** Posts/comments with at most this many likes. */
    maxLikes: z.number().int().min(0).max(1_000_000).optional(),
    /** Replies only — see `buildPostWhere` / `buildCommentWhere` for what that means. */
    onlyReplies: z.boolean().optional(),
    /** Posts carrying this hashtag (without the `#`). */
    tag: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[\p{L}\p{N}_]+$/u)
      .optional(),
  })
  .strict();

export type BulkFilter = z.infer<typeof bulkFilterSchema>;

/** Which filter fields each kind actually understands. */
export const FILTER_SUPPORT: Record<BulkKind, readonly (keyof BulkFilter)[]> = {
  'delete-posts': ['olderThanDays', 'before', 'maxLikes', 'onlyReplies', 'tag'],
  'delete-comments': ['olderThanDays', 'before', 'maxLikes', 'onlyReplies'],
  // A follow edge has a creation date and nothing else worth filtering on.
  unfollow: ['olderThanDays', 'before'],
  'clear-history': ['olderThanDays', 'before'],
  'clear-bookmarks': ['olderThanDays', 'before'],
};

export function supportsFilter(kind: BulkKind, field: keyof BulkFilter): boolean {
  return FILTER_SUPPORT[kind].includes(field);
}

/**
 * Drop filter fields the kind cannot honour.
 *
 * Silently ignoring an unsupported field would be the worst possible failure
 * here: `{ kind: 'unfollow', maxLikes: 0 }` reads as "unfollow the accounts I
 * never liked" and would actually mean "unfollow everyone". Callers normalise
 * first and show the user the normalised filter, and `describeDropped` names
 * what was removed so the UI can say so out loud.
 */
export function normalizeFilter(kind: BulkKind, filter: BulkFilter): BulkFilter {
  const allowed = FILTER_SUPPORT[kind];
  const out: BulkFilter = {};
  for (const key of allowed) {
    const value = filter[key];
    if (value !== undefined) {
      // Assigning through a union of optional props needs the widening cast;
      // `allowed` is typed from the same key set, so this is sound.
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** Filter fields the caller supplied that this kind will ignore. */
export function droppedFilters(kind: BulkKind, filter: BulkFilter): (keyof BulkFilter)[] {
  return (Object.keys(filter) as (keyof BulkFilter)[]).filter(
    (key) => filter[key] !== undefined && !supportsFilter(kind, key),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The "created before" instant a filter implies, or `null` for no bound.
 *
 * `olderThanDays` and `before` compose by taking the **earlier** of the two —
 * the narrower window. Taking the later one would widen the selection past what
 * either clause on its own asked for, which is the wrong direction for a
 * destructive operation.
 */
export function createdBefore(filter: BulkFilter, now: Date): Date | null {
  const bounds: number[] = [];
  if (filter.olderThanDays !== undefined) {
    bounds.push(now.getTime() - filter.olderThanDays * DAY_MS);
  }
  if (filter.before !== undefined) {
    const parsed = Date.parse(filter.before);
    if (!Number.isNaN(parsed)) bounds.push(parsed);
  }
  if (bounds.length === 0) return null;
  return new Date(Math.min(...bounds));
}

/* -------------------------------------------------------------------------- */
/* Filter → predicate                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Structural `where` shapes. Typed as plain records rather than
 * `Prisma.RMHarkWhereInput` so this module stays importable without the
 * generated client (the same reason `lib/entitlements/tiers.ts` exists apart
 * from `lib/entitlements.ts`). The server module passes them straight to Prisma,
 * which type-checks them at that call site.
 */
export type WhereShape = Record<string, unknown>;

/**
 * Posts eligible for a bulk delete.
 *
 * Always scoped to the author and always excluding rows already in the bin —
 * counting a soft-deleted post in the preview and then "processing" it would
 * make the promised "preview count matches the number processed" true only by
 * accident.
 *
 * `onlyReplies` means a **thread follow-up**: a post whose `threadRootId` is
 * set, i.e. a segment the author chained onto one of their own posts rather than
 * a standalone one. RMHark has no post-replies-to-post edge other than this and
 * quote-reposts, and a quote-repost is not a reply.
 */
export function buildPostWhere(userId: string, filter: BulkFilter, now: Date): WhereShape {
  const where: WhereShape = { userId, deletedAt: null };
  const before = createdBefore(filter, now);
  if (before) where.createdAt = { lt: before };
  if (filter.maxLikes !== undefined) where.likeCount = { lte: filter.maxLikes };
  if (filter.onlyReplies) where.threadRootId = { not: null };
  if (filter.tag) where.hashtags = { some: { hashtag: { tag: filter.tag.toLowerCase() } } };
  return where;
}

/**
 * Comments eligible for a bulk delete. `onlyReplies` here is the literal thing:
 * a comment that replies to another comment (`parentId` set) rather than to the
 * post.
 */
export function buildCommentWhere(userId: string, filter: BulkFilter, now: Date): WhereShape {
  const where: WhereShape = { userId, deletedAt: null };
  const before = createdBefore(filter, now);
  if (before) where.createdAt = { lt: before };
  if (filter.maxLikes !== undefined) where.likeCount = { lte: filter.maxLikes };
  if (filter.onlyReplies) where.parentId = { not: null };
  return where;
}

/** Follow edges the caller owns (they are the follower — never the followed). */
export function buildFollowWhere(userId: string, filter: BulkFilter, now: Date): WhereShape {
  const where: WhereShape = { followerId: userId };
  const before = createdBefore(filter, now);
  if (before) where.createdAt = { lt: before };
  return where;
}

/** History rows. `HistoryEntry` records last-visit time, so it filters on `updatedAt`. */
export function buildHistoryWhere(userId: string, filter: BulkFilter, now: Date): WhereShape {
  const where: WhereShape = { userId };
  const before = createdBefore(filter, now);
  if (before) where.updatedAt = { lt: before };
  return where;
}

/** Bookmark rows. */
export function buildBookmarkWhere(userId: string, filter: BulkFilter, now: Date): WhereShape {
  const where: WhereShape = { userId };
  const before = createdBefore(filter, now);
  if (before) where.createdAt = { lt: before };
  return where;
}

/** The one dispatch from kind to predicate, shared by preview, sample and run. */
export function buildWhere(
  kind: BulkKind,
  userId: string,
  filter: BulkFilter,
  now: Date,
): WhereShape {
  const normalized = normalizeFilter(kind, filter);
  switch (kind) {
    case 'delete-posts':
      return buildPostWhere(userId, normalized, now);
    case 'delete-comments':
      return buildCommentWhere(userId, normalized, now);
    case 'unfollow':
      return buildFollowWhere(userId, normalized, now);
    case 'clear-history':
      return buildHistoryWhere(userId, normalized, now);
    case 'clear-bookmarks':
      return buildBookmarkWhere(userId, normalized, now);
  }
}

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

/** One of the ten sampled matches shown before the user confirms. */
export interface BulkSample {
  id: string;
  /** A one-line preview: post/comment text, an @handle, or an entity label. */
  label: string;
  /** Secondary line — a date, a like count, an entity type. */
  detail: string | null;
}

export interface BulkPreview {
  kind: BulkKind;
  filter: BulkFilter;
  /** Exact count, not an estimate. */
  total: number;
  sample: BulkSample[];
  /** Filter fields dropped because this kind ignores them. */
  dropped: (keyof BulkFilter)[];
}

export interface BulkOperationView {
  id: string;
  kind: BulkKind;
  filter: BulkFilter;
  status: BulkStatus;
  total: number;
  processed: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** Percent complete, 0–100. `total: 0` is a finished no-op, not a division. */
export function bulkProgress(op: Pick<BulkOperationView, 'total' | 'processed'>): number {
  if (op.total <= 0) return 100;
  return Math.min(100, Math.round((op.processed / op.total) * 100));
}
