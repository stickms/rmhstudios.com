/**
 * O8 — the admin content dashboard's read, and O2's broken-chart sweep.
 *
 * Storage totals, quota headroom, upload rate, chart-version distribution and
 * orphaned objects are all computable from data that already exists and were
 * surfaced nowhere. The first signal that the 10 GB cap was close was uploads
 * failing.
 *
 * One endpoint with a `view` rather than three routes: the three views share
 * their auth, their rate limit and their audience, and the orphan scan is the
 * only one expensive enough to want its own call — which is exactly why it is
 * opt-in rather than part of the default payload.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { auditLibrary, contentDashboard, orphanedObjects } from '@/lib/slice-it/ops.server';

const QueryZ = z.object({
  view: z.enum(['dashboard', 'broken', 'orphans']).default('dashboard'),
  /** Days of upload history for the dashboard view. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const Route = createFileRoute('/api/slice-it/admin/content')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', query: QueryZ }, async ({ query }) => {
        if (query.view === 'broken') {
          return Response.json({ charts: await auditLibrary() });
        }
        if (query.view === 'orphans') {
          // Keys only, never a delete. `listObjects` is bounded and a listing
          // can race an in-flight upload, so this is a candidate list for a
          // human — see `orphanedObjects`.
          const keys = await orphanedObjects();
          return Response.json({ keys, count: keys.length });
        }
        return Response.json(await contentDashboard(query.days));
      }),
    },
  },
});
