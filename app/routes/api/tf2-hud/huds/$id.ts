/**
 * GET    /api/tf2-hud/huds/:id   — a HUD and its latest manifest (id or slug).
 * PUT    /api/tf2-hud/huds/:id   — owner: change details and/or save a new version.
 * DELETE /api/tf2-hud/huds/:id   — owner: delete.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { updateHudSchema } from '@/lib/tf2-hud/api-schema';
import { guard } from '@/lib/tf2-hud/guard.server';
import { deleteHud, getHud, updateHud } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/huds/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, ({ userId, params }) =>
        guard(async () => Response.json(await getHud(params.id, userId))),
      ),
      PUT: defineHandler(
        { rateLimit: { limit: 120, windowMs: 60_000, scope: 'user', prefix: 'tf2hud-update' }, body: updateHudSchema },
        ({ userId, params, body }) =>
          guard(async () => Response.json(await updateHud({ userId, id: params.id, ...body }))),
      ),
      DELETE: defineHandler({ rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-delete' } }, ({ userId, params }) =>
        guard(async () => {
          await deleteHud(params.id, userId);
          return new Response(null, { status: 204 });
        }),
      ),
    },
  },
});
