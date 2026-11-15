import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { addStampToWallApi, removeStampFromWallApi } from '@/lib/profile/stamps.contract';
import { addToWall, removeFromWall } from '@/lib/profile/stamps.server';

/**
 * POST   /api/stamps/$id/wall — add a stamp to the caller's profile wall (cap 50).
 * DELETE /api/stamps/$id/wall — take it off again.
 */
export const route = apiRoute('/api/stamps/$id/wall', {
  POST: implement(
    addStampToWallApi,
    { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'stamp-wall' } },
    async ({ userId, params }) => {
      const result = await addToWall(userId, params.id);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ success: true });
    },
  ),
  DELETE: implement(
    removeStampFromWallApi,
    { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'stamp-wall' } },
    async ({ userId, params }) => {
      await removeFromWall(userId, params.id);
      return Response.json({ success: true });
    },
  ),
});
