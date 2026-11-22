import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/recurring.contract';
import { requireMod } from '@/lib/communities/guard.server';
import { createRecurringBody } from '@/lib/communities/recurring-schema';
import { MAX_ACTIVE } from '@/lib/communities/recurring';
import { RecurringError, createRecurring, listRecurring } from '@/lib/communities/recurring.server';

/**
 * GET  /api/communities/$slug/recurring — the community's recurring thread templates (moderators only).
 * POST /api/communities/$slug/recurring — add one; a sixth active template is a 409.
 */
export const route = apiRoute('/api/communities/$slug/recurring', {
  GET: implement(
    C.listRecurringApi,
    {
      rateLimit: 'read',
    },
    async ({ params, session }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      return Response.json({
        threads: await listRecurring(guard.value.id),
        maxActive: MAX_ACTIVE,
      });
    },
  ),
  POST: implement(
    C.createRecurringApi,
    {
      rateLimit: 'write',
      body: createRecurringBody,
      verboseValidationErrors: true,
    },
    async ({ params, session, body }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        const thread = await createRecurring({
          communityId: guard.value.id,
          actorId: session.user.id,
          body,
        });
        return Response.json(
          {
            thread,
          },
          {
            status: 201,
          },
        );
      } catch (e) {
        if (e instanceof RecurringError) {
          return Response.json(
            {
              error: e.message,
              code: e.code,
            },
            {
              status: e.status,
            },
          );
        }
        throw e;
      }
    },
  ),
});
