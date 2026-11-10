import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { startSpaceApi } from '@/lib/spaces/spaces.contract';
import { startSpace, SpaceError } from '@/lib/spaces.server';

/** POST /api/spaces/$id/start — flip the space LIVE (host only). */
export const Route = createFileRoute('/api/spaces/$id/start')({
  server: {
    handlers: {
      POST: implement(
        startSpaceApi,
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'space-start' } },
        async ({ userId, params }) => {
          try {
            return { space: await startSpace(params.id, userId) };
          } catch (error) {
            if (error instanceof SpaceError) {
              return Response.json({ error: error.message }, { status: error.status });
            }
            throw error;
          }
        },
      ),
    },
  },
});
