import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { transitionIncidentStatus, addIncidentEvent } from '@features/doctrine/engine/incidents';
import { logAdminAction } from '@/lib/admin-audit.server';
import type { IncidentStatus } from '@features/doctrine/engine/types';

const VALID_STATUSES: IncidentStatus[] = ['ACTIVE', 'MITIGATED', 'RESOLVED', 'LEGENDARY'];

export const route = apiRoute('/api/doctrine/admin/incidents', {
  PATCH: defineHandler(
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'doctrine-admin-incident' },
    },
    async ({ request, session }) => {
      try {
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

        await logAdminAction(session.user.id, 'doctrine.incident.update', {
          targetType: 'DoctrineIncident',
          targetId: String(id),
          detail: typeof status === 'string' ? status : 'update',
        });

        return Response.json({ success: true, incident });
      } catch (e) {
        console.error('Doctrine admin incident update failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
