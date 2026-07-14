import { prisma } from '@/lib/prisma.server';
import { publishDueForUser } from '@/lib/scheduled/publish.server';

export interface ScheduledRow {
  id: string;
  content: string;
  gifUrl: string | null;
  imageUrls: string[];
  imageAlts: string[];
  audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  unlockPrice: number | null;
  poll: { question?: string } | null;
  scheduledAt: string | null;
  createdAt: string;
}

/**
 * The viewer's drafts + scheduled posts (publishing any that are now due first).
 * Shared by the `/api/scheduled` GET handler and the `/drafts` route loader so
 * the page is server-rendered / prefetched instead of fetched on mount.
 */
export async function listScheduled(
  userId: string
): Promise<{ drafts: ScheduledRow[]; scheduled: ScheduledRow[] }> {
  await publishDueForUser(userId);

  const rows = await prisma.scheduledPost.findMany({
    where: { userId, publishedId: null },
    orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'desc' }],
  });

  const map = (r: (typeof rows)[number]): ScheduledRow => ({
    id: r.id,
    content: r.content,
    gifUrl: r.gifUrl,
    imageUrls: r.imageUrls,
    imageAlts: r.imageAlts,
    audience: r.audience as ScheduledRow['audience'],
    unlockPrice: r.unlockPrice,
    poll: (r.poll as { question?: string } | null) ?? null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  });

  return {
    drafts: rows.filter((r) => !r.scheduledAt).map(map),
    scheduled: rows.filter((r) => r.scheduledAt).map(map),
  };
}
