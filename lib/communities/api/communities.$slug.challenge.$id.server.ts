import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { ChallengeError, cancelChallenge } from '@/lib/communities/challenge.server';

/** DELETE /api/communities/$slug/challenge/$id — a mod cancels an unfinished challenge. */
export const route = apiRoute('/api/communities/$slug/challenge/$id', {
  DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    try {
      await cancelChallenge(guard.value.id, params.id);
      return Response.json({ success: true });
    } catch (e) {
      if (e instanceof ChallengeError) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  }),
});
