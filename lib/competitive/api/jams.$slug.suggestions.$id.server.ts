import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { withdrawJamSuggestionApi } from '@/lib/competitive/jam-suggestions.contract';
import { withdrawSuggestion } from '@/lib/competitive/jam-suggestions.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';

/** DELETE /api/jams/:slug/suggestions/:id — withdraw your own suggestion while suggestions are open. */
export const route = apiRoute('/api/jams/$slug/suggestions/$id', {
  DELETE: implement(withdrawJamSuggestionApi, { rateLimit: 'write' }, async ({ params, userId }) => {
    const res = await withdrawSuggestion(params.slug, userId, params.id);
    if (!res.ok) return Response.json(refusalBody(res.code), { status: ERROR_CODES[res.code].http });
    return Response.json({ ok: true as const });
  }),
});
