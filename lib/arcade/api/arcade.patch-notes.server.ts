import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getPatchNoteApi, publishPatchNoteApi } from '@/lib/arcade/arcade.contract';
import { prisma } from '@/lib/prisma.server';
import { invalidateCached } from '@/lib/cached.server';
import { enqueueGameUpdateFanout } from '@/lib/arcade/updates-jobs.server';
import { latestForLaunch, latestPatchNoteKey } from '@/lib/arcade/updates.server';
import { games } from '@/lib/catalog';

const getQuery = z.object({ path: z.string().max(80) });
const postBody = z.object({
  gameId: z.string().max(64),
  version: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});

/**
 * GET  /api/arcade/patch-notes?path=/laundry-sort — latest note for the game at that path.
 * POST /api/arcade/patch-notes (admin)            — publish a note; its version is what clients compare.
 */
export const route = apiRoute('/api/arcade/patch-notes', {
  GET: implement(
    getPatchNoteApi,
    { auth: 'none', rateLimit: 'read', query: getQuery },
    async ({ query }) => {
      const game = games.find((g) => g.href === query.path);
      const note = game ? await latestForLaunch(game.id) : null;
      return Response.json(
        { gameId: game?.id ?? null, note },
        { headers: { 'Cache-Control': 'public, max-age=60' } },
      );
    },
  ),
  POST: implement(
    publishPatchNoteApi,
    { auth: 'admin', rateLimit: 'write', body: postBody },
    async ({ body }) => {
      if (!games.some((g) => g.id === body.gameId)) {
        return Response.json({ error: 'Unknown game' }, { status: 404 });
      }
      // Re-publishing a version corrects its text; only a new version is news, so only it notifies followers.
      const existing = await prisma.gamePatchNote.findUnique({
        where: { gameId_version: { gameId: body.gameId, version: body.version } },
        select: { id: true },
      });
      if (existing) {
        await prisma.gamePatchNote.update({
          where: { id: existing.id },
          data: { title: body.title, body: body.body },
        });
      } else {
        const note = await prisma.gamePatchNote.create({ data: body, select: { id: true } });
        await enqueueGameUpdateFanout({ kind: 'update', gameId: body.gameId, noteId: note.id });
      }
      await invalidateCached(latestPatchNoteKey(body.gameId));
      return Response.json({ ok: true }, { status: 201 });
    },
  ),
});
