import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { publishConnectionGridApi } from '@/lib/party/connections.contract';
import { publishGrid } from '@/lib/party/connections.server';

/** POST /api/connections/grids/:id/publish — the author turns a complete draft into a grid others can play. */
export const route = apiRoute('/api/connections/grids/$id/publish', {
  POST: implement(publishConnectionGridApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const r = await publishGrid(userId, params.id);
    if (!r.ok) return Response.json(refusalBody(r.code), { status: ERROR_CODES[r.code].http });
    return Response.json({ ok: true });
  }),
});
