import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { renameCollection } from '@/lib/games/collections.server';
import { collectionsResponse } from '@/lib/games/collections-api.server';

/** POST /api/games/collections/rename — rename one of your collections. */
export const route = apiRoute('/api/games/collections/rename', {
  POST: defineHandler(
    {
      rateLimit: 'write',
      body: z.object({ from: z.string().min(1).max(200), to: z.string().min(1).max(200) }),
    },
    ({ userId, body }) =>
      collectionsResponse(async () => {
        await renameCollection({ userId, ...body });
        return { ok: true };
      }),
  ),
});
