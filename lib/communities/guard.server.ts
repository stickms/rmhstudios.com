/**
 * Shared guards for the communities-plus API routes (server-only).
 */
import { prisma } from '@/lib/prisma.server';
import { canModerate, type CommunityRole } from '@/lib/communities/access.server';

export interface CommunityCtxP06 {
  id: string;
  slug: string;
  name: string;
  isPrivate: boolean;
  role: CommunityRole | null;
}

/** The community + the caller's role. `null` when the community doesn't exist. */
export async function communityWithRole(
  slug: string,
  userId: string | null,
): Promise<CommunityCtxP06 | null> {
  const community = await prisma.community.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      isPrivate: true,
      members: userId ? { where: { userId }, select: { role: true }, take: 1 } : false,
    },
  });
  if (!community) return null;
  const role = (community.members?.[0]?.role as CommunityRole | undefined) ?? null;
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    isPrivate: community.isPrivate,
    role,
  };
}

export type GuardResult<T> = { ok: true; value: T } | { ok: false; response: Response };

const fail = (message: string, status: number): { ok: false; response: Response } => ({
  ok: false,
  response: Response.json({ error: message }, { status }),
});

/** Community exists and the caller is a mod/admin of it. */
export async function requireMod(
  slug: string,
  userId: string,
): Promise<GuardResult<CommunityCtxP06>> {
  const ctx = await communityWithRole(slug, userId);
  if (!ctx) return fail('Not found', 404);
  if (!canModerate(ctx.role)) return fail('Only community mods can do that', 403);
  return { ok: true, value: ctx };
}

/** Community exists and the caller is a member (any role). */
export async function requireMember(
  slug: string,
  userId: string,
): Promise<GuardResult<CommunityCtxP06>> {
  const ctx = await communityWithRole(slug, userId);
  if (!ctx) return fail('Not found', 404);
  if (!ctx.role) return fail('Join the community first', 403);
  return { ok: true, value: ctx };
}

/** Community exists and, if private, the caller is a member. */
export async function requireReadable(
  slug: string,
  userId: string | null,
): Promise<GuardResult<CommunityCtxP06>> {
  const ctx = await communityWithRole(slug, userId);
  if (!ctx) return fail('Not found', 404);
  if (ctx.isPrivate && !ctx.role) return fail('Not found', 404);
  return { ok: true, value: ctx };
}
