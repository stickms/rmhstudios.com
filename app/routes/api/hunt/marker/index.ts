import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { sitePathSchema } from '@/lib/delight/schema';
import { markerFor } from '@/lib/delight/hunt.server';

/** GET /api/hunt/marker?path= — the clue text, only when `path` hides the member's current clue. */
export const Route = createFileRoute('/api/hunt/marker/')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: z.object({ path: sitePathSchema }) },
        async ({ userId, query }) =>
          Response.json(
            { marker: await markerFor(userId, query.path) },
            { headers: { 'Cache-Control': 'private, no-store' } },
          ),
      ),
    },
  },
});
