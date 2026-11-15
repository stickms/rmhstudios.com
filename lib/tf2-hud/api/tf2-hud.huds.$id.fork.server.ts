/**
 * POST /api/tf2-hud/huds/:id/fork — copy a readable HUD into your account (private).
 */

import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { forkHud } from '@/lib/tf2-hud/hud.server';

export const route = apiRoute('/api/tf2-hud/huds/$id/fork', {
  POST: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-fork' } },
    ({ userId, params }) =>
      guard(async () => Response.json(await forkHud(params.id, userId), { status: 201 })),
  ),
});
