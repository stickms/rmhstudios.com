import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { modDecisionSchema } from '@/lib/communities/plus-schema';
import { requireMod } from '@/lib/communities/guard.server';
import { AutomodError, resolveModItem } from '@/lib/communities/automod.server';

/** POST /api/communities/$slug/modqueue/$itemId — approve or remove a queued item. */
export const Route = createFileRoute('/api/communities/$slug/modqueue/$itemId')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: modDecisionSchema },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const result = await resolveModItem(
              guard.value.id,
              params.itemId,
              body.decision,
              userId,
            );
            return Response.json(result);
          } catch (e) {
            if (e instanceof AutomodError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
