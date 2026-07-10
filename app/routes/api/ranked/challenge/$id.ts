import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { applyChallengeResult } from '@/lib/ranked/engine.server';

/**
 * POST /api/ranked/challenge/$id — act on a challenge.
 *   { action: 'accept' | 'decline' }                 (opponent only)
 *   { action: 'report', result: 'win'|'loss'|'draw' } (either participant)
 * 'win'/'loss' are from the reporter's perspective.
 */
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('decline') }),
  z.object({ action: z.literal('report'), result: z.enum(['win', 'loss', 'draw']) }),
]);

export const Route = createFileRoute('/api/ranked/challenge/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'ranked-act' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const challenge = await prisma.rankedChallenge.findUnique({ where: { id: params.id } });
          if (!challenge) return Response.json({ error: 'Not found' }, { status: 404 });

          const isOpponent = challenge.opponentId === userId;
          const isChallenger = challenge.challengerId === userId;
          if (!isOpponent && !isChallenger) return Response.json({ error: 'Not your challenge' }, { status: 403 });

          if (parsed.data.action === 'accept' || parsed.data.action === 'decline') {
            if (!isOpponent) return Response.json({ error: 'Only the challenged player can respond' }, { status: 403 });
            if (challenge.status !== 'pending') return Response.json({ error: 'Already responded' }, { status: 409 });
            await prisma.rankedChallenge.update({
              where: { id: challenge.id },
              data: { status: parsed.data.action === 'accept' ? 'accepted' : 'declined', ...(parsed.data.action === 'decline' ? { resolvedAt: new Date() } : {}) },
            });
            return Response.json({ success: true });
          }

          // report
          if (challenge.status !== 'accepted') {
            return Response.json({ error: 'Challenge must be accepted first' }, { status: 409 });
          }
          // Map the reporter's result to an absolute winnerId (null = draw).
          let winnerId: string | null;
          if (parsed.data.result === 'draw') winnerId = null;
          else if (parsed.data.result === 'win') winnerId = userId;
          else winnerId = isChallenger ? challenge.opponentId : challenge.challengerId;

          const result = await applyChallengeResult({
            game: challenge.game,
            challengerId: challenge.challengerId,
            opponentId: challenge.opponentId,
            winnerId,
          });

          await prisma.rankedChallenge.update({
            where: { id: challenge.id },
            data: { status: 'done', winnerId, resolvedAt: new Date() },
          });

          return Response.json({ success: true, ...result });
        } catch (error) {
          console.error('Ranked act error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
