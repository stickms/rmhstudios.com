/**
 * GET /api/kaikai-debt/stats — every aggregate the analytics section draws.
 *
 * Public and cacheable, for the same reason `/api/kaikai-debt` is: what comes
 * back is a set of **bases**, not a set of totals. Each group's figure is
 * `basis · e^(r·t)` evaluated in the browser, so a payload served thirty
 * seconds stale still draws charts that are growing correctly — it is the
 * growth law that is live, not the numbers in the response.
 *
 * One request for the whole section rather than one per chart: they are all
 * aggregates over the same table, they are read together behind one cache
 * (`stats.server.ts`), and a page that fires eight requests to draw one panel
 * is eight chances for a partially-drawn panel.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getDebtStats } from '@/lib/kaikai-debt/stats.server';

export const Route = createFileRoute('/api/kaikai-debt/stats')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          // Identical for every caller — no field here depends on who is
          // asking, which is the precondition `assertCacheSpec` enforces for
          // `public`. The max-age matches the server-side cache's own TTL, so a
          // CDN hit and a process-cache hit are the same age of data.
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 30, staleWhileRevalidate: 120 },
          // `asOfMs` moves on every read, so an ETag would never match and the
          // hash would be pure overhead — the same call `/api/kaikai-debt` makes.
          etag: false,
        },
        async () => Response.json(await getDebtStats()),
      ),
    },
  },
});
