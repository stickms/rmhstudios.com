import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { markSitewideAnnouncementSeenApi } from '@/lib/sitewide-announcement.contract';
import { markSeenSchema } from '@/lib/sitewide-announcement-schema';
import { markAnnouncementSeen } from '@/lib/sitewide-announcement.server';
import { prisma } from '@/lib/prisma.server';

/** POST /api/sitewide-announcement/seen — remember a member dismissed the popup (no-op when signed out). */
export const route = apiRoute('/api/sitewide-announcement/seen', {
  POST: implement(
    markSitewideAnnouncementSeenApi,
    { auth: 'optional', rateLimit: 'write', body: markSeenSchema },
    async ({ userId, body }) => {
      if (!userId) return Response.json({ ok: true as const });
      // Only real announcement posts can be marked, so this can't spray rows.
      const post = await prisma.blogPost.findFirst({
        where: { id: body.id, announcement: true },
        select: { id: true },
      });
      if (post) await markAnnouncementSeen(userId, post.id);
      return Response.json({ ok: true as const });
    },
  ),
});
