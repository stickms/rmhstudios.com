/**
 * GET /api/tf2-hud/share/:token/file?path=… — one file of a shared HUD.
 */

import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { fileQuerySchema } from '@/lib/tf2-hud/api-schema';
import { fileResponse, guard } from '@/lib/tf2-hud/guard.server';
import { readSharedFile } from '@/lib/tf2-hud/hud.server';

export const route = apiRoute('/api/tf2-hud/share/$token/file', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: { limit: 1200, windowMs: 60_000, prefix: 'tf2hud-sfile' },
      query: fileQuerySchema,
    },
    ({ params, query }) =>
      guard(async () => fileResponse(await readSharedFile(params.token, query.path, query.v))),
  ),
});
