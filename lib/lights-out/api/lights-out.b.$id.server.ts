import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { deleteLightsOutBoardApi, getLightsOutBoardApi } from '@/lib/lights-out/boards.contract';
import { deleteBoard, getBoard } from '@/lib/lights-out/boards.server';

/**
 * GET    /api/lights-out/b/:id — the board, its ten fewest-move solvers and the caller's own record.
 * DELETE /api/lights-out/b/:id — the author deletes it (anyone else gets the same 404 as a missing board).
 */
export const route = apiRoute('/api/lights-out/b/$id', {
  GET: implement(getLightsOutBoardApi, { auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
    const board = await getBoard(params.id, userId);
    if (!board) return Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
    return Response.json({ board }, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
  DELETE: implement(deleteLightsOutBoardApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const ok = await deleteBoard(userId, params.id);
    return ok ? { ok: true as const } : Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
  }),
});
