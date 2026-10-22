import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getArchivedPrompt, listAnswers } from '@/lib/posts-plus/qotd.server';
import { dayKeySchema } from '@/lib/posts-plus/schema';

/**
 * GET /api/qotd/answers?day=YYYY-MM-DD&cursor= - one day's prompt and a page of
 * its answers (X4). Only days inside the archive window resolve; answers are the
 * public, live posts tagged with that day, newest first.
 */
export const Route = createFileRoute('/api/qotd/answers')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          rateLimit: 'read',
          query: z.object({ day: dayKeySchema, cursor: z.string().max(64).optional() }),
        },
        async ({ userId, query }) => {
          const prompt = await getArchivedPrompt(query.day);
          if (!prompt) return Response.json({ error: 'Not found' }, { status: 404 });
          const page = await listAnswers(query.day, userId, { cursor: query.cursor ?? null });
          return Response.json(
            { prompt, ...page },
            { headers: { 'Cache-Control': 'private, no-store' } },
          );
        },
      ),
    },
  },
});
