import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/communities.contract';
import { getCommunityFeed } from '@/lib/communities/detail.server';

/** GET /api/communities/$slug/feed — posts in a community (cursor paginated). */
export const route = apiRoute('/api/communities/$slug/feed', {
  GET: implement(C.communityFeedApi, { auth: 'optional' }, async ({ request, params, session }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = pageSize(url.searchParams.get('limit'), 20, 50);
    // N1: filter the feed to one flair.
    const flairId = url.searchParams.get('flair');
    const feed = await getCommunityFeed(params.slug, session?.user?.id ?? null, {
      cursor,
      limit,
      flairId,
      // s09-06: the site's feed carries the pinned block (first page) and leaves pinned posts out of every page.
      withPins: true,
    });
    if (!feed) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(feed);
  }),
});
