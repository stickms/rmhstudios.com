import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getListDetail, listTimeline } from '@/lib/lists/lists.server';

/** GET /api/lists/:id/feed?cursor= — the list's chronological timeline. */
export const Route = createFileRoute('/api/lists/$id/feed')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, session }) => {
        const viewerId = session?.user.id ?? null;
        // Reuse the visibility gate: if the list isn't visible, no feed.
        const detail = await getListDetail(params.id, viewerId);
        if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor') ?? undefined;
        return Response.json(await listTimeline(viewerId, params.id, cursor));
      }),
    },
  },
});
