import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { linkArticle, unlinkArticle } from '@/lib/reading/stories.server';

/**
 * POST   /api/admin/reading/stories/:id/articles — link an article ({ slug }).
 * DELETE /api/admin/reading/stories/:id/articles?slug= — unlink it.
 */
const slugSchema = z.object({ slug: z.string().min(1).max(200) });

export const Route = createFileRoute('/api/admin/reading/stories/$id/articles')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: slugSchema },
        async ({ params, body }) => {
          const ok = await linkArticle(params.id, body.slug);
          if (!ok) return Response.json({ error: 'Story or article not found' }, { status: 404 });
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler(
        { auth: 'admin', rateLimit: 'write', query: slugSchema },
        async ({ query }) => {
          await unlinkArticle(query.slug);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
