import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/read-along.contract';
import { refusalBody } from '@/lib/errors/codes';
import { requireMod } from '@/lib/communities/guard.server';
import { updateReadAlongBody } from '@/lib/communities/read-along-schema';
import {
  ReadAlongError,
  cancelReadAlong,
  getReadAlongPage,
  refusalResponse,
  replaceParts,
  resumeReadAlong,
} from '@/lib/communities/read-along.server';
import { pagesOfBook } from '@/lib/communities/read-along-books.server';

/**
 * GET   /api/communities/$slug/read-alongs/$id — the read-along page. A community or read-along that does not exist,
 *       and a private community's read-along for someone outside it, answer the same 404.
 * PATCH /api/communities/$slug/read-alongs/$id — moderators: `{ parts }` before the first part opens,
 *       `{ action: 'cancel' }`, or `{ action: 'resume' }` on a paused read-along.
 */
export const route = apiRoute('/api/communities/$slug/read-alongs/$id', {
  GET: implement(
    C.getReadAlongApi,
    {
      auth: 'optional',
      rateLimit: 'read',
    },
    async ({ params, session }) => {
      const readAlong = await getReadAlongPage({
        slug: params.slug,
        id: params.id,
        viewerId: session?.user?.id ?? null,
        isSiteAdmin: Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin),
      });
      if (!readAlong) return Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
      return { readAlong };
    },
  ),
  PATCH: implement(
    C.updateReadAlongApi,
    {
      rateLimit: 'write',
      body: updateReadAlongBody,
      verboseValidationErrors: true,
    },
    async ({ params, session, body }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      const args = { communityId: guard.value.id, id: params.id };
      try {
        if ('parts' in body)
          return { readAlong: await replaceParts({ ...args, parts: body.parts, pagesOf: pagesOfBook }) };
        const actorId = session.user.id;
        return {
          readAlong:
            body.action === 'cancel'
              ? await cancelReadAlong({ ...args, actorId })
              : await resumeReadAlong({ ...args, actorId }),
        };
      } catch (e) {
        if (e instanceof ReadAlongError) return refusalResponse(e);
        throw e;
      }
    },
  ),
});
