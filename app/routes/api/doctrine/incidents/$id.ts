import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getIncident } from '@/lib/doctrine/incidents';
import { aggregateReactions, calculateDivisiveness } from '@/lib/doctrine/divisiveness';

export const Route = createFileRoute('/api/doctrine/incidents/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'doctrine-incident' },
          // A single incident record, keyed entirely by the path param and
          // effectively immutable once published.
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 3600 },
        },
        async ({ params }) => {
          try {
            const incident = await getIncident(params.id);
            if (!incident) {
              return Response.json({ error: 'Incident not found' }, { status: 404 });
            }

            const reactionCounts = aggregateReactions(incident.reactions);

            return Response.json({
              ...incident,
              reactionCounts,
              divisiveness: calculateDivisiveness(reactionCounts),
            });
          } catch (e) {
            console.error('Doctrine incident fetch failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
