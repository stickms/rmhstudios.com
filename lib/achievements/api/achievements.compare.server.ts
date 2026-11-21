import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { compareAchievementsApi } from '@/lib/achievements/compare.contract';
import { compareQuery } from '@/lib/achievements/compare-schema';
import { compareAchievements } from '@/lib/achievements/compare.server';

/**
 * GET /api/achievements/compare?with=<handle or id> — the caller's achievements beside another member's.
 *
 * `compare` is a static segment beside `$userId`: it shadows a member whose handle is "compare", and
 * `/api/achievements/$userId` still serves that member by id. Signed out is a 401 from the wrapper; every "no one to
 * compare with" reason is the same 404. The body is about two private relationships (blocks), so it is `no-store`.
 */
export const route = apiRoute('/api/achievements/compare', {
  GET: implement(
    compareAchievementsApi,
    { auth: 'required', rateLimit: 'read', query: compareQuery },
    async ({ userId, query }) => {
      const result = await compareAchievements(userId, query.with);
      if (!result) return Response.json({ error: 'No one to compare with' }, { status: 404 });
      return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
});
