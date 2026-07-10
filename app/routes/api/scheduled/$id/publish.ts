import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getActiveBan } from '@/lib/admin-audit.server';
import { publishScheduledPost } from '@/lib/scheduled/publish.server';

/** POST /api/scheduled/$id/publish — publish a draft/scheduled post right now. */
export const Route = createFileRoute('/api/scheduled/$id/publish')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ban = await getActiveBan(session.user.id);
          if (ban) {
            return Response.json(
              { error: `Your account is suspended${ban.reason ? `: ${ban.reason}` : ''}` },
              { status: 403 }
            );
          }

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'scheduled-publish' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const sp = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
          if (!sp || sp.userId !== session.user.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          if (sp.publishedId) {
            return Response.json({ error: 'Already published' }, { status: 409 });
          }

          const postId = await publishScheduledPost(sp);
          return Response.json({ success: true, postId });
        } catch (error) {
          console.error('Scheduled publish-now error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
