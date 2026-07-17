import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { getOnlinePresenceCount } from '@/lib/hot-counters.server';

/**
 * GET /api/presence/online-count — how many humans are on the site right now.
 * "Online" mirrors the profile page's definition: a presence heartbeat within
 * the last 2 minutes. Cached briefly — the number doesn't need to be exact.
 *
 * Fast path: the Redis presence set (no DB touch). Falls back to a DB COUNT on
 * the lastSeenAt index when Redis is unavailable.
 */
export const Route = createFileRoute('/api/presence/online-count')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const fromRedis = await getOnlinePresenceCount();
          const count =
            fromRedis ??
            (await prisma.user.count({
              where: {
                lastSeenAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
                isBot: false,
              },
            }));
          return Response.json(
            { count },
            { headers: { 'Cache-Control': 'public, max-age=30' } }
          );
        } catch (error) {
          console.error('Online count error:', error);
          return Response.json({ count: 0 }, { status: 200 });
        }
      },
    },
  },
});
