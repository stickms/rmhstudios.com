import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deletePartyApi, getPartyApi, renamePartyApi } from '@features/rmhcharacters/engine/party.contract';
import { partyIdParams, renamePartyBody } from '@features/rmhcharacters/engine/party-schema';
import { deleteParty, getParty, partyNotFound, renameParty } from '@features/rmhcharacters/engine/party.server';

/**
 * /api/rmhcharacters/parties/$id — one party for its members (404 for anyone else), rename and delete for its game
 * master. The read is never cached: a removed player must lose it on the next request.
 */
export const route = apiRoute('/api/rmhcharacters/parties/$id', {
  GET: implement(getPartyApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const p = partyIdParams.safeParse(params);
    if (!p.success) return partyNotFound();
    const party = await getParty(p.data.id, userId);
    return party ? Response.json({ party }, { headers: { 'Cache-Control': 'private, no-store' } }) : partyNotFound();
  }),
  PATCH: implement(renamePartyApi, { rateLimit: 'write', body: renamePartyBody }, async ({ userId, params, body }) => {
    const p = partyIdParams.safeParse(params);
    if (!p.success) return partyNotFound();
    return (await renameParty(p.data.id, userId, body.name)) ? { ok: true as const } : partyNotFound();
  }),
  DELETE: implement(deletePartyApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const p = partyIdParams.safeParse(params);
    if (!p.success) return partyNotFound();
    return (await deleteParty(p.data.id, userId)) ? { ok: true as const } : partyNotFound();
  }),
});
