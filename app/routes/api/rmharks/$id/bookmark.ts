import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { grantAchievement } from '@/lib/achievements/engine.server';

/** POST /api/rmharks/$id/bookmark — toggle a bookmark on a post. */
export const Route = createFileRoute('/api/rmharks/$id/bookmark')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'rmhark-bookmark' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const { id } = params;
          const userId = session.user.id;

          const existing = await prisma.rMHarkBookmark.findUnique({
            where: { userId_rmheetId: { userId, rmheetId: id } },
          });

          if (existing) {
            await prisma.rMHarkBookmark.delete({ where: { id: existing.id } });
            return Response.json({ success: true, bookmarked: false });
          }

          // Ensure the post exists before bookmarking.
          const post = await prisma.rMHark.findUnique({ where: { id }, select: { id: true } });
          if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });

          await prisma.rMHarkBookmark.create({ data: { userId, rmheetId: id } });
          await grantAchievement(userId, 'social.first_bookmark');
          return Response.json({ success: true, bookmarked: true });
        } catch (error) {
          console.error('Toggle bookmark error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
