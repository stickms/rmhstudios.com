import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listArchive } from '@/lib/posts-plus/qotd.server';

/** GET /api/qotd/archive - today's and the past 29 days' prompts with answer counts (X4). */
export const Route = createFileRoute('/api/qotd/archive')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async () =>
        Response.json(
          { days: await listArchive() },
          { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=60' } },
        ),
      ),
    },
  },
});
