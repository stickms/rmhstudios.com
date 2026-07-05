import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { isRankedGame } from '@/lib/ranked/elo';
import { getRankedOverview } from '@/lib/ranked.server';
import { createNotification } from '@/lib/notifications.server';

const challengeSchema = z.object({
  game: z.string().max(40),
  opponent: z.string().min(1).max(64), // id or handle
});

/**
 * GET  /api/ranked — the viewer's ratings + pending/active challenges.
 * POST /api/ranked — issue a challenge to another player.
 */
export const Route = createFileRoute('/api/ranked/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        return Response.json(await getRankedOverview(session?.user.id ?? null));
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'ranked-challenge' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = challengeSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          if (!isRankedGame(parsed.data.game)) return Response.json({ error: 'Unknown game' }, { status: 400 });

          const opponent = await prisma.user.findFirst({
            where: { OR: [{ id: parsed.data.opponent }, { handle: parsed.data.opponent }] },
            select: { id: true },
          });
          if (!opponent) return Response.json({ error: 'Player not found' }, { status: 404 });
          if (opponent.id === userId) return Response.json({ error: "You can't challenge yourself" }, { status: 400 });

          // Avoid duplicate open challenges between the same pair for a game.
          const dup = await prisma.rankedChallenge.findFirst({
            where: {
              game: parsed.data.game,
              status: { in: ['pending', 'accepted'] },
              OR: [
                { challengerId: userId, opponentId: opponent.id },
                { challengerId: opponent.id, opponentId: userId },
              ],
            },
            select: { id: true },
          });
          if (dup) return Response.json({ error: 'You already have an open challenge for this game' }, { status: 400 });

          const challenge = await prisma.rankedChallenge.create({
            data: { game: parsed.data.game, challengerId: userId, opponentId: opponent.id },
          });

          await createNotification({
            userId: opponent.id,
            actorId: userId,
            type: 'SYSTEM',
            entityType: 'ranked',
            entityId: challenge.id,
            preview: `${session.user.name ?? 'Someone'} challenged you to a ranked match`,
            link: '/ranked',
          }).catch(() => {});

          return Response.json({ success: true, id: challenge.id }, { status: 201 });
        } catch (error) {
          console.error('Ranked challenge error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
