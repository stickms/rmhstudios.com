import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { removePartyMemberApi } from '@features/rmhcharacters/engine/party.contract';
import { partyMemberParams } from '@features/rmhcharacters/engine/party-schema';
import { partyNotFound, removeMember } from '@features/rmhcharacters/engine/party.server';

/** DELETE /api/rmhcharacters/parties/$id/members/$userId — the game master removes a player. Anyone else gets a 404. */
export const route = apiRoute('/api/rmhcharacters/parties/$id/members/$userId', {
  DELETE: implement(removePartyMemberApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const p = partyMemberParams.safeParse(params);
    if (!p.success) return partyNotFound();
    return (await removeMember(p.data.id, userId, p.data.userId)) ? { ok: true as const } : partyNotFound();
  }),
});
