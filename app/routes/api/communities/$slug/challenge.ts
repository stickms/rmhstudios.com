import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { challengeCreateSchema } from '@/lib/communities/plus-schema';
import { requireMod, requireReadable } from '@/lib/communities/guard.server';
import {
  ChallengeError,
  createChallenge,
  getCurrentChallenge,
} from '@/lib/communities/challenge.server';

/**
 * GET  /api/communities/$slug/challenge — the current (or last) weekly challenge.
 * POST /api/communities/$slug/challenge — a mod starts one (prompt + two windows).
 */
export const Route = createFileRoute('/api/communities/$slug/challenge')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const guard = await requireReadable(params.slug, userId);
        if (!guard.ok) return guard.response;
        return Response.json({ challenge: await getCurrentChallenge(guard.value.id, userId) });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: challengeCreateSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const created = await createChallenge(guard.value.id, userId, body);
            return Response.json(created, { status: 201 });
          } catch (e) {
            if (e instanceof ChallengeError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
