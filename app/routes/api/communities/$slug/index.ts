import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/** GET /api/communities/$slug — community details + viewer membership. */
export const Route = createFileRoute('/api/communities/$slug/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const community = await prisma.community.findUnique({
          where: { slug: params.slug },
          select: {
            id: true, slug: true, name: true, description: true, icon: true, color: true,
            isPrivate: true, memberCount: true, createdById: true, createdAt: true,
          },
        });
        if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

        let role: string | null = null;
        if (session) {
          const mem = await prisma.communityMember.findUnique({
            where: { communityId_userId: { communityId: community.id, userId: session.user.id } },
            select: { role: true },
          });
          role = mem?.role ?? null;
        }
        return Response.json({
          ...community,
          createdAt: community.createdAt.toISOString(),
          joined: !!role,
          role,
        });
      },
    },
  },
});
