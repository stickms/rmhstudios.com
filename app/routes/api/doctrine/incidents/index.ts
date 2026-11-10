import { z } from 'zod';
import { pageSize } from '@/lib/pagination';
import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/doctrine/doctrine.contract';
import { defineHandler } from '@/lib/api/handler.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { prisma } from '@/lib/prisma.server';
import { getRecentIncidents, createIncident, reportIncident } from '@/lib/doctrine/incidents';
import { awardXp } from '@/lib/doctrine/reputation';
import type { IncidentSeverity } from '@/lib/doctrine/types';

export const Route = createFileRoute('/api/doctrine/incidents/')({
  server: {
    handlers: {
      GET: implement(
        C.listDoctrineIncidentsApi,
        {
          auth: 'none',
          query: z.object({ limit: z.string().optional() }),
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'doctrine-incidents' },
          // Recent-incident list keyed by ?limit=. A report or reaction clears the
          // in-process cached() copy (15 s TTL), but NOT browser/CDN copies
          // (CACHE_POLICY.liveList: 15 s browser, 30 s CDN, +60 s while stale is
          // revalidated), so a client can lag a report by up to ~90 s. Acceptable:
          // a public, display-only feed no decision reads (rule 1.2). The server's
          // own per-worker micro-cache is off (`microCache: false`) because
          // invalidateCachedPrefix does not reach it. The single-incident route
          // ($id.ts) is separate.
          microCache: false,
          cache: CACHE_POLICY.liveList,
        },
        async ({ request }) => {
          try {
            const url = new URL(request.url);
            const limit = pageSize(url.searchParams.get('limit'), 10, 50);
            const incidents = await getRecentIncidents(limit);
            return Response.json(incidents);
          } catch (e) {
            console.error('Doctrine incidents fetch failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),

      POST: defineHandler(
        {
          rateLimit: { limit: 3, windowMs: 300_000, prefix: 'doctrine-incident-report' },
        },
        async ({ request, session }) => {
          try {
            const body = await request.json();
            const { title, message, severity } = body;

            if (!title || typeof title !== 'string' || !message || typeof message !== 'string') {
              return Response.json({ error: 'Title and message are required' }, { status: 400 });
            }

            const validSeverities: IncidentSeverity[] = [
              'COSMETIC',
              'DEGRADED',
              'CRITICAL',
              'CATASTROPHIC',
            ];
            const incidentSeverity: IncidentSeverity = validSeverities.includes(severity)
              ? severity
              : 'COSMETIC';

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
              return Response.json({
                success: true,
                incidentId: existingIncident.id,
                isNew: false,
              });
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
      ),
    },
  },
});
