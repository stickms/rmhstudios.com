import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listChallenges } from '@/lib/studio/challenge/challenge.server';

/** GET /api/studio/challenges — recent sample-flip challenges (F12). */
export const Route = createFileRoute('/api/studio/challenges/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async () =>
        Response.json(
          { challenges: await listChallenges() },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
    },
  },
});
