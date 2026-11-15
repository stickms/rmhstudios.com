/**
 * POST   /api/tf2-hud/huds/:id/share — owner: create (or return) the share link token.
 * DELETE /api/tf2-hud/huds/:id/share — owner: revoke every share link.
 */

import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { createShare, revokeShares } from '@/lib/tf2-hud/hud.server';

export const route = apiRoute('/api/tf2-hud/huds/$id/share', {
  POST: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-share' } },
    ({ userId, params }) =>
      guard(async () => Response.json({ token: await createShare(params.id, userId) })),
  ),
  DELETE: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-share' } },
    ({ userId, params }) =>
      guard(async () => {
        await revokeShares(params.id, userId);
        return new Response(null, { status: 204 });
      }),
  ),
});
