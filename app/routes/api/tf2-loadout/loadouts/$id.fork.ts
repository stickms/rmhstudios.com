/**
 * POST /api/tf2-loadout/loadouts/:id/fork — copy a readable loadout into your account (private).
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-loadout/guard.server';
import { forkLoadout } from '@/lib/tf2-loadout/loadout.server';

export const Route = createFileRoute('/api/tf2-loadout/loadouts/$id/fork')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2loadout-fork' } },
        ({ userId, params }) =>
          guard(async () => Response.json(await forkLoadout(params.id, userId), { status: 201 })),
      ),
    },
  },
});
