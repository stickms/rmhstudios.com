import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { flairInputSchema } from '@/lib/communities/plus-schema';
import { requireMod } from '@/lib/communities/guard.server';
import { FlairError, createFlair } from '@/lib/communities/flairs.server';

/** POST /api/communities/$slug/flairs — a mod defines a flair (name + colour preset). */
export const Route = createFileRoute('/api/communities/$slug/flairs')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: flairInputSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const flair = await createFlair(guard.value.id, body);
            return Response.json({ flair }, { status: 201 });
          } catch (e) {
            if (e instanceof FlairError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
