import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listTagFeed } from '@/lib/tags.server';

/** GET /api/tags/$tag — posts containing #tag, newest first (cursor paginated). */
export const Route = createFileRoute('/api/tags/$tag')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, session }) => {
        const viewerId = session?.user?.id ?? null;

        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        const limit = parseInt(url.searchParams.get('limit') || '20');

        const result = await listTagFeed(params.tag, { viewerId, cursor, limit });
        return Response.json(result);
      }),
    },
  },
});
