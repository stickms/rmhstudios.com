import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { createSpaceBody } from '@/lib/spaces/spaces-schema';
import { createSpaceApi } from '@/lib/spaces/spaces.contract';
import { createSpace, listLiveSpaces, SpaceError } from '@/lib/spaces.server';

/**
 * POST /api/spaces — create/schedule a Space (community spaces require the host
 *                    to be a community mod — enforced in `createSpace`).
 * GET  /api/spaces?live=1 — list live spaces (mirror of /api/spaces/live).
 */
export const route = apiRoute('/api/spaces', {
  GET: defineHandler({ auth: 'none' }, async ({ request }) => {
    const live = new URL(request.url).searchParams.get('live');
    if (live !== '1') {
      return Response.json({ error: 'Pass ?live=1 to list live spaces' }, { status: 400 });
    }
    const spaces = await listLiveSpaces();
    return Response.json({ spaces });
  }),
  POST: implement(
    createSpaceApi,
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'space-create' },
      body: createSpaceBody,
      allowEmptyBody: true,
      invalid: (e) =>
        Response.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ userId, body }) => {
      try {
        const space = await createSpace({
          hostId: userId,
          communityId: body.communityId ?? null,
          title: body.title,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          recordChat: body.recordChat,
          pinned: body.pinned ?? null,
        });
        return Response.json({ space }, { status: 201 });
      } catch (error) {
        if (error instanceof SpaceError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
  ),
});
