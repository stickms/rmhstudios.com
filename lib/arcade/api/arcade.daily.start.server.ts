import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { dailyMutator, utcDayKey } from '@/lib/arcade/seeded';
import { startDaily } from '@/lib/arcade/runs.server';

/** POST /api/arcade/daily/start — claim today's one counted attempt. */
export const route = apiRoute('/api/arcade/daily/start', {
  POST: defineHandler({ rateLimit: 'write' }, async ({ userId }) => {
    const { counted } = await startDaily(userId);
    return Response.json({ counted, mutator: dailyMutator(utcDayKey()) });
  }),
});
