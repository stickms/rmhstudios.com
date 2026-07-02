import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';

/**
 * GET /api/presence/online-count — how many humans are on the site right now.
 * "Online" mirrors the profile page's definition: a presence heartbeat within
 * the last 2 minutes. Cached briefly — the number doesn't need to be exact.
 */
export const Route = createFileRoute('/api/presence/online-count')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const cutoff = new Date(Date.now() - 2 * 60 * 1000);
          const count = await prisma.user.count({
            where: { lastSeenAt: { gte: cutoff }, isBot: false },
          });
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
