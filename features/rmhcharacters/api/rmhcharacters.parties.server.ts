import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createPartyApi, listPartiesApi } from '@features/rmhcharacters/engine/party.contract';
import { createPartyBody } from '@features/rmhcharacters/engine/party-schema';
import { createParty, listParties, partyRefusal } from '@features/rmhcharacters/engine/party.server';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

/**
 * /api/rmhcharacters/parties — the parties the caller runs or plays in, and create one (the caller becomes its game
 * master). A member runs at most 10 parties.
 */
export const route = apiRoute('/api/rmhcharacters/parties', {
  GET: implement(listPartiesApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json({ parties: await listParties(userId) }, { headers: PRIVATE }),
  ),
  POST: implement(createPartyApi, { rateLimit: 'write', body: createPartyBody }, async ({ userId, body }) => {
    const r = await createParty(userId, body);
    return r.ok ? { id: r.id } : partyRefusal(r.code);
  }),
});
