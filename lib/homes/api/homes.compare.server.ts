/**
 * RMHHomes — the side-by-side comparison of saved listings (s12 10).
 *
 *   GET /api/homes/compare?ids=a,b,c   → up to four of the caller's own saved listings with their notes
 *
 * Only the caller's saved homes load (the filter is in the query); an id that is not theirs is counted in
 * `missing`. A fifth distinct id is refused with `HOME_COMPARE_TOO_MANY`.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { MAX_COMPARE, parseCompareIds } from '@/lib/homes/compare';
import { compareQuery } from '@/lib/homes/compare-schema';
import { compareHomeFavoritesApi } from '@/lib/homes/compare.contract';
import { compareFavorites } from '@/lib/homes/listings.server';

export const route = apiRoute('/api/homes/compare', {
  GET: implement(compareHomeFavoritesApi, { rateLimit: 'read', query: compareQuery }, async ({ session, query }) => {
    const parsed = parseCompareIds(query.ids);
    if (parsed.tooMany) {
      return Response.json(refusalBody('HOME_COMPARE_TOO_MANY', { max: MAX_COMPARE }), { status: 400 });
    }
    const result = await compareFavorites(session.user.id, parsed.ids);
    return { ...result, missing: result.missing + parsed.invalid };
  }),
});
