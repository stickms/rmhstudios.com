import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { listModItems } from '@/lib/communities/automod.server';

/**
 * GET /api/communities/$slug/modqueue?view=pending|log — held and flagged
 * content (mods). Replaces nothing: the site-wide report queue stays admin-only.
 */
export const Route = createFileRoute('/api/communities/$slug/modqueue')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          rateLimit: 'read',
          query: z.object({ view: z.enum(['pending', 'log']).default('pending') }),
        },
        async ({ params, userId, query }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          return Response.json({ items: await listModItems(guard.value.id, query.view) });
        },
      ),
    },
  },
});
