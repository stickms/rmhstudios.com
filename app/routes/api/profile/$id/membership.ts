import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { joinOrRenewMembership } from '@/lib/memberships.server';
import { createNotification } from '@/lib/notifications.server';

/**
 * POST   /api/profile/$id/membership — become / renew a coin-funded member.
 * DELETE /api/profile/$id/membership — cancel (no refund; keeps access until expiry).
 * $id is the creator's handle or user id.
 */
async function resolveCreatorId(idOrHandle: string): Promise<string | null> {
  const byHandle = await prisma.user.findUnique({
    where: { handle: idOrHandle },
    select: { id: true },
  });
  if (byHandle) return byHandle.id;
  const byId = await prisma.user.findUnique({ where: { id: idOrHandle }, select: { id: true } });
  return byId?.id ?? null;
}

export const Route = createFileRoute('/api/profile/$id/membership')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 15, windowMs: 60_000, prefix: 'membership-join' } },
        async ({ params, session }) => {
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

          return Response.json({
            success: true,
            expiresAt: result.expiresAt,
            newBalance: result.newBalance,
          });
        },
      ),

      DELETE: defineHandler({}, async ({ params, session }) => {
        const creatorId = await resolveCreatorId(params.id);
        if (!creatorId) return Response.json({ error: 'Creator not found' }, { status: 404 });

        await prisma.creatorMembership.deleteMany({
          where: { creatorId, supporterId: session.user.id },
        });
        return Response.json({ success: true });
      }),
    },
  },
});
