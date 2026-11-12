/**
 * POST /api/tf2-hud/huds/:id/like — toggle your like.
 */

import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { toggleLike } from '@/lib/tf2-hud/hud.server';

export const route = apiRoute('/api/tf2-hud/huds/$id/like', {
  POST: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-like' } },
    ({ userId, params }) => guard(async () => Response.json(await toggleLike(params.id, userId))),
  ),
});
