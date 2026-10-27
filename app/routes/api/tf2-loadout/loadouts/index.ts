/**
 * GET  /api/tf2-loadout/loadouts — the workshop (public loadouts), or `?mine=true` for yours.
 * POST /api/tf2-loadout/loadouts — save a new loadout.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createLoadoutSchema, listQuerySchema } from '@/lib/tf2-loadout/api-schema';
import { guard } from '@/lib/tf2-loadout/guard.server';
import { createLoadout, listLoadouts } from '@/lib/tf2-loadout/loadout.server';

export const Route = createFileRoute('/api/tf2-loadout/loadouts/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: listQuerySchema },
        ({ userId, query }) =>
          guard(async () =>
            Response.json(
              await listLoadouts({
                userId,
                q: query.q,
                sort: query.sort,
                tfClass: query.tfClass,
                cursor: query.cursor,
                mine: query.mine === 'true',
                limit: query.limit,
              }),
            ),
          ),
      ),
      POST: defineHandler(
        {
          rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2loadout-create' },
          body: createLoadoutSchema,
        },
        ({ userId, body }) =>
          guard(async () =>
            Response.json(await createLoadout({ userId, ...body }), { status: 201 }),
          ),
      ),
    },
  },
});
