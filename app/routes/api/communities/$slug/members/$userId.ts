import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getCommunityBySlug, getRole, canModerate } from '@/lib/communities/access.server';
import { z } from 'zod';

/**
 * PATCH  /api/communities/$slug/members/$userId — set a member's role (mods/admins
 *        may toggle MEMBER <-> MOD; the ADMIN creator is immutable here).
 * DELETE /api/communities/$slug/members/$userId — remove a member (mods/admins;
 *        can't remove the creator, and mods can't remove other mods/admins).
 */
const patchSchema = z.object({ role: z.enum(['MEMBER', 'MOD']) });

export const Route = createFileRoute('/api/communities/$slug/members/$userId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
          if (target.role === 'ADMIN') return Response.json({ error: "Can't change an admin" }, { status: 400 });

          await prisma.communityMember.update({
            where: { id: target.id },
            data: { role: parsed.data.role },
          });
          return Response.json({ success: true, role: parsed.data.role });
        } catch (error) {
          console.error('Community member role error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

          await prisma.$transaction([
            prisma.communityMember.delete({ where: { id: target.id } }),
            prisma.community.update({ where: { id: community.id }, data: { memberCount: { decrement: 1 } } }),
          ]);
          return Response.json({ success: true });
        } catch (error) {
          console.error('Community member remove error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
