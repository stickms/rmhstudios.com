import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/read-along.contract';
import { requireMod } from '@/lib/communities/guard.server';
import { planQuery } from '@/lib/communities/read-along-schema';
import { ReadAlongError, refusalResponse } from '@/lib/communities/read-along.server';
import { planFor } from '@/lib/communities/read-along-books.server';

/** GET /api/communities/$slug/read-alongs/plan?doc=&parts=&word= — the suggested parts of a book (moderators). */
export const route = apiRoute('/api/communities/$slug/read-alongs/plan', {
  GET: implement(
    C.readAlongPlanApi,
    {
      rateLimit: 'read',
      query: planQuery,
    },
    async ({ params, session, query }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      try {
        return await planFor(query.doc, query.parts, query.word);
      } catch (e) {
        if (e instanceof ReadAlongError) return refusalResponse(e);
        throw e;
      }
    },
  ),
});
