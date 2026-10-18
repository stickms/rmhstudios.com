import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { addToWall, removeFromWall } from '@/lib/profile/stamps.server';

/**
 * POST   /api/stamps/$id/wall — add a stamp to the caller's profile wall (cap 50).
 * DELETE /api/stamps/$id/wall — take it off again.
 */
export const Route = createFileRoute('/api/stamps/$id/wall')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'stamp-wall' } },
        async ({ userId, params }) => {
          const result = await addToWall(userId, params.id);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ success: true });
        },
      ),
      DELETE: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'stamp-wall' } },
        async ({ userId, params }) => {
          await removeFromWall(userId, params.id);
          return Response.json({ success: true });
        },
      ),
    },
  },
});
