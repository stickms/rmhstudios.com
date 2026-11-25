import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteConnectionGridApi,
  editConnectionGridApi,
  getConnectionGridApi,
} from '@/lib/party/connections.contract';
import { editGridSchema } from '@/lib/party/connections-schema';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { deleteGrid, getGrid, updateGrid } from '@/lib/party/connections.server';

/**
 * GET    /api/connections/grids/:id — the grid to play (no answers) plus the caller's progress.
 * PATCH  /api/connections/grids/:id — the author edits a draft, or a grid nobody else has played.
 * DELETE /api/connections/grids/:id — author (or admin) removes it.
 */
export const route = apiRoute('/api/connections/grids/$id', {
  GET: implement(
    getConnectionGridApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ userId, params }) => {
      const grid = await getGrid(params.id, userId);
      if (!grid) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json({ grid }, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
  PATCH: implement(
    editConnectionGridApi,
    { rateLimit: 'write', body: editGridSchema },
    async ({ userId, params, body }) => {
      const r = await updateGrid(userId, params.id, body);
      if (!r.ok) return Response.json(refusalBody(r.code), { status: ERROR_CODES[r.code].http });
      return Response.json({ ok: true });
    },
  ),
  DELETE: implement(
    deleteConnectionGridApi,
    { rateLimit: 'write' },
    async ({ userId, isAdmin, params }) => {
      const ok = await deleteGrid(userId, params.id, isAdmin);
      return ok
        ? Response.json({ ok: true })
        : Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
