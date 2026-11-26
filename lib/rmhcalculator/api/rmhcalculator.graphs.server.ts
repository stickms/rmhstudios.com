import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { createCalcGraphApi, listCalcGraphsApi } from '@/lib/rmhcalculator/graphs.contract';
import { CALC_GRAPH_LIMIT, CALC_GRAPH_MAX_BODY_BYTES, createCalcGraphBody } from '@/lib/rmhcalculator/graphs-schema';
import { createGraph, listGraphs } from '@/lib/rmhcalculator/graphs.server';

/** GET/POST /api/rmhcalculator/graphs: the caller's own saved graphs (s15-08). */
export const route = apiRoute('/api/rmhcalculator/graphs', {
  GET: implement(
    listCalcGraphsApi,
    { rateLimit: 'read', cache: { visibility: 'private', maxAge: 0 } },
    async ({ userId }) => ({ graphs: await listGraphs(userId) }),
  ),
  POST: implement(
    createCalcGraphApi,
    { rateLimit: 'write', body: createCalcGraphBody, maxBodyBytes: CALC_GRAPH_MAX_BODY_BYTES },
    async ({ userId, body }) => {
      const out = await createGraph(userId, body);
      if (out.ok) return { id: out.id };
      if (out.reason === 'limit')
        return Response.json(refusalBody('CALC_GRAPH_LIMIT', { max: CALC_GRAPH_LIMIT }), { status: 409 });
      return Response.json(refusalBody('INVALID_INPUT'), { status: 400 });
    },
  ),
});
