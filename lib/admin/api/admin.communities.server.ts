import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminCommunitiesApi } from '@/lib/admin/communities.contract';
import { listCommunitiesQuery } from '@/lib/admin/communities-schema';
import { listAdminCommunities } from '@/lib/admin/communities.server';

/**
 * GET /api/admin/communities — the communities with open reports, mod activity and growth figures, most members
 * first (50 a page, `cursor` for the next). `filter` is one of all, reports, quiet, growing, delisted; `q` searches
 * name and slug. Admin only.
 */
export const route = apiRoute('/api/admin/communities', {
  GET: implement(
    listAdminCommunitiesApi,
    { auth: 'admin', rateLimit: 'read', query: listCommunitiesQuery },
    async ({ query }) => listAdminCommunities({ filter: query.filter, q: query.q, cursor: query.cursor }),
  ),
});
