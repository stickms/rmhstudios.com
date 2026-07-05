import { createFileRoute } from '@tanstack/react-router';
import { listAchievements } from '@/lib/achievements.server';

/**
 * GET /api/achievements/$userId — a user's achievement progress, merged with the
 * full catalog. `$userId` may be an id or a handle. Secret achievements that are
 * not yet unlocked are returned masked.
 */
export const Route = createFileRoute('/api/achievements/$userId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const result = await listAchievements(params.userId);
          if (!result) return Response.json({ error: 'User not found' }, { status: 404 });
          return Response.json(result);
        } catch (error) {
          console.error('Achievements fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
