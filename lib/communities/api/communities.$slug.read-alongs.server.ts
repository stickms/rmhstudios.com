import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/read-along.contract';
import { requireMod, requireReadable } from '@/lib/communities/guard.server';
import { canModerate } from '@/lib/communities/access.server';
import { startReadAlongBody } from '@/lib/communities/read-along-schema';
import { MAX_ACTIVE } from '@/lib/communities/read-along';
import { ReadAlongError, listReadAlongs, refusalResponse, startReadAlong } from '@/lib/communities/read-along.server';
import { bookInfoOf } from '@/lib/communities/read-along-books.server';

/**
 * GET  /api/communities/$slug/read-alongs — the community's read-alongs (a private community answers its members only).
 * POST /api/communities/$slug/read-alongs — start one (moderators); a third active read-along is a 409.
 */
export const route = apiRoute('/api/communities/$slug/read-alongs', {
  GET: implement(
    C.listReadAlongsApi,
    {
      auth: 'optional',
      rateLimit: 'read',
    },
    async ({ params, session }) => {
      const guard = await requireReadable(params.slug, session?.user?.id ?? null);
      if (!guard.ok) return guard.response;
      return {
        readAlongs: await listReadAlongs(guard.value.id, canModerate(guard.value.role)),
        maxActive: MAX_ACTIVE,
      };
    },
  ),
  POST: implement(
    C.startReadAlongApi,
    {
      rateLimit: 'write',
      body: startReadAlongBody,
      verboseValidationErrors: true,
    },
    async ({ params, session, body }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        const readAlong = await startReadAlong({
          communityId: guard.value.id,
          actorId: session.user.id,
          body,
          book: await bookInfoOf(body.docSlug),
        });
        return Response.json({ readAlong }, { status: 201 });
      } catch (e) {
        if (e instanceof ReadAlongError) return refusalResponse(e);
        throw e;
      }
    },
  ),
});
