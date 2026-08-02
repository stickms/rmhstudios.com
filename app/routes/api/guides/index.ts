import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guideCreateSchema } from '@/lib/games/reviews';
import { createGuide, GameMetaError } from '@/lib/games/meta.server';

/** POST /api/guides { gameId, title, body } — create a draft guide. */
export const Route = createFileRoute('/api/guides/')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'guides' },
          body: guideCreateSchema,
        },
        async ({ session, body }) => {
          try {
            const id = await createGuide(session.user.id, body);
            return Response.json({ id });
          } catch (e) {
            if (e instanceof GameMetaError)
              return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
        },
      ),
    },
  },
});
