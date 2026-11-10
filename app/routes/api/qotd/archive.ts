import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getQotdArchiveApi } from '@/lib/posts-plus/qotd.contract';
import { listArchive } from '@/lib/posts-plus/qotd.server';

/** GET /api/qotd/archive - today's and the past 29 days' prompts with answer counts (X4). */
export const Route = createFileRoute('/api/qotd/archive')({
  server: {
    handlers: {
      GET: implement(getQotdArchiveApi, { auth: 'none', rateLimit: 'read' }, async () =>
        Response.json(
          { days: await listArchive() },
          { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=60' } },
        ),
      ),
    },
  },
});
