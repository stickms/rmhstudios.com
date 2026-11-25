import { refusalCodeOf } from '@/lib/errors/codes';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/user-builds.contract';
/**
 * Build Comments API
 * GET /api/user-builds/[id]/comments - List comments (with what the viewer may do to each)
 * POST /api/user-builds/[id]/comments - Add comment (refused on a closed build, and for blocked or banned members)
 */

import { watchBuildComment } from '@/lib/discovery/watch.server';
import { createCommentSchema } from '@/lib/user-builds-schema';
import {
  canReadBuildComments,
  createComment,
  findCommentBuild,
  listComments,
} from '@/lib/builds/comments.server';

export const route = apiRoute('/api/user-builds/$id/comments', {
  GET: implement(C.listBuildCommentsApi, { auth: 'optional', rateLimit: 'read' }, async ({ request, params, userId, isAdmin }) => {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = pageSize(searchParams.get('limit'), 20, 50);

    const build = await findCommentBuild(params.id);
    // A PRIVATE build answers exactly like a missing one, to everyone but its creator and admins.
    if (!build || !canReadBuildComments(build, userId, isAdmin)) {
      return Response.json({ error: 'Build not found' }, { status: 404 });
    }

    return Response.json(await listComments({ build, viewerId: userId, isAdmin, cursor, limit }));
  }),
  POST: implement(
    C.createBuildCommentApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'build-comment' }, body: createCommentSchema },
    async ({ params, userId, body }) => {
      const restricted = await restrictionResponse(userId, 'comment');
      if (restricted) return restricted;
      const build = await findCommentBuild(params.id);
      if (!build || build.visibility === 'PRIVATE') {
        return Response.json({ error: 'Build not found' }, { status: 404 });
      }

      const result = await createComment(build, userId, body);
      if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });

      void watchBuildComment(params.id, userId, result.content).catch(() => {});
      return Response.json(result.comment, { status: 201 });
    },
  ),
});
