import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import type { FeedItem } from '@/lib/feed-types';

export interface TagFeedResult {
  tag: string;
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Posts containing #tag, newest first (cursor paginated), scoped to `viewerId`.
 *
 * Shared by the `/api/tags/$tag` GET handler and the `/tag/$tag` route loader so
 * the first page is server-rendered / prefetched instead of fetched client-side
 * on mount. FeedItem dates are already ISO strings from `mapRmharkToFeedItem`.
 */
export async function listTagFeed(
  rawTag: string,
  opts: { viewerId?: string | null; cursor?: string | null; limit?: number } = {},
): Promise<TagFeedResult> {
  // Normalize to how tags are stored (see lib/tags-extract.server.ts): strip a
  // leading '#', lowercase, and keep only tag-legal (Unicode) word chars.
  const tag = rawTag
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 64);
  if (!tag) return { tag: '', items: [], nextCursor: null, hasMore: false };

  const viewerId = opts.viewerId ?? null;
  const cursor = opts.cursor ?? null;
  const limit = Math.min(opts.limit ?? 20, 50);

  const hidden = await getHiddenAuthorIds(viewerId);

  // Two steps, on purpose (WS8). Step 1 picks the page's ids as a keyset scan of
  // the tag's own post_hashtag rows, newest first, via
  // post_hashtag(hashtagId, createdAt DESC, rmheetId DESC) - it stops after
  // limit+1 survivors instead of fetching and sorting every tagged post (4k for a
  // busy tag; as one Prisma findMany the planner probed each by primary key and
  // costed all the hydration LATERAL joins on top, which also tripped JIT).
  // Step 2 hydrates exactly those ids.
  //
  // post_hashtag.createdAt is the post's createdAt by construction
  // (linkPostHashtags, migration 20261022160000), so this ordering is the old
  // `ORDER BY rmheet.createdAt DESC, rmheet.id DESC`.
  //
  // Every visibility predicate of the old `where` is kept in SQL form: not
  // deleted, not a hidden author, the audience rule of audienceWhereExact()
  // (PUBLIC / own / FOLLOWERS the viewer follows / SUPPORTERS of an author the
  // viewer supports / CIRCLE of a circle the viewer is in), and
  // communityVisibleWhere() (private community posts only for its members).
  // The follow, membership and circle checks are correlated EXISTS probes on
  // their unique indexes: exact for any follow count (no capped id list) and
  // nothing bound as a parameter.
  const audience = viewerId
    ? Prisma.sql`(r.audience = 'PUBLIC'::"RMHarkAudience"
        OR r."userId" = ${viewerId}
        OR (r.audience = 'FOLLOWERS'::"RMHarkAudience" AND EXISTS (
          SELECT 1 FROM follow f WHERE f."followerId" = ${viewerId} AND f."followingId" = r."userId"))
        OR (r.audience = 'SUPPORTERS'::"RMHarkAudience" AND EXISTS (
          SELECT 1 FROM creator_membership cm
          WHERE cm."supporterId" = ${viewerId} AND cm."creatorId" = r."userId" AND cm."expiresAt" > now()))
        OR (r.audience = 'CIRCLE'::"RMHarkAudience" AND EXISTS (
          SELECT 1 FROM close_friend cf WHERE cf."memberId" = ${viewerId} AND cf."ownerId" = r."userId")))`
    : Prisma.sql`r.audience = 'PUBLIC'::"RMHarkAudience"`;
  const communityVisible = viewerId
    ? Prisma.sql`(r."communityId" IS NULL OR NOT EXISTS (
        SELECT 1 FROM community c WHERE c.id = r."communityId" AND c."isPrivate"
          AND NOT EXISTS (SELECT 1 FROM community_member m WHERE m."communityId" = c.id AND m."userId" = ${viewerId})))`
    : Prisma.sql`(r."communityId" IS NULL OR NOT EXISTS (
        SELECT 1 FROM community c WHERE c.id = r."communityId" AND c."isPrivate"))`;
  const hiddenClause = hidden.length
    ? Prisma.sql`AND r."userId" <> ALL(${hidden}::text[])`
    : Prisma.empty;
  const cursorClause = cursor
    ? Prisma.sql`AND (ph."createdAt", ph."rmheetId") < (SELECT "createdAt", id FROM rmheet WHERE id = ${cursor})`
    : Prisma.empty;

  const idRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT ph."rmheetId" AS id
    FROM post_hashtag ph
    JOIN rmheet r ON r.id = ph."rmheetId"
    WHERE ph."hashtagId" = (SELECT id FROM hashtag WHERE tag = ${tag})
      AND r."deletedAt" IS NULL
      AND ${audience}
      AND ${communityVisible}
      ${hiddenClause}
      ${cursorClause}
    ORDER BY ph."createdAt" DESC, ph."rmheetId" DESC
    LIMIT ${limit + 1}
  `);
  const ids = idRows.map((r) => r.id);
  const hydrated = ids.length
    ? await prisma.rMHark.findMany({
        where: { id: { in: ids } },
        include: rmharkIncludeLite(viewerId),
      })
    : [];
  const byId = new Map(hydrated.map((r) => [r.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter((r): r is (typeof hydrated)[number] => !!r);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapRmharksWithBoundedReactions(page, viewerId);

  return {
    tag,
    items,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    hasMore,
  };
}
