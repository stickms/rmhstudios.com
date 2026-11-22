import { prisma } from '@/lib/prisma.server';
import { publishDueForUser } from '@/lib/scheduled/publish.server';

export interface ScheduledRow {
  id: string;
  content: string;
  gifUrl: string | null;
  gifAlt: string | null;
  /** The reason for the content warning, carried to the published post (sprint 06 #16). */
  contentWarning: string | null;
  imageUrls: string[];
  imageAlts: string[];
  audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  unlockPrice: number | null;
  poll: { question?: string } | null;
  scheduledAt: string | null;
  createdAt: string;
  /** Why the last publish attempt left this draft unpublished; null once the draft was edited since (s09-11). */
  blockedReason: string | null;
}

/** The notices a refused attempt leaves; the newest per draft is the row's reason. */
export const BLOCKED_NOTICE_TYPES = ['scheduled-refused', 'scheduled-alt-required'] as const;

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
    // Time capsules (Z7) have their own list; they would only be noise here.
    where: { userId, publishedId: null, isCapsule: false },
    orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'desc' }],
  });

  // One query for every listed draft's refusal notices, newest first; the first per draft is the one that counts.
  const notices =
    rows.length > 0
      ? await prisma.notification.findMany({
          where: {
            userId,
            type: 'SYSTEM',
            entityType: { in: [...BLOCKED_NOTICE_TYPES] },
            entityId: { in: rows.map((r) => r.id) },
          },
          orderBy: { createdAt: 'desc' },
          select: { entityId: true, preview: true, createdAt: true },
        })
      : [];
  const newest = new Map<string, { preview: string; createdAt: Date }>();
  for (const n of Array.isArray(notices) ? notices : []) {
    if (n.entityId && n.preview && !newest.has(n.entityId)) newest.set(n.entityId, { preview: n.preview, createdAt: n.createdAt });
  }
  // Editing a draft bumps its `updatedAt`, which clears the line until the next due pass decides again.
  const reasonOf = (r: (typeof rows)[number]): string | null => {
    const n = newest.get(r.id);
    return n && n.createdAt.getTime() > r.updatedAt.getTime() ? n.preview : null;
  };

  const map = (r: (typeof rows)[number]): ScheduledRow => ({
    id: r.id,
    content: r.content,
    gifUrl: r.gifUrl,
    gifAlt: r.gifAlt,
    contentWarning: r.contentWarning ?? null,
    imageUrls: r.imageUrls,
    imageAlts: r.imageAlts,
    audience: r.audience as ScheduledRow['audience'],
    unlockPrice: r.unlockPrice,
    poll: (r.poll as { question?: string } | null) ?? null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    blockedReason: reasonOf(r),
  });

  return {
    drafts: rows.filter((r) => !r.scheduledAt).map(map),
    scheduled: rows.filter((r) => r.scheduledAt).map(map),
  };
}
