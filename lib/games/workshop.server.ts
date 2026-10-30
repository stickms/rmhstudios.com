/**
 * The Workshop: public member builds made for one title. A build opts in by naming its
 * title (`UserBuild.gameId`); this lists the ones anyone may see. It reads the same
 * visibility the rest of the platform enforces (PUBLIC only here, stricter than the main
 * listing), so a build held or hidden by review never appears.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import type { WorkshopItem } from '@/lib/games/workshop-types';

export async function listWorkshop(gameId: string, limit = 12): Promise<WorkshopItem[]> {
  const rows = await prisma.userBuild.findMany({
    where: { gameId, visibility: 'PUBLIC', publishedAt: { not: null } },
    orderBy: [{ likeCount: 'desc' }, { publishedAt: 'desc' }],
    take: limit,
    select: {
      slug: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      likeCount: true,
      viewCount: true,
      publishedAt: true,
      user: { select: userDisplaySelect },
    },
  });
  return rows.map((r) => {
    const u = r.user as Parameters<typeof resolveUserDisplay>[0] & { id: string; handle: string | null };
    const d = resolveUserDisplay(u);
    return {
      slug: r.slug,
      title: r.title,
      description: r.description,
      thumbnailUrl: r.thumbnailUrl,
      likes: r.likeCount,
      views: r.viewCount,
      publishedAt: (r.publishedAt as Date).toISOString(),
      author: { userId: u.id, handle: u.handle, name: d.name ?? u.handle ?? 'Player', image: d.image ?? null },
    };
  });
}
