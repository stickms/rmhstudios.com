import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getCommunityBySlug, getRole, canModerate } from '@/lib/communities/access.server';

/** DELETE /api/communities/$slug/announcements/$id — remove (author or mods/admins). */
export const Route = createFileRoute('/api/communities/$slug/announcements/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const community = await getCommunityBySlug(params.slug);
          if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

          const ann = await prisma.communityAnnouncement.findUnique({
            where: { id: params.id },
            select: { id: true, communityId: true, authorId: true },
          });
          if (!ann || ann.communityId !== community.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          const role = await getRole(community.id, session.user.id);
          const isAuthor = ann.authorId === session.user.id;
          if (!isAuthor && !canModerate(role)) {
            return Response.json({ error: 'Not allowed' }, { status: 403 });
          }

          await prisma.communityAnnouncement.delete({ where: { id: ann.id } });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Community announcement delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
