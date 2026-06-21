import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** GET /api/clans/$slug — clan detail with members and the viewer's status. */
export const Route = createFileRoute('/api/clans/$slug/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

          const clan = await prisma.clan.findUnique({
            where: { slug: params.slug },
            select: {
              id: true,
              slug: true,
              name: true,
              tag: true,
              description: true,
              color: true,
              memberCount: true,
              totalXp: true,
              ownerId: true,
              createdAt: true,
              members: {
                orderBy: { contributedXp: 'desc' },
                take: 100,
                select: {
                  role: true,
                  contributedXp: true,
                  joinedAt: true,
                  user: { select: userDisplaySelect },
                },
              },
            },
          });
          if (!clan) return Response.json({ error: 'Not found' }, { status: 404 });

          // Leaderboard rank = clans with strictly more totalXp + 1.
          const rank =
            (await prisma.clan.count({ where: { totalXp: { gt: clan.totalXp } } })) + 1;

          let viewer: { isMember: boolean; inAnotherClan: boolean } = { isMember: false, inAnotherClan: false };
          if (session) {
            const me = await prisma.clanMember.findUnique({
              where: { userId: session.user.id },
              select: { clanId: true },
            });
            viewer = {
              isMember: me?.clanId === clan.id,
              inAnotherClan: !!me && me.clanId !== clan.id,
            };
          }

          return Response.json({
            clan: {
              slug: clan.slug,
              name: clan.name,
              tag: clan.tag,
              description: clan.description,
              color: clan.color,
              memberCount: clan.memberCount,
              totalXp: clan.totalXp,
              createdAt: clan.createdAt,
              rank,
              members: clan.members.map((m) => ({
                role: m.role,
                contributedXp: m.contributedXp,
                joinedAt: m.joinedAt,
                user: resolveUser(m.user),
              })),
            },
            viewer,
            signedIn: !!session,
          });
        } catch (error) {
          console.error('Clan detail error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
