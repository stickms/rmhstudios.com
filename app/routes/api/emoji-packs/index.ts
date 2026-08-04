/**
 * /api/emoji-packs — browse public packs, and create one.
 *
 * GET is open (browsing packs is free). POST is gated on `sticker-packs`, so a
 * free account gets a 402 with an upgrade envelope rather than a bare 403.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { createPackSchema } from '@/lib/emoji/packs';
import { browsePacks, createPack, PackError } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/emoji-packs/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          rateLimit: 'read',
          query: z.object({
            q: z.string().trim().max(60).optional(),
            cursor: z.string().max(64).optional(),
          }),
        },
        async ({ userId, query }) =>
          Response.json({
            packs: await browsePacks(userId, { query: query.q, cursor: query.cursor }),
          }),
      ),
      POST: defineHandler(
        { feature: 'sticker-packs', rateLimit: 'write', body: createPackSchema },
        async ({ userId, body }) => {
          try {
            return Response.json({ pack: await createPack(userId, body) }, { status: 201 });
          } catch (err) {
            if (err instanceof PackError) return apiError(err.message, err.status);
            throw err;
          }
        },
      ),
    },
  },
});
