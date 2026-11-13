import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { seedStarterPages } from '@/lib/wiki/seed.server';
import { wikiSeedResult } from '@/lib/wiki/wiki-schema';
import { seedWikiPagesApi } from '@/lib/wiki/wiki.contract';
import { wikiErrorResponse } from '@/lib/wiki/wikijs.server';

/**
 * POST /api/admin/wiki/seed — create the starter pages that are missing. Admin only.
 * A page whose path already exists is left exactly as it is.
 */
export const route = apiRoute('/api/admin/wiki/seed', {
  POST: implement(
    seedWikiPagesApi,
    { auth: 'admin', rateLimit: 'write', response: wikiSeedResult },
    async ({ userId }) => {
      try {
        const result = await seedStarterPages();
        await logAdminAction(userId, 'wiki.seed', { detail: result.created.join(', ') });
        return result;
      } catch (err) {
        return wikiErrorResponse(err);
      }
    },
  ),
});
