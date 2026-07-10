import { prisma } from '@/lib/prisma.server';

export interface CommunityListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
  postCount: number;
  joined: boolean;
  role: string | null;
}

/**
 * Browse communities (most members first), annotated with each one's post count
 * and — when a viewer is given — whether they've joined and their role.
 *
 * Shared by the `/api/communities` GET handler and the `/communities` route
 * loader so the page can be server-rendered / prefetched instead of fetched in a
 * client-side waterfall on mount. The post-count and membership lookups run
 * concurrently (both depend only on the already-fetched community list), so this
 * is two round-trips, not three.
 */
export async function listCommunities(opts: {
  userId?: string | null;
  q?: string | null;
}): Promise<CommunityListItem[]> {
  const q = opts.q?.trim();
  const communities = await prisma.community.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    orderBy: { memberCount: 'desc' },
    take: 50,
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
      color: true,
      memberCount: true,
    },
  });
  if (communities.length === 0) return [];

  const ids = communities.map((c) => c.id);
  const slugs = communities.map((c) => c.slug);

  const [counts, mems] = await Promise.all([
    prisma.rMHark.groupBy({
      by: ['communityId'],
      where: { communityId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    opts.userId
      ? prisma.communityMember.findMany({
          where: { userId: opts.userId, community: { slug: { in: slugs } } },
          select: { role: true, community: { select: { slug: true } } },
        })
      : Promise.resolve([] as Array<{ role: string; community: { slug: string } }>),
  ]);

  const postCounts = new Map(counts.map((c) => [c.communityId, c._count._all]));
  const roleBySlug = new Map<string, string>();
  for (const m of mems) roleBySlug.set(m.community.slug, m.role);

  return communities.map((c) => ({
    ...c,
    postCount: postCounts.get(c.id) ?? 0,
    joined: roleBySlug.has(c.slug),
    role: roleBySlug.get(c.slug) ?? null,
  }));
}
