import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { submitEntry } from '@/lib/competitive/jams.server';

/** POST /api/jams/:slug/entry — enter (or swap) your own User Build during the window. */
export const Route = createFileRoute('/api/jams/$slug/entry')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ buildId: z.string().min(1).max(64) }) },
        async ({ params, userId, body }) => {
          const res = await submitEntry(params.slug, userId, body.buildId);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
