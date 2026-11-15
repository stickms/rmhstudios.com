import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { suggestForStory } from '@/lib/reading/stories.server';

/** GET /api/admin/reading/stories/:id/suggest — related unlinked articles (tags, then embeddings if configured). */
export const route = apiRoute('/api/admin/reading/stories/$id/suggest', {
  GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async ({ params }) => {
    return Response.json({ suggestions: await suggestForStory(params.id) });
  }),
});
