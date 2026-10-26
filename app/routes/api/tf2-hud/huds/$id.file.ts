/**
 * GET /api/tf2-hud/huds/:id/file?path=…&v=… — one file of a readable HUD.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { fileQuerySchema } from '@/lib/tf2-hud/api-schema';
import { fileResponse, guard } from '@/lib/tf2-hud/guard.server';
import { readFile } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/huds/$id/file')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: { limit: 1200, windowMs: 60_000, prefix: 'tf2hud-file' }, query: fileQuerySchema },
        ({ userId, params, query }) =>
          guard(async () => fileResponse(await readFile(params.id, userId, query.path, query.v))),
      ),
    },
  },
});
