import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { createLightsOutBoardApi, listLightsOutBoardsApi } from '@/lib/lights-out/boards.contract';
import { createBoardSchema, listBoardsQuery } from '@/lib/lights-out/boards-schema';
import { createBoard, listBoards } from '@/lib/lights-out/boards.server';

/**
 * GET  /api/lights-out/b?tab=recent|played|mine&cursor= — a page of member-made boards. Private: blocks decide who
 *      sees which author, so no shared cache. `mine` needs a session and is empty without one.
 * POST /api/lights-out/b — publish a board (shape and cells re-checked, the optimum is the exact solver's, caps under
 *      a per-member lock).
 */
export const route = apiRoute('/api/lights-out/b', {
  GET: implement(
    listLightsOutBoardsApi,
    { auth: 'optional', rateLimit: 'read', query: listBoardsQuery },
    async ({ userId, query }) =>
      Response.json(await listBoards(userId, query.tab, query.cursor), {
        headers: { 'Cache-Control': 'private, no-store' },
      }),
  ),
  POST: implement(
    createLightsOutBoardApi,
    { rateLimit: 'write', body: createBoardSchema },
    async ({ userId, body }) => {
      const r = await createBoard(userId, body);
      if (!r.ok) return Response.json({ ...refusalBody(r.code) }, { status: r.status });
      return Response.json({ id: r.id, optimalMoves: r.optimalMoves }, { status: 201 });
    },
  ),
});
