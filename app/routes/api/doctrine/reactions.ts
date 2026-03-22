import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { awardXp } from '@/lib/doctrine/reputation';
import { apiCache } from '@/lib/cache';

const VALID_REACTIONS = ['FIRE', 'BASED', 'MID', 'CRINGE', 'TRASH', 'TUNG'] as const;

export const Route = createFileRoute('/api/doctrine/reactions')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'doctrine-react' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const body = await request.json();
          const { reaction, safehouseId, disclosureId, incidentId } = body;

          if (!VALID_REACTIONS.includes(reaction)) {
            return Response.json({ error: 'Invalid reaction type' }, { status: 400 });
          }

          // Must have exactly one target
          const targets = [safehouseId, disclosureId, incidentId].filter(Boolean);
          if (targets.length !== 1) {
            return Response.json({ error: 'Exactly one target (safehouseId, disclosureId, or incidentId) required' }, { status: 400 });
          }

          // Determine unique constraint for upsert
          if (safehouseId) {
            await prisma.doctrineReaction.upsert({
              where: { userId_safehouseId: { userId: session.user.id, safehouseId } },
              create: { userId: session.user.id, reaction, safehouseId },
              update: { reaction },
            });
          } else if (disclosureId) {
            await prisma.doctrineReaction.upsert({
              where: { userId_disclosureId: { userId: session.user.id, disclosureId } },
              create: { userId: session.user.id, reaction, disclosureId },
              update: { reaction },
            });
          } else if (incidentId) {
            await prisma.doctrineReaction.upsert({
              where: { userId_incidentId: { userId: session.user.id, incidentId } },
              create: { userId: session.user.id, reaction, incidentId },
              update: { reaction },
            });

            await awardXp(session.user.id, 'INCIDENT_REACTION', { incidentId });
          }

          // Invalidate caches
          apiCache.invalidatePrefix('doctrine:incidents');
          apiCache.invalidatePrefix('doctrine:safehouse');
          apiCache.invalidatePrefix('doctrine:disclosures');

          return Response.json({ success: true });
        } catch (e) {
          console.error('Doctrine reaction failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
