import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { rotatePartyCodeApi } from '@features/rmhcharacters/engine/party.contract';
import { partyIdParams } from '@features/rmhcharacters/engine/party-schema';
import { partyNotFound, rotateCode } from '@features/rmhcharacters/engine/party.server';

/** POST /api/rmhcharacters/parties/$id/code — the game master changes the invite code; the old link stops working. */
export const route = apiRoute('/api/rmhcharacters/parties/$id/code', {
  POST: implement(rotatePartyCodeApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const p = partyIdParams.safeParse(params);
    if (!p.success) return partyNotFound();
    const inviteCode = await rotateCode(p.data.id, userId);
    return inviteCode ? { inviteCode } : partyNotFound();
  }),
});
