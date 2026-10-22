import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCommunityFeed } from '@/lib/community.server';

/** GET /api/communities/$slug/feed — posts in a community (cursor paginated). */
export const Route = createFileRoute('/api/communities/$slug/feed')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, session }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        // N1: filter the feed to one flair.
        const flairId = url.searchParams.get('flair');
        const feed = await getCommunityFeed(params.slug, session?.user?.id ?? null, {
          cursor,
          limit,
          flairId,
        });
        if (!feed) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(feed);
      }),
    },
  },
});
