import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { collectDbDiagnostics } from '@/lib/perf/admin.server';

/**
 * GET /api/admin/perf/db — Postgres diagnostics (activity, cache hit ratio,
 * pg_stat_statements, biggest tables, missing-index and unused-index hints,
 * locks) plus this worker's connection-pool counters. Fixed SQL only; each query
 * has a 3 s statement timeout and reports null on failure. Fetched on demand by
 * the Database tab, not on the page's refresh loop.
 */
export const Route = createFileRoute('/api/admin/perf/db')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', label: 'admin-perf-db' }, async () =>
        Response.json(await collectDbDiagnostics(), { headers: { 'Cache-Control': 'no-store' } }),
      ),
    },
  },
});
