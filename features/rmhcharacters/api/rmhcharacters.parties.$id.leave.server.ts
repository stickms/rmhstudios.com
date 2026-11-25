import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { leavePartyApi } from '@features/rmhcharacters/engine/party.contract';
import { partyIdParams } from '@features/rmhcharacters/engine/party-schema';
import { leaveParty, partyNotFound } from '@features/rmhcharacters/engine/party.server';

/** POST /api/rmhcharacters/parties/$id/leave — a player leaves; the game master's access to their sheet ends at once. */
export const route = apiRoute('/api/rmhcharacters/parties/$id/leave', {
  POST: implement(leavePartyApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const p = partyIdParams.safeParse(params);
    if (!p.success) return partyNotFound();
    return (await leaveParty(p.data.id, userId)) ? { ok: true as const } : partyNotFound();
  }),
});
