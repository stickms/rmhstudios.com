import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { flairInputSchema } from '@/lib/communities/plus-schema';
import { requireMod } from '@/lib/communities/guard.server';
import { FlairError, deleteFlair, updateFlair } from '@/lib/communities/flairs.server';

/** PATCH / DELETE /api/communities/$slug/flairs/$flairId — edit or remove a flair. */
export const Route = createFileRoute('/api/communities/$slug/flairs/$flairId')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: flairInputSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const flair = await updateFlair(guard.value.id, params.flairId, body);
            return Response.json({ flair });
          } catch (e) {
            if (e instanceof FlairError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        try {
          await deleteFlair(guard.value.id, params.flairId);
          return Response.json({ success: true });
        } catch (e) {
          if (e instanceof FlairError) {
            return Response.json({ error: e.message }, { status: e.status });
          }
          throw e;
        }
      }),
    },
  },
});
