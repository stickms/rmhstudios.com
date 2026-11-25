import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { solveLightsOutBoardApi } from '@/lib/lights-out/boards.contract';
import { solveBoardSchema } from '@/lib/lights-out/boards-schema';
import { recordSolve } from '@/lib/lights-out/boards.server';

/**
 * POST /api/lights-out/b/:id/solve — the press sequence of a finished attempt. The server replays it on the stored
 * cells and records its length only if every light ends off; a count from the client is never read.
 */
export const route = apiRoute('/api/lights-out/b/$id/solve', {
  POST: implement(
    solveLightsOutBoardApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'lights-out-board-solve' }, body: solveBoardSchema },
    async ({ userId, params, body }) => {
      const r = await recordSolve(userId, params.id, body.presses);
      if (!r.ok) return Response.json({ ...refusalBody(r.code) }, { status: r.status });
      return { ok: true as const, moves: r.moves, best: r.best, improved: r.improved, optimalMoves: r.optimalMoves };
    },
  ),
});
