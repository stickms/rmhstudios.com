import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { applyWikiSidebar } from '@/lib/wiki/sidebar.server';
import { applyWikiSidebarApi } from '@/lib/wiki/wiki.contract';
import { wikiErrorResponse } from '@/lib/wiki/mediawiki.server';

/**
 * POST /api/admin/wiki/sidebar — write the wiki's sidebar (`MediaWiki:Sidebar`).
 * Admin only. Idempotent; articles are not touched.
 */
export const route = apiRoute('/api/admin/wiki/sidebar', {
  POST: implement(
    applyWikiSidebarApi,
    { auth: 'admin', rateLimit: 'write' },
    async ({ userId }) => {
      try {
        await applyWikiSidebar();
        await logAdminAction(userId, 'wiki.sidebar');
        return { success: true as const };
      } catch (err) {
        return wikiErrorResponse(err);
      }
    },
  ),
});
