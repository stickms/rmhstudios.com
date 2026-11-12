import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { listTagFeed } from '@/lib/tags.server';

/** GET /api/tags/$tag — posts containing #tag, newest first (cursor paginated). */
export const route = apiRoute('/api/tags/$tag', {
  GET: defineHandler({ auth: 'optional' }, async ({ request, params, session }) => {
    const viewerId = session?.user?.id ?? null;

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = pageSize(url.searchParams.get('limit'), 20, 50);

    const result = await listTagFeed(params.tag, { viewerId, cursor, limit });
    return Response.json(result);
  }),
});
