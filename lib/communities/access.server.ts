/**
 * Community moderation access helpers (server-only).
 *
 * Role hierarchy: ADMIN (the creator) > MOD > MEMBER. Admins and mods can
 * moderate (post announcements, manage members). Both admins and mods may grant
 * or revoke the MOD role on other members ("owners and other mods can assign
 * mods"), but only the admin role is reserved to the creator and can't be
 * reassigned through the UI.
 */
import { prisma } from '@/lib/prisma.server';

export type CommunityRole = 'MEMBER' | 'MOD' | 'ADMIN';

export type CommunityCtx = {
  id: string;
  createdById: string;
};

/** Resolve a community by slug to the fields needed for permission checks. */
export async function getCommunityBySlug(slug: string): Promise<CommunityCtx | null> {
  return prisma.community.findUnique({
    where: { slug },
    select: { id: true, createdById: true },
  });
}

/** The viewer's role in a community, or null if not a member / not signed in. */
export async function getRole(communityId: string, userId: string | null): Promise<CommunityRole | null> {
  if (!userId) return null;
  const mem = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { role: true },
  });
  return (mem?.role as CommunityRole | undefined) ?? null;
}

/** Mods and admins can moderate (announcements, member management). */
export function canModerate(role: CommunityRole | null): boolean {
  return role === 'MOD' || role === 'ADMIN';
}
