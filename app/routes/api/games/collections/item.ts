import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { setItem } from '@/lib/games/collections.server';
import { collectionsResponse } from '@/lib/games/collections-api.server';

/** POST /api/games/collections/item — add a title to one of your collections, or take it out. */
export const Route = createFileRoute('/api/games/collections/item')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ collection: z.string().min(1).max(200), gameId: z.string().min(1).max(64), on: z.boolean() }) },
        ({ userId, body }) =>
          collectionsResponse(async () => {
            await setItem({ userId, ...body });
            return { ok: true };
          }),
      ),
    },
  },
});
