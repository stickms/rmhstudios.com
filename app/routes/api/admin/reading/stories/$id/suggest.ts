import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { suggestForStory } from '@/lib/reading/stories.server';

/** GET /api/admin/reading/stories/:id/suggest — related unlinked articles (tags, then embeddings if configured). */
export const Route = createFileRoute('/api/admin/reading/stories/$id/suggest')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async ({ params }) => {
        return Response.json({ suggestions: await suggestForStory(params.id) });
      }),
    },
  },
});
