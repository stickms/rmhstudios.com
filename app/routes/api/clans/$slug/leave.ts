import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/clans/$slug/leave — leave a clan. If the owner leaves, ownership
 * passes to the next-highest contributor; if they were the last member the
 * clan is disbanded.
 */
export const Route = createFileRoute('/api/clans/$slug/leave')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'clan-leave' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const clan = await prisma.clan.findUnique({
            where: { slug: params.slug },
            select: { id: true, ownerId: true, memberCount: true },
          });
          if (!clan) return Response.json({ error: 'Not found' }, { status: 404 });

          const membership = await prisma.clanMember.findUnique({ where: { userId }, select: { id: true, clanId: true } });
          if (!membership || membership.clanId !== clan.id) {
            return Response.json({ error: 'Not a member' }, { status: 400 });
          }

          await prisma.$transaction(async (tx) => {
            await tx.clanMember.delete({ where: { id: membership.id } });

            const remaining = clan.memberCount - 1;
            if (remaining <= 0) {
              // Last member out — disband.
              await tx.clan.delete({ where: { id: clan.id } });
              return;
            }

            await tx.clan.update({ where: { id: clan.id }, data: { memberCount: { decrement: 1 } } });

            // If the owner left, promote the top remaining contributor.
            if (clan.ownerId === userId) {
              const heir = await tx.clanMember.findFirst({
                where: { clanId: clan.id },
                orderBy: [{ contributedXp: 'desc' }, { joinedAt: 'asc' }],
                select: { id: true, userId: true },
              });
              if (heir) {
                await tx.clanMember.update({ where: { id: heir.id }, data: { role: 'OWNER' } });
                await tx.clan.update({ where: { id: clan.id }, data: { ownerId: heir.userId } });
              }
            }
          });

          return Response.json({ success: true });
        } catch (error) {
          console.error('Clan leave error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
