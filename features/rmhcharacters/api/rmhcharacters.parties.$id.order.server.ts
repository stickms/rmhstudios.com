import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { writePartyOrderApi } from '@features/rmhcharacters/engine/party.contract';
import { partyIdParams, writeOrderBody } from '@features/rmhcharacters/engine/party-schema';
import { partyNotFound, partyRefusal, writeOrder } from '@features/rmhcharacters/engine/party.server';

/**
 * PUT /api/rmhcharacters/parties/$id/order — the turn order, game master only. Compare-and-set: the body carries the
 * `version` it was read at, and a write against a moved one is a 409 (the page then reloads the order).
 */
export const route = apiRoute('/api/rmhcharacters/parties/$id/order', {
  PUT: implement(
    writePartyOrderApi,
    { rateLimit: { policy: 'write', limit: 120, prefix: 'rmhc-party-order', scope: 'user' }, body: writeOrderBody },
    async ({ userId, params, body }) => {
      const p = partyIdParams.safeParse(params);
      if (!p.success) return partyNotFound();
      const r = await writeOrder(p.data.id, userId, body);
      return r.ok ? r.result : partyRefusal(r.code);
    },
  ),
});
