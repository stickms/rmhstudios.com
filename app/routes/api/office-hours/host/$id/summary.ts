import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { officeHoursSummary } from '@/lib/calendar/office-hours.server';

/** GET /api/office-hours/host/:id/summary — does this member offer office hours? (profile button) */
export const Route = createFileRoute('/api/office-hours/host/$id/summary')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          // Opt out of the 30 s micro-cache: office-hours writes invalidate the summary in apiCache.
          microCache: false,
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 60, staleWhileRevalidate: 300 },
        },
        async ({ params }) => Response.json(await officeHoursSummary(params.id)),
      ),
    },
  },
});
