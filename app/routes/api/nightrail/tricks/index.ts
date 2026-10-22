import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { weekKey, type TricksPayload } from '@/lib/trick-week/trick-week';
import { submitTrickSchema } from '@/lib/nightrail/trick-schema';
import { authorInclude, toTrickView } from '@/lib/trick-week/trick-week.server';

/**
 * GET  /api/nightrail/tricks — this week's submitted tricks, most-voted first (R21).
 * POST /api/nightrail/tricks — submit your best combo of the week. Nightrail
 *   keeps no replay, so a trick is its chain of moves plus its score; the score
 *   must fit under the member's recorded high score (which the leaderboard
 *   submit path has already validated), so it can't be invented from nothing.
 */
export const Route = createFileRoute('/api/nightrail/tricks/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
        const week = weekKey();
        const [rows, mine] = await Promise.all([
          prisma.nightrailTrick.findMany({
            where: { week },
            orderBy: [{ votes: 'desc' }, { score: 'desc' }],
            take: 20,
            include: authorInclude,
          }),
          userId
            ? prisma.nightrailTrickVote.findUnique({
                where: { week_userId: { week, userId } },
                select: { trickId: true },
              })
            : null,
        ]);
        const payload: TricksPayload = {
          week,
          tricks: rows.map((r) => toTrickView(r, userId)),
          myVoteTrickId: mine?.trickId ?? null,
        };
        return Response.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: submitTrickSchema },
        async ({ userId, body }) => {
          const player = await prisma.nightrailPlayer.findUnique({
            where: { userId },
            select: { highScore: true },
          });
          if (!player || body.score > player.highScore) {
            return Response.json({ error: 'score-not-recorded' }, { status: 422 });
          }
          const week = weekKey();
          const existing = await prisma.nightrailTrick.findUnique({
            where: { week_authorId: { week, authorId: userId } },
            select: { id: true, score: true },
          });
          // One entry per member per week; a better trick replaces it but keeps its votes.
          if (existing) {
            if (body.score <= existing.score) return Response.json({ id: existing.id, kept: true });
            await prisma.nightrailTrick.update({
              where: { id: existing.id },
              data: {
                level: body.level,
                score: body.score,
                multiplier: body.multiplier,
                chain: body.chain,
              },
            });
            return Response.json({ id: existing.id });
          }
          const row = await prisma.nightrailTrick.create({
            data: { week, authorId: userId, ...body },
            select: { id: true },
          });
          return Response.json({ id: row.id }, { status: 201 });
        },
      ),
    },
  },
});
