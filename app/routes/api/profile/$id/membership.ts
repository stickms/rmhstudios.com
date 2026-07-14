import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { joinOrRenewMembership } from '@/lib/memberships.server';
import { createNotification } from '@/lib/notifications.server';

/**
 * POST   /api/profile/$id/membership — become / renew a coin-funded member.
 * DELETE /api/profile/$id/membership — cancel (no refund; keeps access until expiry).
 * $id is the creator's handle or user id.
 */
async function resolveCreatorId(idOrHandle: string): Promise<string | null> {
  const byHandle = await prisma.user.findUnique({ where: { handle: idOrHandle }, select: { id: true } });
  if (byHandle) return byHandle.id;
  const byId = await prisma.user.findUnique({ where: { id: idOrHandle }, select: { id: true } });
  return byId?.id ?? null;
}

export const Route = createFileRoute('/api/profile/$id/membership')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 15,
            windowMs: 60_000,
            prefix: 'membership-join',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const creatorId = await resolveCreatorId(params.id);
          if (!creatorId) return Response.json({ error: 'Creator not found' }, { status: 404 });

          const result = await joinOrRenewMembership(creatorId, session.user.id);
          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }

          // Best-effort: tell the creator they have a new/renewed member.
          void createNotification({
            userId: creatorId,
            actorId: session.user.id,
            type: 'SYSTEM',
            entityType: 'membership',
            entityId: session.user.id,
            preview: `${session.user.name ?? 'Someone'} became a member 🎉`,
          }).catch(() => {});

          return Response.json({ success: true, expiresAt: result.expiresAt, newBalance: result.newBalance });
        } catch (error) {
          console.error('Membership POST error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const creatorId = await resolveCreatorId(params.id);
          if (!creatorId) return Response.json({ error: 'Creator not found' }, { status: 404 });

          await prisma.creatorMembership.deleteMany({
            where: { creatorId, supporterId: session.user.id },
          });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Membership DELETE error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
