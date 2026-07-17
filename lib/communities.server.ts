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
 * client-side waterfall on mount. Post counts come from the denormalized
 * `community.postCount` column (selected inline), so only the viewer's
 * membership lookup is a second round-trip — no per-request groupBy over rmheet.
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
      postCount: true,
    },
  });
  if (communities.length === 0) return [];

  const slugs = communities.map((c) => c.slug);

  const mems = opts.userId
    ? await prisma.communityMember.findMany({
        where: { userId: opts.userId, community: { slug: { in: slugs } } },
        select: { role: true, community: { select: { slug: true } } },
      })
    : ([] as Array<{ role: string; community: { slug: string } }>);

  const roleBySlug = new Map<string, string>();
  for (const m of mems) roleBySlug.set(m.community.slug, m.role);

  return communities.map((c) => ({
    ...c,
    joined: roleBySlug.has(c.slug),
    role: roleBySlug.get(c.slug) ?? null,
  }));
}
