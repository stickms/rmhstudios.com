import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { collectPerfOverview } from '@/lib/perf/admin.server';

/**
 * GET /api/admin/perf — everything the Performance page's auto-refresh needs in
 * one response: every web worker + the jobs worker (from Redis), the three
 * realtime hubs (over the compose network), the merged web-tier aggregate, and
 * Redis health. The answering worker's own entry is always its live snapshot, so
 * the page works with Redis off.
 */
export const Route = createFileRoute('/api/admin/perf/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', label: 'admin-perf' }, async () =>
        Response.json(await collectPerfOverview(), { headers: { 'Cache-Control': 'no-store' } }),
      ),
    },
  },
});
