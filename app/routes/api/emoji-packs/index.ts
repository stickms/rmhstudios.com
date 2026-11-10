/**
 * /api/emoji-packs — browse public packs, and create one.
 *
 * GET is open (browsing packs is free). POST is gated on `sticker-packs`, so a
 * free account gets a 402 with an upgrade envelope rather than a bare 403.
 */
import { createFileRoute } from '@tanstack/react-router';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { browsePacksApi, createPackApi } from '@/lib/emoji/packs.contract';
import { browsePacksQuery, createPackSchema } from '@/lib/emoji/packs-schema';
import { browsePacks, createPack, PackError } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/emoji-packs/')({
  server: {
    handlers: {
      GET: implement(
        browsePacksApi,
        { auth: 'optional', rateLimit: 'read', query: browsePacksQuery },
        async ({ userId, query }) =>
          Response.json({
            packs: await browsePacks(userId, { query: query.q, cursor: query.cursor }),
          }),
      ),
      POST: implement(
        createPackApi,
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
