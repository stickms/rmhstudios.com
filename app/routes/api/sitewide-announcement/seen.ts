import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { markSeenSchema } from '@/lib/sitewide-announcement';
import { markAnnouncementSeen } from '@/lib/sitewide-announcement.server';

/** POST /api/sitewide-announcement/seen — remember a member dismissed the popup. */
export const Route = createFileRoute('/api/sitewide-announcement/seen')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'sitewide-announcement-seen',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = markSeenSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          if (!session?.user?.id) return Response.json({ ok: true });

          // Only real announcement posts can be marked, so this can't spray rows.
          const post = await prisma.blogPost.findFirst({
            where: { id: parsed.data.id, announcement: true },
            select: { id: true },
          });
          if (post) await markAnnouncementSeen(session.user.id, post.id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Sitewide announcement seen error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
