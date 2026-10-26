/**
 * POST /api/tf2-loadout/loadouts/:id/like — toggle your like.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-loadout/guard.server';
import { toggleLike } from '@/lib/tf2-loadout/loadout.server';

export const Route = createFileRoute('/api/tf2-loadout/loadouts/$id/like')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2loadout-like' } },
        ({ userId, params }) =>
          guard(async () => Response.json(await toggleLike(params.id, userId))),
      ),
    },
  },
});
