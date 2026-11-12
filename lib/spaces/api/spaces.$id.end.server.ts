import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { endSpaceApi } from '@/lib/spaces/spaces.contract';
import { endSpace, SpaceError } from '@/lib/spaces.server';

/** POST /api/spaces/$id/end — end the space (host only). */
export const route = apiRoute('/api/spaces/$id/end', {
  POST: implement(
    endSpaceApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'space-end' } },
    async ({ userId, params }) => {
      try {
        return { space: await endSpace(params.id, userId) };
      } catch (error) {
        if (error instanceof SpaceError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
  ),
});
