import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';

const listQuery = z.object({ achievementId: z.string().max(64) });
const postBody = z.object({
  achievementId: z.string().max(64),
  body: z.string().trim().min(8).max(500),
});
const voteBody = z.object({ tipId: z.string().max(40) });

const known = (id: string) => ACHIEVEMENTS.some((a) => a.id === id);

/**
 * GET  /api/arcade/tips?achievementId — top tips (voted order) + whether the caller voted.
 * POST /api/arcade/tips               — write a tip (max 3 per player per achievement).
 * PUT  /api/arcade/tips               — toggle the caller's upvote on a tip.
 */
export const Route = createFileRoute('/api/arcade/tips/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: listQuery },
        async ({ userId, query }) => {
          if (!known(query.achievementId)) return notFound('Unknown achievement');
          const rows = await prisma.achievementTip.findMany({
            where: { achievementId: query.achievementId },
            orderBy: [{ votes: 'desc' }, { createdAt: 'desc' }],
            take: 20,
            select: {
              id: true,
              body: true,
              votes: true,
              userId: true,
              user: { select: userDisplaySelect },
              vote: userId ? { where: { userId }, select: { userId: true } } : false,
            },
          });
          return Response.json({
            tips: rows.map((r) => ({
              id: r.id,
              body: r.body,
              votes: r.votes,
              author: resolveUser(r.user),
              isMine: r.userId === userId,
              voted: Array.isArray(r.vote) && r.vote.length > 0,
            })),
          });
        },
      ),
      POST: defineHandler({ rateLimit: 'write', body: postBody }, async ({ userId, body }) => {
        if (!known(body.achievementId)) return notFound('Unknown achievement');
        const mine = await prisma.achievementTip.count({
          where: { userId, achievementId: body.achievementId },
        });
        if (mine >= 3) {
          return Response.json(
            { error: 'You can leave up to 3 tips per achievement.' },
            { status: 409 },
          );
        }
        const tip = await prisma.achievementTip.create({
          data: { userId, achievementId: body.achievementId, body: body.body },
          select: { id: true },
        });
        return Response.json({ id: tip.id }, { status: 201 });
      }),
      PUT: defineHandler({ rateLimit: 'write', body: voteBody }, async ({ userId, body }) => {
        const tip = await prisma.achievementTip.findUnique({
          where: { id: body.tipId },
          select: { userId: true },
        });
        if (!tip) return notFound('Unknown tip');
        if (tip.userId === userId) {
          return Response.json({ error: "You can't vote on your own tip." }, { status: 409 });
        }
        const key = { tipId_userId: { tipId: body.tipId, userId } };
        const voted = await prisma.$transaction(async (tx) => {
          const existing = await tx.achievementTipVote.findUnique({ where: key });
          if (existing) {
            await tx.achievementTipVote.delete({ where: key });
            await tx.achievementTip.update({
              where: { id: body.tipId },
              data: { votes: { decrement: 1 } },
            });
            return false;
          }
          await tx.achievementTipVote.create({ data: { tipId: body.tipId, userId } });
          await tx.achievementTip.update({
            where: { id: body.tipId },
            data: { votes: { increment: 1 } },
          });
          return true;
        });
        return Response.json({ voted });
      }),
    },
  },
});
