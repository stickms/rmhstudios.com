/**
 * GET    /api/tf2-loadout/loadouts/:id — a loadout (id or slug).
 * PUT    /api/tf2-loadout/loadouts/:id — owner: change details and/or the items.
 * DELETE /api/tf2-loadout/loadouts/:id — owner: delete.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { updateLoadoutSchema } from '@/lib/tf2-loadout/api-schema';
import { guard } from '@/lib/tf2-loadout/guard.server';
import { deleteLoadout, getLoadout, updateLoadout } from '@/lib/tf2-loadout/loadout.server';

export const Route = createFileRoute('/api/tf2-loadout/loadouts/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, ({ userId, params }) =>
        guard(async () => Response.json(await getLoadout(params.id, userId))),
      ),
      PUT: defineHandler(
        {
          rateLimit: { limit: 120, windowMs: 60_000, scope: 'user', prefix: 'tf2loadout-update' },
          body: updateLoadoutSchema,
        },
        ({ userId, params, body }) =>
          guard(async () => Response.json(await updateLoadout({ userId, id: params.id, ...body }))),
      ),
      DELETE: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2loadout-delete' } },
        ({ userId, params }) =>
          guard(async () => {
            await deleteLoadout(params.id, userId);
            return new Response(null, { status: 204 });
          }),
      ),
    },
  },
});
