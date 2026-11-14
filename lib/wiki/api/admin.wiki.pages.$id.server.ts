import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { updateWikiPageBody, wikiPage } from '@/lib/wiki/wiki-schema';
import { deleteWikiPageApi, getWikiPageApi, updateWikiPageApi } from '@/lib/wiki/wiki.contract';
import {
  deleteWikiPage,
  getWikiPage,
  updateWikiPage,
  wikiErrorResponse,
} from '@/lib/wiki/mediawiki.server';

/** MediaWiki page ids are integers; anything else is a 404, not an API error. */
function pageId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

const notFound = () => Response.json({ error: 'not_found' }, { status: 404 });

/**
 * GET    /api/admin/wiki/pages/$id — one page with its wikitext. Admin only.
 * PUT    /api/admin/wiki/pages/$id — save a new revision of its text (409 on an edit conflict).
 * DELETE /api/admin/wiki/pages/$id — delete it.
 */
export const route = apiRoute('/api/admin/wiki/pages/$id', {
  GET: implement(
    getWikiPageApi,
    { auth: 'admin', rateLimit: 'read', response: wikiPage },
    async ({ params }) => {
      const id = pageId(params.id);
      if (id === null) return notFound();
      try {
        return await getWikiPage(id);
      } catch (err) {
        return wikiErrorResponse(err);
      }
    },
  ),
  PUT: implement(
    updateWikiPageApi,
    { auth: 'admin', rateLimit: 'write', body: updateWikiPageBody, response: wikiPage },
    async ({ userId, body, params }) => {
      const id = pageId(params.id);
      if (id === null) return notFound();
      try {
        const page = await updateWikiPage(id, body);
        await logAdminAction(userId, 'wiki.page.update', {
          targetType: 'WikiPage',
          targetId: String(id),
          detail: page.title,
        });
        return page;
      } catch (err) {
        return wikiErrorResponse(err);
      }
    },
  ),
  DELETE: implement(
    deleteWikiPageApi,
    { auth: 'admin', rateLimit: 'write' },
    async ({ userId, params }) => {
      const id = pageId(params.id);
      if (id === null) return notFound();
      try {
        await deleteWikiPage(id);
        await logAdminAction(userId, 'wiki.page.delete', {
          targetType: 'WikiPage',
          targetId: String(id),
        });
        return { success: true as const };
      } catch (err) {
        return wikiErrorResponse(err);
      }
    },
  ),
});
