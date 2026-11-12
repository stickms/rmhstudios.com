import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getQotdTodayApi } from '@/lib/posts-plus/qotd.contract';
import { getToday } from '@/lib/posts-plus/qotd.server';

/**
 * GET /api/qotd/today - today's question of the day (X4): the prompt, how many
 * answers it has, and how many the signed-in viewer has posted. The prompt and
 * count are cached for a minute per process; the viewer count is one indexed read.
 */
export const route = apiRoute('/api/qotd/today', {
  GET: implement(getQotdTodayApi, { auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await getToday(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  ),
});
