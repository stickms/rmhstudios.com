import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteCollection } from '@/lib/games/collections.server';
import { collectionsResponse } from '@/lib/games/collections-api.server';

/** POST /api/games/collections/delete — delete one of your collections. */
export const Route = createFileRoute('/api/games/collections/delete')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ collection: z.string().min(1).max(200) }) },
        ({ userId, body }) =>
          collectionsResponse(async () => {
            await deleteCollection({ userId, ...body });
            return { ok: true };
          }),
      ),
    },
  },
});
