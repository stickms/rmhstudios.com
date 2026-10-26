/**
 * GET /api/tf2-hud/huds/:id/versions — owner: the saved version history.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { listVersions } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/huds/$id/versions')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, ({ userId, params }) =>
        guard(async () => Response.json(await listVersions(params.id, userId))),
      ),
    },
  },
});
