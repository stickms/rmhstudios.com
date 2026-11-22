import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/recurring.contract';
import { requireMod } from '@/lib/communities/guard.server';
import { updateRecurringBody } from '@/lib/communities/recurring-schema';
import { RecurringError, deleteRecurring, postRecurringNow, updateRecurring } from '@/lib/communities/recurring.server';

function failure(e: unknown): Response {
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

/**
 * PATCH  /api/communities/$slug/recurring/$id — edit (the editor becomes the author), pause or resume.
 * DELETE /api/communities/$slug/recurring/$id — remove.
 * POST   /api/communities/$slug/recurring/$id — "Post now": one occurrence at once, the schedule does not move.
 * Moderators only.
 */
export const route = apiRoute('/api/communities/$slug/recurring/$id', {
  PATCH: implement(
    C.updateRecurringApi,
    {
      rateLimit: 'write',
      body: updateRecurringBody,
      verboseValidationErrors: true,
    },
    async ({ params, session, body }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        const thread = await updateRecurring({
          communityId: guard.value.id,
          id: params.id,
          actorId: session.user.id,
          body,
        });
        return Response.json({
          thread,
        });
      } catch (e) {
        return failure(e);
      }
    },
  ),
  DELETE: implement(
    C.deleteRecurringApi,
    {
      rateLimit: 'write',
    },
    async ({ params, session }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        await deleteRecurring({
          communityId: guard.value.id,
          id: params.id,
          actorId: session.user.id,
        });
        return Response.json({
          success: true,
        });
      } catch (e) {
        return failure(e);
      }
    },
  ),
  POST: implement(
    C.postRecurringNowApi,
    {
      rateLimit: {
        limit: 10,
        windowMs: 60 * 60 * 1000,
        prefix: 'recurring-now',
      },
    },
    async ({ params, session }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        const postId = await postRecurringNow({
          communityId: guard.value.id,
          id: params.id,
        });
        return Response.json({
          postId,
        });
      } catch (e) {
        return failure(e);
      }
    },
  ),
});
