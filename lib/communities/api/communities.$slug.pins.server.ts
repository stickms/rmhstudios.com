import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/pins.contract';
import { canModerate } from '@/lib/communities/access.server';
import { communityWithRole, requireMod } from '@/lib/communities/guard.server';
import { pinPostBody, reorderPinsBody } from '@/lib/communities/pins-schema';
import { PinError, getCommunityPins, pinPost, reorderPins } from '@/lib/communities/pins.server';

function pinFailure(e: unknown): Response {
  if (e instanceof PinError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  throw e;
}

/**
 * GET /api/communities/$slug/pins — the pinned posts (the block above the feed, and what the post menu reads).
 * POST /api/communities/$slug/pins — pin a post (moderators; at most three, capped under a lock).
 * PUT /api/communities/$slug/pins — set the order (moderators).
 */
export const route = apiRoute('/api/communities/$slug/pins', {
  GET: implement(C.getCommunityPinsApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, session }) => {
    const userId = session?.user?.id ?? null;
    const ctx = await communityWithRole(params.slug, userId);
    // Members-only: a private community is a 404 for a non-member, as its feed is.
    if (!ctx || (ctx.isPrivate && !ctx.role)) return Response.json({ error: 'Not found' }, { status: 404 });
    const pins = await getCommunityPins({
      communityId: ctx.id,
      slug: ctx.slug,
      viewerId: userId,
      canModerate: canModerate(ctx.role),
    });
    return Response.json(pins);
  }),
  POST: implement(
    C.pinCommunityPostApi,
    { rateLimit: 'write', body: pinPostBody, verboseValidationErrors: true },
    async ({ params, session, body }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        const result = await pinPost({
          communityId: guard.value.id,
          communityName: guard.value.name,
          communitySlug: guard.value.slug,
          postId: body.postId,
          actorId: session.user.id,
        });
        return Response.json(result);
      } catch (e) {
        return pinFailure(e);
      }
    },
  ),
  PUT: implement(
    C.reorderCommunityPinsApi,
    { rateLimit: 'write', body: reorderPinsBody, verboseValidationErrors: true },
    async ({ params, session, body }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        const result = await reorderPins({
          communityId: guard.value.id,
          postIds: body.postIds,
          actorId: session.user.id,
        });
        return Response.json(result);
      } catch (e) {
        return pinFailure(e);
      }
    },
  ),
});
