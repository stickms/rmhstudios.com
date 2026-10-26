/**
 * GET  /api/tf2-hud/huds   — the workshop (public HUDs), or `?mine=true` for yours.
 * POST /api/tf2-hud/huds   — create a HUD from a manifest of already-uploaded files.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createHudSchema, listQuerySchema } from '@/lib/tf2-hud/api-schema';
import { guard } from '@/lib/tf2-hud/guard.server';
import { createHud, listHuds } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/huds/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read', query: listQuerySchema }, ({ userId, query }) =>
        guard(async () =>
          Response.json(
            await listHuds({
              userId,
              q: query.q,
              sort: query.sort,
              tag: query.tag,
              cursor: query.cursor,
              mine: query.mine === 'true',
              limit: query.limit,
            }),
          ),
        ),
      ),
      POST: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-create' }, body: createHudSchema },
        ({ userId, body }) =>
          guard(async () => Response.json(await createHud({ userId, ...body }), { status: 201 })),
      ),
    },
  },
});
