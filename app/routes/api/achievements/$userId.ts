import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { listAchievements } from '@/lib/achievements.server';

/**
 * GET /api/achievements/$userId — a user's achievement progress, merged with the
 * full catalog. `$userId` may be an id or a handle. Secret achievements that are
 * not yet unlocked are returned masked.
 */
export const Route = createFileRoute('/api/achievements/$userId')({
  server: {
    handlers: {
      // Keyed by the path param; the body depends on nothing but that user (secret
      // masking is by the target's own unlocks, not the viewer's). Short because an
      // owner who has just unlocked something looks here (CACHE_POLICY.liveList).
      GET: defineHandler(
        {
          auth: 'none',
          // Opt out of the 30 s micro-cache: an unlock must show for its owner.
          microCache: false,
          cache: CACHE_POLICY.liveList,
        },
        async ({ params }) => {
          const result = await listAchievements(params.userId);
          if (!result) return Response.json({ error: 'User not found' }, { status: 404 });
          return Response.json(result);
        },
      ),
    },
  },
});
