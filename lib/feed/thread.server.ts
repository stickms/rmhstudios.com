/**
 * Read an authored thread: the root post plus its follow-up segments, ordered.
 * Accepts either the root id or any segment id (resolves to the real root).
 */

import { prisma } from '@/lib/prisma.server';
import { rmharkInclude, mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import type { FeedItem } from '@/lib/feed-types';

export async function getThread(id: string, viewerId: string | null): Promise<FeedItem[] | null> {
  const anchor = await prisma.rMHark.findUnique({
    where: { id },
    select: { id: true, threadRootId: true },
  });
  if (!anchor) return null;
  const rootId = anchor.threadRootId ?? anchor.id;

  const posts = await prisma.rMHark.findMany({
    where: {
      OR: [{ id: rootId }, { threadRootId: rootId }],
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: rmharkInclude(viewerId),
  });
  if (posts.length === 0) return null;

  return posts.map((p) => mapRmharkToFeedItem(p, viewerId));
}
