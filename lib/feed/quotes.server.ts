/**
 * Quote tree (X10) — every quote-post of a post, newest first, paginated, with
 * the quotes of those quotes nested one level beneath.
 *
 * A quote-post is an `rmheet` row whose `originalId` points at the quoted post
 * (index: `rmheet_originalId_idx`, bounded by `take`). Note the write path in
 * `api/rmharks.ts` deliberately flattens a quote of a quote onto the ROOT post
 * to avoid chains, so the nested level only has rows for data written by other
 * paths; the single `in (...)` query that looks for them is bounded and cheap.
 */

import type { FeedItem } from '@/lib/feed-types';
import { prisma } from '@/lib/prisma.server';
import {
  canViewPost,
  audienceWhere,
  supportedCreatorIds,
  circleOwnerIds,
} from '@/lib/feed/audience.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { decodeCursor, encodeCursor, keysetWhere } from '@/lib/feed/cursor';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import {
  QUOTES_PAGE,
  QUOTES_NESTED_PER_PARENT,
  type QuoteNode,
  type QuotesPage,
} from '@/lib/feed/quotes';

export async function listQuotes(
  postId: string,
  viewerId: string | null,
  cursorToken: string | null,
): Promise<QuotesPage | null> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { userId: true, audience: true, deletedAt: true },
  });
  if (!post || post.deletedAt || !(await canViewPost(post, viewerId))) return null;

  const [following, supported, circles, hidden] = await Promise.all([
    viewerId ? getFollowingIds(viewerId) : Promise.resolve([] as string[]),
    supportedCreatorIds(viewerId),
    circleOwnerIds(viewerId),
    getHiddenAuthorIds(viewerId),
  ]);
  // `audienceWhere` and the keyset both use a top-level `OR`, so they are
  // combined under `AND` rather than spread into one object.
  const visible = {
    deletedAt: null,
    ...(hidden.length > 0 ? { userId: { notIn: hidden } } : {}),
    AND: [audienceWhere(viewerId, following, supported, circles)],
  };

  const rows = await prisma.rMHark.findMany({
    where: {
      originalId: postId,
      ...visible,
      AND: [...visible.AND, keysetWhere(decodeCursor(cursorToken))],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: QUOTES_PAGE + 1,
    include: rmharkIncludeLite(viewerId),
  });
  const pageRows = rows.slice(0, QUOTES_PAGE);
  const hasMore = rows.length > QUOTES_PAGE;

  // Quotes of the quotes on this page — one bounded query for the whole page.
  const nestedRows = pageRows.length
    ? await prisma.rMHark.findMany({
        where: { originalId: { in: pageRows.map((r) => r.id) }, ...visible },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: QUOTES_PAGE * QUOTES_NESTED_PER_PARENT,
        include: rmharkIncludeLite(viewerId),
      })
    : [];

  const mapped = await mapRmharksWithBoundedReactions([...pageRows, ...nestedRows], viewerId);
  const byId = new Map<string, FeedItem>(mapped.map((m) => [m.id, m]));
  // The quoted post is the one the reader is already looking at; drop the inline copy.
  const bare = (item: FeedItem): FeedItem => ({ ...item, original: undefined });

  const nestedByParent = new Map<string, FeedItem[]>();
  for (const n of nestedRows) {
    const item = byId.get(n.id);
    if (!item || !n.originalId) continue;
    const list = nestedByParent.get(n.originalId) ?? [];
    if (list.length < QUOTES_NESTED_PER_PARENT) list.push(bare(item));
    nestedByParent.set(n.originalId, list);
  }

  const items: QuoteNode[] = pageRows.flatMap((r) => {
    const item = byId.get(r.id);
    return item ? [{ item: bare(item), quotes: nestedByParent.get(r.id) ?? [] }] : [];
  });

  const last = pageRows[pageRows.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
