import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getListDetail, listTimeline } from '@/lib/lists/lists.server';

/** GET /api/lists/:id/feed?cursor= — the list's chronological timeline. */
export const Route = createFileRoute('/api/lists/$id/feed')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const viewerId = session?.user.id ?? null;
          // Reuse the visibility gate: if the list isn't visible, no feed.
          const detail = await getListDetail(params.id, viewerId);
          if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor') ?? undefined;
          return Response.json(await listTimeline(viewerId, params.id, cursor));
        } catch (error) {
          console.error('List feed error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
