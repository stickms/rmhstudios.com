import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { listChallenges } from '@/lib/studio/challenge/challenge.server';

/** GET /api/studio/challenges — recent sample-flip challenges (F12). */
export const route = apiRoute('/api/studio/challenges', {
  GET: defineHandler({ rateLimit: 'read' }, async () =>
    Response.json(
      { challenges: await listChallenges() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
});
