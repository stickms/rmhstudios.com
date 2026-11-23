/**
 * POST /api/signal-forge/save: the cloud save (a v2 `{ v: 2, run, meta }` blob, see engine/save.ts). It answers
 * 413 before it checks the session, so it stays hand-parsed. The leaderboard is written only by the score
 * route; a save no longer touches the high score (the rework closed that path, a save was client-controlled).
 */
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { signalForgeSaveBody } from '@features/signal-forge/engine/score-schema';

const MAX_SAVE_BODY_BYTES = 512000; // 500 KB

export const route = apiRoute('/api/signal-forge/save', {
  POST: defineHandler(
    { auth: 'none', rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-save' } },
    async ({ request }) => {
      const contentLength = request.headers.get('content-length');
      if (contentLength !== null) {
        const size = parseInt(contentLength, 10);
        if (!Number.isNaN(size) && size > MAX_SAVE_BODY_BYTES) {
          return Response.json({ error: 'Request body too large. Maximum size is 500 KB.' }, { status: 413 });
        }
      }

      try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const parsed = signalForgeSaveBody.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: 'Invalid run state' }, { status: 400 });
        const runState = parsed.data.runState as Prisma.InputJsonValue;
        const username = session.user.name || session.user.email || 'Anonymous';

        await prisma.signalForgePlayer.upsert({
          where: { userId: session.user.id },
          update: { savedRunState: runState, username },
          create: { userId: session.user.id, username, savedRunState: runState, highScore: 0, floorReached: 1 },
        });
        return Response.json({ success: true });
      } catch (error) {
        console.error('Error saving Signal Forge run:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
