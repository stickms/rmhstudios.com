import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getCommunityBySlug, getRole } from '@/lib/communities/access.server';

/** GET /api/communities/$slug/members — list members with roles (admins/mods first). */
export const Route = createFileRoute('/api/communities/$slug/members')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const community = await getCommunityBySlug(params.slug);
        if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

        const members = await prisma.communityMember.findMany({
          where: { communityId: community.id },
          orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
          take: 500,
          select: {
            role: true,
            joinedAt: true,
            user: { select: { id: true, name: true, handle: true, image: true } },
          },
        });

        const viewerRole = session ? await getRole(community.id, session.user.id) : null;
        return Response.json({
          viewerRole,
          createdById: community.createdById,
          members: members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            handle: m.user.handle,
            image: m.user.image,
            role: m.role,
            joinedAt: m.joinedAt.toISOString(),
          })),
        });
      },
    },
  },
});
