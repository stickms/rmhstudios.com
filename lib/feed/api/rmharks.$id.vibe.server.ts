import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getPostVibe } from '@/lib/rmhvibe/vibe-embed.server';
import { postVibeApi } from '@/lib/feed/rmhark-actions.contract';

/** GET /api/rmharks/:id/vibe — the vibe pinned to a post, fetched when its card nears the viewport. */
export const route = apiRoute('/api/rmharks/$id/vibe', {
  GET: implement(
    postVibeApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ userId, params }) => {
      const vibe = await getPostVibe(params.id, userId);
      if (!vibe) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json(vibe, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
});
