/**
 * GET /api/tf2-hud/share/:token — a HUD opened through a share link (read-only).
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { getHudByShare } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/share/$token')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, ({ userId, params }) =>
        guard(async () => Response.json(await getHudByShare(params.token, userId))),
      ),
    },
  },
});
