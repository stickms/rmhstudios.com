import { prisma } from '@/lib/prisma.server';

/**
 * The member's own subtitle tracks for the account export (sprint 11 16): room, item title, label, cue count and when
 * they were added. Not the cues, and nothing of other members' items.
 */
export async function exportRmhTubeSubtitles(userId: string) {
  const rows = await prisma.rmhTubeSubtitle.findMany({
    where: { addedById: userId },
    orderBy: { createdAt: 'asc' },
    select: {
      roomId: true,
      label: true,
      lang: true,
      cueCount: true,
      createdAt: true,
      queueItem: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    roomId: r.roomId,
    itemTitle: r.queueItem.title,
    label: r.label,
    lang: r.lang,
    cueCount: r.cueCount,
    createdAt: r.createdAt.toISOString(),
  }));
}
