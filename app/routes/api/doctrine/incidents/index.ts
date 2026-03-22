import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getRecentIncidents, createIncident, reportIncident } from '@/lib/doctrine/incidents';
import { awardXp } from '@/lib/doctrine/reputation';
import type { IncidentSeverity } from '@/lib/doctrine/types';

export const Route = createFileRoute('/api/doctrine/incidents/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'doctrine-incidents' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const url = new URL(request.url);
          const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10'), 50);
          const incidents = await getRecentIncidents(limit);
          return Response.json(incidents);
        } catch (e) {
          console.error('Doctrine incidents fetch failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 3, windowMs: 300_000, prefix: 'doctrine-incident-report' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const body = await request.json();
          const { title, message, severity } = body;

          if (!title || typeof title !== 'string' || !message || typeof message !== 'string') {
            return Response.json({ error: 'Title and message are required' }, { status: 400 });
          }

          const validSeverities: IncidentSeverity[] = ['COSMETIC', 'DEGRADED', 'CRITICAL', 'CATASTROPHIC'];
          const incidentSeverity: IncidentSeverity = validSeverities.includes(severity) ? severity : 'COSMETIC';

          // Check if this is a new incident or a report on an existing one
          // Look for active incidents with similar title
          const existingIncident = await prisma.doctrineIncident.findFirst({
            where: {
              status: { in: ['ACTIVE', 'MITIGATED'] },
              title: { contains: title.slice(0, 20), mode: 'insensitive' },
            },
          });

          if (existingIncident) {
            // Add as a report
            await reportIncident(existingIncident.id, session.user.id, message);
            return Response.json({ success: true, incidentId: existingIncident.id, isNew: false });
          }

          // Create new incident
          const incident = await createIncident({
            severity: incidentSeverity,
            title,
            narrative: message,
            firstReporterId: session.user.id,
          });

          // Award XP for first report
          await awardXp(session.user.id, 'INCIDENT_FIRST_REPORT', { incidentId: incident.id });

          return Response.json({ success: true, incidentId: incident.id, isNew: true });
        } catch (e) {
          console.error('Doctrine incident report failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
