import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { joinPartyApi, previewPartyJoinApi } from '@features/rmhcharacters/engine/party.contract';
import { joinPartyBody, joinPreviewQuery } from '@features/rmhcharacters/engine/party-schema';
import { joinParty, partyNotFound, partyRefusal, previewJoin } from '@features/rmhcharacters/engine/party.server';

/**
 * /api/rmhcharacters/party-join — what an invite link opens (GET: the party's name and system) and joining with it
 * (POST). The code is the whole credential: an unknown or rotated one is a 404. A block either way with the game
 * master, a ban, a full party, the caller's caps and the wrong system refuse inside the join transaction.
 */
export const route = apiRoute('/api/rmhcharacters/party-join', {
  GET: implement(previewPartyJoinApi, { rateLimit: 'read', query: joinPreviewQuery }, async ({ query }) => {
    const party = await previewJoin(query.code);
    return party ? Response.json({ party }, { headers: { 'Cache-Control': 'private, no-store' } }) : partyNotFound();
  }),
  POST: implement(
    joinPartyApi,
    { rateLimit: { policy: 'write', limit: 20, prefix: 'rmhc-party-join', scope: 'user' }, body: joinPartyBody },
    async ({ userId, body }) => {
      const r = await joinParty(userId, body);
      return r.ok ? { id: r.id } : partyRefusal(r.code);
    },
  ),
});
