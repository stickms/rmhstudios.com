import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { deleteCalcGraphApi, getCalcGraphApi, updateCalcGraphApi } from '@/lib/rmhcalculator/graphs.contract';
import { CALC_GRAPH_MAX_BODY_BYTES, updateCalcGraphBody } from '@/lib/rmhcalculator/graphs-schema';
import { deleteGraph, getGraph, updateGraph } from '@/lib/rmhcalculator/graphs.server';

const notFound = () => Response.json(refusalBody('NOT_FOUND'), { status: 404 });

/** GET/PUT/DELETE /api/rmhcalculator/graphs/:id: one of the caller's own saved graphs; another member's is a 404 (s15-08). */
export const route = apiRoute('/api/rmhcalculator/graphs/$id', {
  GET: implement(
    getCalcGraphApi,
    { rateLimit: 'read', cache: { visibility: 'private', maxAge: 0 } },
    async ({ userId, params }) => {
      const graph = await getGraph(userId, params.id);
      return graph ? { graph } : notFound();
    },
  ),
  PUT: implement(
    updateCalcGraphApi,
    { rateLimit: 'write', body: updateCalcGraphBody, maxBodyBytes: CALC_GRAPH_MAX_BODY_BYTES },
    async ({ userId, params, body }) => {
      const out = await updateGraph(userId, params.id, body);
      if (out === 'ok') return { ok: true as const };
      if (out === 'invalid-result') return Response.json(refusalBody('INVALID_INPUT'), { status: 400 });
      return notFound();
    },
  ),
  DELETE: implement(deleteCalcGraphApi, { rateLimit: 'write' }, async ({ userId, params }) =>
    (await deleteGraph(userId, params.id)) ? { ok: true as const } : notFound(),
  ),
});
