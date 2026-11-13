import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { applyWikiAppearance } from '@/lib/wiki/appearance.server';
import { applyWikiThemeApi } from '@/lib/wiki/wiki.contract';
import { wikiErrorResponse } from '@/lib/wiki/wikijs.server';

/**
 * POST /api/admin/wiki/theme — apply the Wikipedia look to the wiki: the CSS
 * override, the site title and the sidebar navigation. Admin only. Idempotent;
 * pages are not touched.
 */
export const route = apiRoute('/api/admin/wiki/theme', {
  POST: implement(applyWikiThemeApi, { auth: 'admin', rateLimit: 'write' }, async ({ userId }) => {
    try {
      await applyWikiAppearance();
      await logAdminAction(userId, 'wiki.theme');
      return { success: true as const };
    } catch (err) {
      return wikiErrorResponse(err);
    }
  }),
});
