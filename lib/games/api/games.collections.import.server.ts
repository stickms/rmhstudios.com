import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { importFavorites } from '@/lib/games/collections.server';
import { collectionsResponse } from '@/lib/games/collections-api.server';

/** POST /api/games/collections/import — move favorites kept in this browser onto your account. */
export const route = apiRoute('/api/games/collections/import', {
  POST: defineHandler(
    { rateLimit: 'write', body: z.object({ ids: z.array(z.string().max(64)).max(200) }) },
    ({ userId, body }) =>
      collectionsResponse(async () => {
        await importFavorites(userId, body.ids);
        return { ok: true };
      }),
  ),
});
