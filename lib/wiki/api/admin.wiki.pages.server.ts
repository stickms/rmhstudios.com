import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { isAiConfigured } from '@/lib/ai/provider.server';
import { createWikiPageBody, wikiPage, wikiPageList } from '@/lib/wiki/wiki-schema';
import { createWikiPageApi, listWikiPagesApi } from '@/lib/wiki/wiki.contract';
import {
  createWikiPage,
  isWikiConfigured,
  listWikiPages,
  wikiErrorResponse,
  wikiPublicUrl,
} from '@/lib/wiki/mediawiki.server';

/**
 * GET  /api/admin/wiki/pages — every page on wiki.rmhstudios.com. Admin only.
 * POST /api/admin/wiki/pages — create a page.
 *
 * An unconfigured wiki is a 200 with `configured: false`, not an error: the
 * admin page renders the setup steps from it.
 */
export const route = apiRoute('/api/admin/wiki/pages', {
  GET: implement(
    listWikiPagesApi,
    { auth: 'admin', rateLimit: 'read', response: wikiPageList },
    async () => {
      const base = { publicUrl: wikiPublicUrl(), aiConfigured: isAiConfigured() };
      if (!isWikiConfigured()) return { ...base, configured: false, pages: [] };
      try {
        return { ...base, configured: true, pages: await listWikiPages() };
      } catch (err) {
        return wikiErrorResponse(err);
      }
    },
  ),
  POST: implement(
    createWikiPageApi,
    { auth: 'admin', rateLimit: 'write', body: createWikiPageBody, response: wikiPage },
    async ({ userId, body }) => {
      try {
        const page = await createWikiPage(body);
        await logAdminAction(userId, 'wiki.page.create', {
          targetType: 'WikiPage',
          targetId: String(page.id),
          detail: page.title,
        });
        return page;
      } catch (err) {
        return wikiErrorResponse(err);
      }
    },
  ),
});
