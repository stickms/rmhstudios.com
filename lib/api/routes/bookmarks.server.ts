import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { listBookmarks } from '@/lib/bookmarks.server';

/** GET /api/bookmarks — the current user's bookmarked posts (newest-saved first). */
export const route = apiRoute('/api/bookmarks', {
  GET: defineHandler({}, async ({ request, session }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = pageSize(url.searchParams.get('limit'), 20, 50);
    const result = await listBookmarks(session.user.id, { cursor, limit });
    return Response.json(result);
  }),
});
