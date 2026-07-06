import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listTagFeed } from '@/lib/tags.server';

/** GET /api/tags/$tag — posts containing #tag, newest first (cursor paginated). */
export const Route = createFileRoute('/api/tags/$tag')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const viewerId = session?.user?.id ?? null;

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = parseInt(url.searchParams.get('limit') || '20');

          const result = await listTagFeed(params.tag, { viewerId, cursor, limit });
          return Response.json(result);
        } catch (error) {
          console.error('Tag feed error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
