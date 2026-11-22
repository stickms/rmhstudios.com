import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getProfilePreviewApi } from '@/lib/profile/preview.contract';
import { previewQuery } from '@/lib/profile/preview-schema';
import { previewProfile } from '@/lib/profile/preview.server';

/**
 * GET /api/profile/preview?audience=signed-out|stranger — the caller's own profile as that audience sees it.
 *
 * The endpoint takes no profile id: it previews the session's member and no one else. `preview` is a static segment
 * beside `$id` (like `me` and `status`), so a member whose handle is "preview" is still served by id. The body is about
 * the caller's own privacy choices, so it is never cached.
 */
export const route = apiRoute('/api/profile/preview', {
  GET: implement(
    getProfilePreviewApi,
    { auth: 'required', rateLimit: 'read', query: previewQuery },
    async ({ userId, query }) => {
      const preview = await previewProfile(userId, query.audience);
      if (!preview) return Response.json({ error: 'Profile not found' }, { status: 404 });
      return Response.json(preview, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
});
