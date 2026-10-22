import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { games } from '@/lib/games';

const getQuery = z.object({ path: z.string().max(80) });
const postBody = z.object({
  gameId: z.string().max(64),
  version: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});

const key = (gameId: string) => `arcade:patch:${gameId}`;
const latestFor = (gameId: string) =>
  cached(key(gameId), 300_000, () =>
    prisma.gamePatchNote
      .findFirst({
        where: { gameId },
        orderBy: { createdAt: 'desc' },
        select: { version: true, title: true, body: true },
      })
      .then((r) => r ?? null),
  );

/**
 * GET  /api/arcade/patch-notes?path=/laundry-sort — latest note for the game at that path.
 * POST /api/arcade/patch-notes (admin)            — publish a note; its version is what clients compare.
 */
export const Route = createFileRoute('/api/arcade/patch-notes/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', query: getQuery },
        async ({ query }) => {
          const game = games.find((g) => g.href === query.path);
          const note = game ? await latestFor(game.id) : null;
          return Response.json(
            { gameId: game?.id ?? null, note },
            { headers: { 'Cache-Control': 'public, max-age=60' } },
          );
        },
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: postBody },
        async ({ body }) => {
          if (!games.some((g) => g.id === body.gameId)) {
            return Response.json({ error: 'Unknown game' }, { status: 404 });
          }
          await prisma.gamePatchNote.upsert({
            where: { gameId_version: { gameId: body.gameId, version: body.version } },
            create: body,
            update: { title: body.title, body: body.body },
          });
          await invalidateCached(key(body.gameId));
          return Response.json({ ok: true }, { status: 201 });
        },
      ),
    },
  },
});
