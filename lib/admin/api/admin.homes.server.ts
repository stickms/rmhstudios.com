import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody, ERROR_CODES } from '@/lib/errors/codes';
import { addAdminHomeRssApi, listAdminHomesApi } from '@/lib/admin/homes.contract';
import { addRssSourceBody } from '@/lib/admin/homes-schema';
import { addRssSource, getHomesPage } from '@/lib/admin/homes.server';

/**
 * GET  /api/admin/homes — every RMHHomes scrape source (errors first) and the last 20 scrape runs.
 * POST /api/admin/homes — add an RSS feed: https, public address (SSRF guard), a key not already taken. Admin only;
 *      audited in the same transaction.
 */
export const route = apiRoute('/api/admin/homes', {
  GET: implement(listAdminHomesApi, { auth: 'admin', rateLimit: 'read' }, async () => getHomesPage()),

  POST: implement(
    addAdminHomeRssApi,
    { auth: 'admin', rateLimit: 'write', body: addRssSourceBody },
    async ({ session, body }) => {
      const out = await addRssSource(session.user.id, body);
      if (!out.ok) return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
      return { source: out.source };
    },
  ),
});
