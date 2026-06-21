import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { grantAchievement } from '@/lib/achievements/engine.server';

/** POST /api/clans/$slug/join — join a clan (must not already be in one). */
export const Route = createFileRoute('/api/clans/$slug/join')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'clan-join' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const clan = await prisma.clan.findUnique({ where: { slug: params.slug }, select: { id: true } });
          if (!clan) return Response.json({ error: 'Not found' }, { status: 404 });

          const existing = await prisma.clanMember.findUnique({ where: { userId }, select: { clanId: true } });
          if (existing) {
            return Response.json(
              { error: existing.clanId === clan.id ? 'Already a member' : 'Leave your current clan first' },
              { status: 400 }
            );
          }

          await prisma.$transaction([
            prisma.clanMember.create({ data: { clanId: clan.id, userId, role: 'MEMBER' } }),
            prisma.clan.update({ where: { id: clan.id }, data: { memberCount: { increment: 1 } } }),
          ]);

          await grantAchievement(userId, 'social.first_clan').catch(() => {});
          return Response.json({ success: true });
        } catch (error) {
          console.error('Clan join error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
