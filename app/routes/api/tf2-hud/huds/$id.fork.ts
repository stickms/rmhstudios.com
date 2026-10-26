/**
 * POST /api/tf2-hud/huds/:id/fork — copy a readable HUD into your account (private).
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { forkHud } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/huds/$id/fork')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-fork' } }, ({ userId, params }) =>
        guard(async () => Response.json(await forkHud(params.id, userId), { status: 201 })),
      ),
    },
  },
});
