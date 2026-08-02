import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
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
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        return Response.json(await getRankedOverview(session?.user.id ?? null));
      }),

      POST: defineHandler(
        { body: challengeSchema, allowEmptyBody: true },
        async ({ request, session, body }) => {
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 20,
            windowMs: 60_000,
            prefix: 'ranked-challenge',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          if (!isRankedGame(body.game))
            return Response.json({ error: 'Unknown game' }, { status: 400 });

          const opponent = await prisma.user.findFirst({
            where: { OR: [{ id: body.opponent }, { handle: body.opponent }] },
            select: { id: true },
          });
          if (!opponent) return Response.json({ error: 'Player not found' }, { status: 404 });
          if (opponent.id === userId)
            return Response.json({ error: "You can't challenge yourself" }, { status: 400 });

          // Avoid duplicate open challenges between the same pair for a game.
          const dup = await prisma.rankedChallenge.findFirst({
            where: {
              game: body.game,
              status: { in: ['pending', 'accepted'] },
              OR: [
                { challengerId: userId, opponentId: opponent.id },
                { challengerId: opponent.id, opponentId: userId },
              ],
            },
            select: { id: true },
          });
          if (dup)
            return Response.json(
              { error: 'You already have an open challenge for this game' },
              { status: 400 },
            );

          const challenge = await prisma.rankedChallenge.create({
            data: { game: body.game, challengerId: userId, opponentId: opponent.id },
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
        },
      ),
    },
  },
});
