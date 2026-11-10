import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getPostEmbed } from '@/lib/code-embed/embed.server';
import { postEmbedApi } from '@/lib/feed/rmhark-actions.contract';

/** GET /api/rmharks/:id/embed — the runnable snippet on a post (F14), fetched only when a reader clicks Run. */
export const Route = createFileRoute('/api/rmharks/$id/embed')({
  server: {
    handlers: {
      GET: implement(
        postEmbedApi,
        { auth: 'optional', rateLimit: 'read' },
        async ({ userId, params }) => {
          const embed = await getPostEmbed(params.id, userId);
          if (!embed) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(embed, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
    },
  },
});
