import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getIncident } from '@/lib/doctrine/incidents';
import { aggregateReactions, calculateDivisiveness } from '@/lib/doctrine/divisiveness';

export const Route = createFileRoute('/api/doctrine/incidents/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'doctrine-incident' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

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
    },
  },
});
