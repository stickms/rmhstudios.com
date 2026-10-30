import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { importFavorites } from '@/lib/games/collections.server';
import { collectionsResponse } from '@/lib/games/collections-api.server';

/** POST /api/games/collections/import — move favorites kept in this browser onto your account. */
export const Route = createFileRoute('/api/games/collections/import')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ ids: z.array(z.string().max(64)).max(200) }) },
        ({ userId, body }) =>
          collectionsResponse(async () => {
            await importFavorites(userId, body.ids);
            return { ok: true };
          }),
      ),
    },
  },
});
