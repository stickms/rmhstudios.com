import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { dailyMutator, utcDayKey } from '@/lib/arcade/seeded';
import { startDaily } from '@/lib/arcade/runs.server';

/** POST /api/arcade/daily/start — claim today's one counted attempt. */
export const Route = createFileRoute('/api/arcade/daily/start')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write' }, async ({ userId }) => {
        const { counted } = await startDaily(userId);
        return Response.json({ counted, mutator: dailyMutator(utcDayKey()) });
      }),
    },
  },
});
