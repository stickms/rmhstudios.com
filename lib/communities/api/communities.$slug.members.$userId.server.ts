import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/communities.contract';
import { prisma } from '@/lib/prisma.server';
import { getCommunityBySlug, getRole, canModerate } from '@/lib/communities/access.server';
import { markRemoved } from '@/lib/communities/join-requests.server';
import { logModAction } from '@/lib/communities/modlog.server';
import { recordMemberEvent } from '@/lib/communities/member-events.server';
import { z } from 'zod';

/**
 * PATCH  /api/communities/$slug/members/$userId — set a member's role (mods/admins
 *        may toggle MEMBER <-> MOD; the ADMIN creator is immutable here).
 * DELETE /api/communities/$slug/members/$userId — remove a member (mods/admins;
 *        can't remove the creator, and mods can't remove other mods/admins).
 */
const patchSchema = z.object({ role: z.enum(['MEMBER', 'MOD']) });

export const route = apiRoute('/api/communities/$slug/members/$userId', {
  PATCH: implement(C.setCommunityMemberRoleApi, {}, async ({ request, params, session }) => {
    const community = await getCommunityBySlug(params.slug);
    if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

    const actorRole = await getRole(community.id, session.user.id);
    if (!canModerate(actorRole)) return Response.json({ error: 'Not allowed' }, { status: 403 });

    // The creator's ADMIN role is fixed.
    if (params.userId === community.createdById) {
      return Response.json({ error: "The owner's role can't be changed" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'Invalid role' }, { status: 400 });

    const target = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: params.userId } },
      select: { id: true, role: true },
    });
    if (!target) return Response.json({ error: 'Not a member' }, { status: 404 });
    if (target.role === 'ADMIN')
      return Response.json({ error: "Can't change an admin" }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.communityMember.update({
        where: { id: target.id },
        data: { role: parsed.data.role },
      });
      await logModAction(tx, {
        communityId: community.id,
        actorId: session.user.id,
        action: 'member_role_changed',
        targetUserId: params.userId,
        targetType: 'member',
        detail: { role: parsed.data.role },
      });
    });
    return Response.json({ success: true, role: parsed.data.role });
  }),
  DELETE: implement(C.removeCommunityMemberApi, {}, async ({ params, session }) => {
    const community = await getCommunityBySlug(params.slug);
    if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

    const actorRole = await getRole(community.id, session.user.id);
    if (!canModerate(actorRole)) return Response.json({ error: 'Not allowed' }, { status: 403 });

    if (params.userId === community.createdById) {
      return Response.json({ error: "The owner can't be removed" }, { status: 400 });
    }

    const target = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: params.userId } },
      select: { id: true, role: true },
    });
    if (!target) return Response.json({ error: 'Not a member' }, { status: 404 });
    // Only the admin can remove a mod; mods can remove plain members.
    if (target.role !== 'MEMBER' && actorRole !== 'ADMIN') {
      return Response.json({ error: 'Only the owner can remove a mod' }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.communityMember.delete({ where: { id: target.id } });
      await tx.community.update({
        where: { id: community.id },
        data: { memberCount: { decrement: 1 } },
      });
      // Remember the removal so a live invite link / instant re-request can't undo it.
      await markRemoved(tx, community.id, params.userId, session.user.id);
      await recordMemberEvent(tx, community.id, params.userId, 'removed');
      await logModAction(tx, {
        communityId: community.id,
        actorId: session.user.id,
        action: 'member_removed',
        targetUserId: params.userId,
        targetType: 'member',
      });
    });
    return Response.json({ success: true });
  }),
});
