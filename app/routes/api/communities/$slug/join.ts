import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/** POST /api/communities/$slug/join — toggle membership. */
export const Route = createFileRoute('/api/communities/$slug/join')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'community-join' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const community = await prisma.community.findUnique({
            where: { slug: params.slug },
            select: { id: true, createdById: true },
          });
          if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

          const userId = session.user.id;
          const existing = await prisma.communityMember.findUnique({
            where: { communityId_userId: { communityId: community.id, userId } },
            select: { id: true },
          });

          if (existing) {
            // The creator can't leave their own community.
            if (community.createdById === userId) {
              return Response.json({ error: 'The creator cannot leave the community' }, { status: 400 });
            }
            await prisma.$transaction([
              prisma.communityMember.delete({ where: { id: existing.id } }),
              prisma.community.update({ where: { id: community.id }, data: { memberCount: { decrement: 1 } } }),
            ]);
            return Response.json({ success: true, joined: false });
          }

          await prisma.$transaction([
            prisma.communityMember.create({ data: { communityId: community.id, userId } }),
            prisma.community.update({ where: { id: community.id }, data: { memberCount: { increment: 1 } } }),
          ]);
          return Response.json({ success: true, joined: true });
        } catch (error) {
          console.error('Community join error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
