import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { restartCardApi } from '@/lib/study/card-history.contract';
import { startCardOver } from '@/lib/study/card-history.server';

/** POST /api/study/cards/$id/restart — make one card new again on the member's own schedule; the log is kept. */
export const route = apiRoute('/api/study/cards/$id/restart', {
  POST: implement(restartCardApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    if (!(await startCardOver(userId, params.id))) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
    return { ok: true as const };
  }),
});
