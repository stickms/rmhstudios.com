import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { transitionIncidentStatus, addIncidentEvent } from '@/lib/doctrine/incidents';
import type { IncidentStatus } from '@/lib/doctrine/types';

const VALID_STATUSES: IncidentStatus[] = ['ACTIVE', 'MITIGATED', 'RESOLVED', 'LEGENDARY'];

export const Route = createFileRoute('/api/doctrine/admin/incidents')({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'doctrine-admin-incident' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const admin = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isAdmin: true },
          });

          if (!admin?.isAdmin) {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
          }

          const body = await request.json();
          const { id, status, narrative, timelineMessage } = body;

          if (!id) {
            return Response.json({ error: 'Incident id is required' }, { status: 400 });
          }

          // Update narrative if provided
          if (narrative && typeof narrative === 'string') {
            await prisma.doctrineIncident.update({
              where: { id },
              data: { narrative },
            });
          }

          // Add timeline event if provided
          if (timelineMessage && typeof timelineMessage === 'string') {
            await addIncidentEvent(id, 'update', timelineMessage);
          }

          // Transition status if provided
          if (status && VALID_STATUSES.includes(status)) {
            await transitionIncidentStatus(id, status);
          }

          const incident = await prisma.doctrineIncident.findUnique({
            where: { id },
            include: { timeline: { orderBy: { createdAt: 'asc' } } },
          });

          return Response.json({ success: true, incident });
        } catch (e) {
          console.error('Doctrine admin incident update failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
