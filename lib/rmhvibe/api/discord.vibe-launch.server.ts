import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { prisma } from '@/lib/prisma.server';
import { vibeLaunchApi } from '@/lib/rmhvibe/vibe-page.contract';
import { vibeLaunchQuerySchema } from '@/lib/rmhvibe/vibe-schema';

const LAUNCH_WINDOW_MS = 30 * 60 * 1000;

/** GET /api/discord/vibe-launch — the vibe launched into a channel in the last 30 minutes, if any. */
export const route = apiRoute('/api/discord/vibe-launch', {
  GET: implement(
    vibeLaunchApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: vibeLaunchQuerySchema,
      microCache: false,
      cache: CACHE_POLICY.liveList,
    },
    async ({ query }) => {
      const launch = await prisma.discordVibeLaunch.findFirst({
        where: {
          channelId: query.channelId,
          createdAt: {
            gte: new Date(Date.now() - LAUNCH_WINDOW_MS),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          slug: true,
        },
      });
      return {
        slug: launch?.slug ?? null,
      };
    },
  ),
});
