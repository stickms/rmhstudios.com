import { prisma } from '@/lib/prisma.server';
import type { OwnRequestState } from '@/lib/communities/join-requests.server';

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
  isPrivate: boolean;
  /**
   * A private community the viewer is not a member of: shown as a locked card
   * (metadata only; `postCount` is withheld as 0) with a "Request to join" action.
   */
  locked: boolean;
  /** The viewer's own join request, for the locked card's pending state. */
  requestState: OwnRequestState;
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
  // Private communities are listed as locked cards (name, icon, description,
  // member count, lock badge, request button). Their content stays members-only
  // everywhere else; the sitemap still excludes them.
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
      isPrivate: true,
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

  // The viewer's own pending/denied requests, only for locked cards they could
  // ask to join. Per-viewer state: this list is never shared-cached.
  const lockedIds = communities
    .filter((c) => c.isPrivate && !roleBySlug.has(c.slug))
    .map((c) => c.id);
  const requests =
    opts.userId && lockedIds.length
      ? await prisma.communityJoinRequest.findMany({
          where: { userId: opts.userId, communityId: { in: lockedIds }, status: { in: ['PENDING', 'DENIED', 'REMOVED'] } },
          select: { communityId: true, status: true },
        })
      : [];
  const requestById = new Map(
    requests.map((r) => [r.communityId, (r.status === 'PENDING' ? 'PENDING' : 'DENIED') as OwnRequestState]),
  );

  return communities.map((c) => {
    const joined = roleBySlug.has(c.slug);
    const locked = c.isPrivate && !joined;
    return {
      ...c,
      postCount: locked ? 0 : c.postCount,
      joined,
      role: roleBySlug.get(c.slug) ?? null,
      locked,
      requestState: locked ? (requestById.get(c.id) ?? null) : null,
    };
  });
}
