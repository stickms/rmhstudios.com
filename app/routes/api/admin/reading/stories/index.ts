import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { storySchema } from '@/lib/reading/schema';
import { createStory, listStoriesAdmin, searchArticles } from '@/lib/reading/stories.server';

/**
 * GET  /api/admin/reading/stories[?q=] — stories with their articles; with `q`,
 *      instead a title search over published news articles (the link picker).
 * POST /api/admin/reading/stories — create a story (L5).
 */
const listQuery = z.object({ q: z.string().max(100).optional() });

export const Route = createFileRoute('/api/admin/reading/stories/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', query: listQuery },
        async ({ query }) => {
          if (query.q !== undefined) {
            return Response.json({ articles: await searchArticles(query.q.trim()) });
          }
          return Response.json(
            { stories: await listStoriesAdmin() },
            { headers: { 'Cache-Control': 'private, no-store' } },
          );
        },
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: storySchema },
        async ({ userId, body }) => {
          const story = await createStory(userId, body);
          return Response.json({ story }, { status: 201 });
        },
      ),
    },
  },
});
