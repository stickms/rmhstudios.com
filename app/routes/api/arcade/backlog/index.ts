import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { PLAY_STATUSES, FINISH_STATUSES } from '@/lib/arcade/backlog';
import { completionStats, isKnownGame } from '@/lib/arcade/backlog.server';

const gameQuery = z.object({ gameId: z.string().max(64) });
const putBody = z.object({
  gameId: z.string().max(64),
  status: z.enum(PLAY_STATUSES),
  finishMinutes: z.number().int().min(1).max(60_000).nullable().optional(),
});

/**
 * GET    /api/arcade/backlog?gameId — caller's status for a game + community median.
 * PUT    /api/arcade/backlog        — set status (and completion time when finished).
 * DELETE /api/arcade/backlog?gameId — clear it.
 */
export const Route = createFileRoute('/api/arcade/backlog/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: gameQuery },
        async ({ userId, query }) => {
          if (!isKnownGame(query.gameId)) return notFound('Unknown game');
          const [stats, mine] = await Promise.all([
            completionStats(query.gameId),
            userId
              ? prisma.gamePlayStatus.findUnique({
                  where: { userId_gameId: { userId, gameId: query.gameId } },
                  select: { status: true, finishMinutes: true },
                })
              : null,
          ]);
          return Response.json({ stats, mine });
        },
      ),
      PUT: defineHandler({ rateLimit: 'write', body: putBody }, async ({ userId, body }) => {
        if (!isKnownGame(body.gameId)) return notFound('Unknown game');
        const finishMinutes = (FINISH_STATUSES as readonly string[]).includes(body.status)
          ? (body.finishMinutes ?? null)
          : null;
        await prisma.gamePlayStatus.upsert({
          where: { userId_gameId: { userId, gameId: body.gameId } },
          create: { userId, gameId: body.gameId, status: body.status, finishMinutes },
          update: { status: body.status, finishMinutes },
        });
        return Response.json({ ok: true });
      }),
      DELETE: defineHandler({ rateLimit: 'write', query: gameQuery }, async ({ userId, query }) => {
        await prisma.gamePlayStatus.deleteMany({ where: { userId, gameId: query.gameId } });
        return Response.json({ ok: true });
      }),
    },
  },
});
