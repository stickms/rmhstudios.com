import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listPartyRollsApi, rollForPartyApi } from '@features/rmhcharacters/engine/party-rolls.contract';
import { listRollsQuery, rollBody } from '@features/rmhcharacters/engine/party-rolls-schema';
import { partyIdParams } from '@features/rmhcharacters/engine/party-schema';
import { listPartyRolls, rollForParty, rollRefusal } from '@features/rmhcharacters/engine/party-rolls.server';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * /api/rmhcharacters/parties/$id/rolls — the table's log and a roll for the table.
 *
 * GET answers the newest 50 rolls the caller may see (`after` pages to older ones); a player who is not in the party
 * now, whatever the reason, gets the same 404. POST names what to roll: the server reads the caller's own character,
 * computes the modifier and rolls, so a modifier or a result in the body is ignored. 30 rolls a minute per member.
 */
export const route = apiRoute('/api/rmhcharacters/parties/$id/rolls', {
  GET: implement(listPartyRollsApi, { rateLimit: 'read', query: listRollsQuery }, async ({ userId, params, query }) => {
    const p = partyIdParams.safeParse(params);
    if (!p.success) return rollRefusal('NOT_FOUND');
    const list = await listPartyRolls(userId, p.data.id, query.after);
    return list ? Response.json(list, { headers: NO_STORE }) : rollRefusal('NOT_FOUND');
  }),
  POST: implement(
    rollForPartyApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'party-rolls', scope: 'user' }, body: rollBody },
    async ({ userId, params, body }) => {
      const p = partyIdParams.safeParse(params);
      if (!p.success) return rollRefusal('NOT_FOUND');
      const r = await rollForParty(userId, p.data.id, body);
      return r.ok ? Response.json(r.roll, { headers: NO_STORE }) : rollRefusal(r.code);
    },
  ),
});
