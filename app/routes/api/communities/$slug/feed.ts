import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getCommunityFeed } from '@/lib/community.server';

/** GET /api/communities/$slug/feed — posts in a community (cursor paginated). */
export const Route = createFileRoute('/api/communities/$slug/feed')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = parseInt(url.searchParams.get('limit') || '20');
          const feed = await getCommunityFeed(params.slug, session?.user?.id ?? null, { cursor, limit });
          if (!feed) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(feed);
        } catch (error) {
          console.error('Community feed error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
