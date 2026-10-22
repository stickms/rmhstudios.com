import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { getIncident } from '@/lib/doctrine/incidents';
import { aggregateReactions, calculateDivisiveness } from '@/lib/doctrine/divisiveness';

export const Route = createFileRoute('/api/doctrine/incidents/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'doctrine-incident' },
          // A single incident, keyed by the path param. The record itself does
          // not change once published, but the response carries live
          // `reactionCounts` and `divisiveness`, so it shares the list route's
          // window (index.ts) instead of a 5 min shared cache plus 1 h stale.
          cache: CACHE_POLICY.liveList,
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
