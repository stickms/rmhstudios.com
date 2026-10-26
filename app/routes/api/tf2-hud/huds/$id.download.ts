/**
 * POST /api/tf2-hud/huds/:id/download — count a download of a public/unlisted HUD.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { countDownload } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/huds/$id/download')({
  server: {
    handlers: {
      POST: defineHandler({ auth: 'optional', rateLimit: { limit: 20, windowMs: 60_000, prefix: 'tf2hud-dl' } }, ({ userId, params }) =>
        guard(async () => {
          await countDownload(params.id, userId);
          return new Response(null, { status: 204 });
        }),
      ),
    },
  },
});
