import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { swapPartyCharacterApi } from '@features/rmhcharacters/engine/party.contract';
import { partyIdParams, swapCharacterBody } from '@features/rmhcharacters/engine/party-schema';
import { partyNotFound, partyRefusal, swapCharacter } from '@features/rmhcharacters/engine/party.server';

/** PUT /api/rmhcharacters/parties/$id/character — a player brings another of their own characters of the party's system. */
export const route = apiRoute('/api/rmhcharacters/parties/$id/character', {
  PUT: implement(
    swapPartyCharacterApi,
    { rateLimit: 'write', body: swapCharacterBody },
    async ({ userId, params, body }) => {
      const p = partyIdParams.safeParse(params);
      if (!p.success) return partyNotFound();
      const r = await swapCharacter(p.data.id, userId, body.characterId);
      return r.ok ? { ok: true as const } : partyRefusal(r.code);
    },
  ),
});
