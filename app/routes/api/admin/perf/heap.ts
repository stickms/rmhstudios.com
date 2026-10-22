import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { collectHeap } from '@/lib/perf/admin.server';

/**
 * GET /api/admin/perf/heap — V8 heap statistics and per-space sizes for the
 * worker that serves the request. Deliberately NOT a heap snapshot: writing one
 * pauses the worker for seconds and can roughly double its memory, which under
 * the 384 MB per-worker cap is how you turn a diagnosis into an outage.
 */
export const Route = createFileRoute('/api/admin/perf/heap')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', label: 'admin-perf-heap' }, () =>
        Response.json(collectHeap(), { headers: { 'Cache-Control': 'no-store' } }),
      ),
    },
  },
});
