import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getWall } from '@/lib/profile/stamps.server';

/**
 * GET /api/profile/$id/stamps — a member's stamp wall (P5), newest first, with
 * whether the signed-in viewer already has each stamp. Per-viewer, so never
 * cached by a shared cache. `$id` is the user id.
 */
export const Route = createFileRoute('/api/profile/$id/stamps')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) =>
        Response.json(
          { stamps: await getWall(params.id, userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
    },
  },
});
