import { describe, expect, it } from 'vitest';
import {
  BULK_KINDS,
  buildBookmarkWhere,
  buildCommentWhere,
  buildFollowWhere,
  buildHistoryWhere,
  buildPostWhere,
  buildWhere,
  bulkFilterSchema,
  bulkProgress,
  createdBefore,
  droppedFilters,
  isBulkKind,
  isTerminal,
  normalizeFilter,
  supportsFilter,
  type BulkFilter,
} from '@/lib/bulk/types';

/**
 * Bulk content management (plan I2) — the filter→predicate mapping.
 *
 * This is the part with the blast radius. Every one of these operations is
 * irreversible for follows, history and bookmarks, and the acceptance criterion
 * is that the previewed count is the processed count — which is only true
 * because the preview, the sample and the runner all call `buildWhere`. So the
 * tests below are mostly about the ways a filter could silently mean something
 * *wider* than what the user read.
 */

const NOW = new Date('2026-08-04T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ME = 'user_me';

describe('the kind vocabulary', () => {
  it('recognises exactly the five shipped kinds', () => {
    for (const kind of BULK_KINDS) expect(isBulkKind(kind)).toBe(true);
    expect(isBulkKind('delete-account')).toBe(false);
    expect(isBulkKind('')).toBe(false);
    expect(isBulkKind(42)).toBe(false);
  });

  it('knows which statuses are finished', () => {
    expect(isTerminal('DONE')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('FAILED')).toBe(true);
    expect(isTerminal('PENDING')).toBe(false);
    expect(isTerminal('RUNNING')).toBe(false);
  });
});

describe('bulkFilterSchema', () => {
  it('accepts the day-one filter set', () => {
    const parsed = bulkFilterSchema.safeParse({
      olderThanDays: 365,
      before: '2025-01-01T00:00:00.000Z',
      maxLikes: 0,
      onlyReplies: true,
      tag: 'rmhstudios',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown key rather than ignoring it', () => {
    // `.strict()` matters here: a typo'd or injected field that parsed and then
    // vanished would be a filter the user thinks is narrowing the set and isn't.
    expect(bulkFilterSchema.safeParse({ minLikes: 5 }).success).toBe(false);
  });

  it('rejects a hashtag with punctuation or a leading #', () => {
    expect(bulkFilterSchema.safeParse({ tag: '#tag' }).success).toBe(false);
    expect(bulkFilterSchema.safeParse({ tag: 'a b' }).success).toBe(false);
    expect(bulkFilterSchema.safeParse({ tag: 'tag_1' }).success).toBe(true);
  });

  it('rejects negative and absurd day counts', () => {
    expect(bulkFilterSchema.safeParse({ olderThanDays: -1 }).success).toBe(false);
    expect(bulkFilterSchema.safeParse({ olderThanDays: 99999 }).success).toBe(false);
    expect(bulkFilterSchema.safeParse({ olderThanDays: 0 }).success).toBe(true);
  });

  it('rejects a non-ISO date', () => {
    expect(bulkFilterSchema.safeParse({ before: '2025-01-01' }).success).toBe(false);
  });
});

describe('normalizeFilter drops what a kind cannot honour', () => {
  it('strips maxLikes from an unfollow', () => {
    // The failure this prevents: `{ kind: 'unfollow', maxLikes: 0 }` reads as
    // "unfollow accounts I never liked" and would otherwise mean "unfollow
    // everyone".
    const filter: BulkFilter = { maxLikes: 0, olderThanDays: 30 };
    expect(normalizeFilter('unfollow', filter)).toEqual({ olderThanDays: 30 });
    expect(droppedFilters('unfollow', filter)).toEqual(['maxLikes']);
  });

  it('strips the hashtag from a comment delete', () => {
    expect(normalizeFilter('delete-comments', { tag: 'x', maxLikes: 2 })).toEqual({ maxLikes: 2 });
    expect(droppedFilters('delete-comments', { tag: 'x' })).toEqual(['tag']);
  });

  it('keeps everything a post delete understands', () => {
    const filter: BulkFilter = {
      olderThanDays: 90,
      before: '2025-01-01T00:00:00.000Z',
      maxLikes: 1,
      onlyReplies: true,
      tag: 'x',
    };
    expect(normalizeFilter('delete-posts', filter)).toEqual(filter);
    expect(droppedFilters('delete-posts', filter)).toEqual([]);
  });

  it('reports support per kind', () => {
    expect(supportsFilter('delete-posts', 'tag')).toBe(true);
    expect(supportsFilter('clear-bookmarks', 'tag')).toBe(false);
    expect(supportsFilter('clear-history', 'olderThanDays')).toBe(true);
  });

  it('never invents a field that was not supplied', () => {
    expect(normalizeFilter('delete-posts', {})).toEqual({});
  });
});

describe('createdBefore', () => {
  it('is null with no time bound at all', () => {
    expect(createdBefore({}, NOW)).toBeNull();
  });

  it('turns olderThanDays into an instant', () => {
    expect(createdBefore({ olderThanDays: 30 }, NOW)?.toISOString()).toBe(
      new Date(NOW.getTime() - 30 * DAY).toISOString(),
    );
  });

  it('takes the NARROWER of the two bounds when both are set', () => {
    // Taking the later instant would widen the selection past what either clause
    // asked for on its own — the wrong direction for a destructive operation.
    const both = { olderThanDays: 1, before: '2020-01-01T00:00:00.000Z' };
    expect(createdBefore(both, NOW)?.toISOString()).toBe('2020-01-01T00:00:00.000Z');

    const other = { olderThanDays: 3650, before: '2026-08-01T00:00:00.000Z' };
    expect(createdBefore(other, NOW)?.toISOString()).toBe(
      new Date(NOW.getTime() - 3650 * DAY).toISOString(),
    );
  });

  it('ignores an unparseable date rather than producing an Invalid Date bound', () => {
    expect(createdBefore({ before: 'not-a-date' }, NOW)).toBeNull();
  });

  it('treats olderThanDays: 0 as "everything up to now"', () => {
    expect(createdBefore({ olderThanDays: 0 }, NOW)?.toISOString()).toBe(NOW.toISOString());
  });
});

describe('buildPostWhere', () => {
  it('always scopes to the author and excludes what is already in the bin', () => {
    // Both halves matter: without `userId` this deletes the site, and without
    // `deletedAt: null` the preview counts rows the runner will skip, which
    // breaks "preview count matches the number processed".
    expect(buildPostWhere(ME, {}, NOW)).toEqual({ userId: ME, deletedAt: null });
  });

  it('adds a createdAt bound', () => {
    expect(buildPostWhere(ME, { olderThanDays: 30 }, NOW)).toEqual({
      userId: ME,
      deletedAt: null,
      createdAt: { lt: new Date(NOW.getTime() - 30 * DAY) },
    });
  });

  it('reads maxLikes as an upper bound, inclusive', () => {
    expect(buildPostWhere(ME, { maxLikes: 0 }, NOW).likeCount).toEqual({ lte: 0 });
  });

  it('treats onlyReplies as thread follow-ups', () => {
    expect(buildPostWhere(ME, { onlyReplies: true }, NOW).threadRootId).toEqual({ not: null });
  });

  it('omits the reply clause entirely when the flag is false', () => {
    expect(buildPostWhere(ME, { onlyReplies: false }, NOW)).not.toHaveProperty('threadRootId');
  });

  it('lower-cases the hashtag to match the normalized registry', () => {
    // `extractHashtags` stores tags lowercased; matching on the raw input would
    // silently return zero for `#RMHStudios`.
    expect(buildPostWhere(ME, { tag: 'RMHStudios' }, NOW).hashtags).toEqual({
      some: { hashtag: { tag: 'rmhstudios' } },
    });
  });
});

describe('buildCommentWhere', () => {
  it('scopes to the author and skips already-deleted comments', () => {
    expect(buildCommentWhere(ME, {}, NOW)).toEqual({ userId: ME, deletedAt: null });
  });

  it('treats onlyReplies as "replies to another comment"', () => {
    expect(buildCommentWhere(ME, { onlyReplies: true }, NOW).parentId).toEqual({ not: null });
  });

  it('honours maxLikes and the time bound together', () => {
    const where = buildCommentWhere(ME, { maxLikes: 3, olderThanDays: 10 }, NOW);
    expect(where.likeCount).toEqual({ lte: 3 });
    expect(where.createdAt).toEqual({ lt: new Date(NOW.getTime() - 10 * DAY) });
  });
});

describe('the non-post predicates', () => {
  it('scopes follows by follower, never by followed', () => {
    // `followingId` here would unfollow the caller from everybody who follows
    // THEM — a different, much worse operation with the same row count.
    expect(buildFollowWhere(ME, {}, NOW)).toEqual({ followerId: ME });
  });

  it('filters history on updatedAt, the column it actually records', () => {
    expect(buildHistoryWhere(ME, { olderThanDays: 7 }, NOW)).toEqual({
      userId: ME,
      updatedAt: { lt: new Date(NOW.getTime() - 7 * DAY) },
    });
  });

  it('filters bookmarks on createdAt', () => {
    expect(buildBookmarkWhere(ME, { olderThanDays: 7 }, NOW)).toEqual({
      userId: ME,
      createdAt: { lt: new Date(NOW.getTime() - 7 * DAY) },
    });
  });
});

describe('buildWhere dispatch', () => {
  it('routes each kind to its own predicate', () => {
    expect(buildWhere('delete-posts', ME, {}, NOW)).toEqual(buildPostWhere(ME, {}, NOW));
    expect(buildWhere('delete-comments', ME, {}, NOW)).toEqual(buildCommentWhere(ME, {}, NOW));
    expect(buildWhere('unfollow', ME, {}, NOW)).toEqual(buildFollowWhere(ME, {}, NOW));
    expect(buildWhere('clear-history', ME, {}, NOW)).toEqual(buildHistoryWhere(ME, {}, NOW));
    expect(buildWhere('clear-bookmarks', ME, {}, NOW)).toEqual(buildBookmarkWhere(ME, {}, NOW));
  });

  it('normalises before building, so an unsupported field cannot leak into a where', () => {
    // The one that would actually be dangerous: a `maxLikes` surviving into the
    // follow predicate would throw at the database rather than narrowing — or,
    // worse, be dropped by Prisma and widen the delete.
    const where = buildWhere('unfollow', ME, { maxLikes: 0, tag: 'x' }, NOW);
    expect(where).toEqual({ followerId: ME });
  });

  it('scopes every kind to the caller', () => {
    for (const kind of BULK_KINDS) {
      const where = buildWhere(kind, ME, {}, NOW);
      const scoped = where.userId === ME || where.followerId === ME;
      expect({ kind, scoped }).toEqual({ kind, scoped: true });
    }
  });
});

describe('bulkProgress', () => {
  it('reports whole percentages', () => {
    expect(bulkProgress({ total: 200, processed: 50 })).toBe(25);
    expect(bulkProgress({ total: 3, processed: 1 })).toBe(33);
  });

  it('calls an empty operation finished rather than dividing by zero', () => {
    expect(bulkProgress({ total: 0, processed: 0 })).toBe(100);
  });

  it('never exceeds 100 if processed overshoots', () => {
    expect(bulkProgress({ total: 10, processed: 12 })).toBe(100);
  });
});
