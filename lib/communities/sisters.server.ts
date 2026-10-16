/**
 * N8 — sister communities (server-only). A link is one-way; two communities
 * that link each other are "mutual". Private communities never appear in a
 * rail (their existence is not secret, their relationships are).
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { SISTERS_MAX, type SisterDTO } from '@/lib/communities/plus-schema';

export class SisterError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

const TTL_MS = 5 * 60_000;
const key = (communityId: string) => `community:sisters:${communityId}`;

export async function getSisters(communityId: string): Promise<SisterDTO[]> {
  const hit = apiCache.get<SisterDTO[]>(key(communityId));
  if (hit) return hit;
  const links = await prisma.communitySister.findMany({
    where: { communityId, related: { isPrivate: false } },
    orderBy: { position: 'asc' },
    take: SISTERS_MAX,
    select: {
      related: {
        select: { id: true, slug: true, name: true, icon: true, color: true, memberCount: true },
      },
    },
  });
  const ids = links.map((l) => l.related.id);
  const back = ids.length
    ? await prisma.communitySister.findMany({
        where: { communityId: { in: ids }, relatedCommunityId: communityId },
        select: { communityId: true },
      })
    : [];
  const mutual = new Set(back.map((b) => b.communityId));
  const sisters = links.map((l) => ({
    slug: l.related.slug,
    name: l.related.name,
    icon: l.related.icon,
    color: l.related.color,
    memberCount: l.related.memberCount,
    mutual: mutual.has(l.related.id),
  }));
  apiCache.set(key(communityId), sisters, TTL_MS);
  return sisters;
}

/** Replace this community's outgoing links with exactly `slugs` (≤ 5). */
export async function setSisters(communityId: string, slugs: string[]): Promise<SisterDTO[]> {
  const unique = [...new Set(slugs)];
  if (unique.length > SISTERS_MAX) {
    throw new SisterError(`Link at most ${SISTERS_MAX} communities`, 400);
  }
  const targets = unique.length
    ? await prisma.community.findMany({
        where: { slug: { in: unique } },
        select: { id: true, slug: true, isPrivate: true },
      })
    : [];
  if (targets.length !== unique.length) throw new SisterError('Community not found', 404);
  if (targets.some((t) => t.id === communityId)) {
    throw new SisterError("A community can't be its own sister", 400);
  }
  if (targets.some((t) => t.isPrivate)) {
    throw new SisterError("Private communities can't be linked", 400);
  }
  const bySlug = new Map(targets.map((t) => [t.slug, t.id]));
  await prisma.$transaction([
    prisma.communitySister.deleteMany({ where: { communityId } }),
    prisma.communitySister.createMany({
      data: unique.map((slug, i) => ({
        communityId,
        relatedCommunityId: bySlug.get(slug) as string,
        position: i,
      })),
    }),
  ]);
  // Mutual badges on the other side depend on this community's links.
  apiCache.invalidate(key(communityId));
  for (const t of targets) apiCache.invalidate(key(t.id));
  return getSisters(communityId);
}
