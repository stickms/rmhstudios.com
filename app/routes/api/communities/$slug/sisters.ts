import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { sistersSetSchema } from '@/lib/communities/plus-schema';
import { requireMod } from '@/lib/communities/guard.server';
import { SisterError, setSisters } from '@/lib/communities/sisters.server';

/** PUT /api/communities/$slug/sisters — mods set the (≤ 5) related communities. */
export const Route = createFileRoute('/api/communities/$slug/sisters')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: 'write', body: sistersSetSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            return Response.json({ sisters: await setSisters(guard.value.id, body.slugs) });
          } catch (e) {
            if (e instanceof SisterError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
