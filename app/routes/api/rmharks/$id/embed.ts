import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getPostEmbed } from '@/lib/code-embed/embed.server';

/** GET /api/rmharks/:id/embed — the runnable snippet on a post (F14), fetched only when a reader clicks Run. */
export const Route = createFileRoute('/api/rmharks/$id/embed')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const embed = await getPostEmbed(params.id, userId);
        if (!embed) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(embed, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
    },
  },
});
