import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { authorizeInternalRequest } from '@/lib/internal-auth';
import { postDeployVerdict } from '@/lib/ops/post-deploy.server';

const querySchema = z.object({
  /** Deploy finish time, epoch seconds. At most 1 hour back. */
  since: z.coerce.number().int().positive(),
});

/**
 * GET /api/internal/ops/post-deploy-health?since=<epoch s> — the post-deploy
 * guard's question: are the page/API 5xx or latency alarms (A08/A09) firing on
 * the minutes since the deploy? `{ rollback, reasons }`. Server-to-server
 * (deploy/post-deploy-guard.sh): the internal secret is checked before anything
 * else.
 */
export const Route = createFileRoute('/api/internal/ops/post-deploy-health')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', label: 'internal-post-deploy-health' },
        async ({ request }) => {
          const authz = authorizeInternalRequest(
            request.headers.get('x-internal-secret'),
            process.env.INTERNAL_API_SECRET,
          );
          if (!authz.ok) {
            return Response.json({ error: 'Unauthorized' }, { status: authz.status });
          }
          const parsed = querySchema.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          const now = Date.now();
          const since = Math.max(parsed.data.since * 1000, now - 60 * 60_000);
          return Response.json(await postDeployVerdict(since, now), {
            headers: { 'Cache-Control': 'no-store' },
          });
        },
      ),
    },
  },
});
