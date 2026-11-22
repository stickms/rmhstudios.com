import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { cancelPartyApi, getPartyApi, updatePartyApi } from '@/lib/rmhtube/parties.contract';
import { updatePartyBody } from '@/lib/rmhtube/parties-schema';
import { cancelParty, getParty, refusalResponse, roomIdFromParams, updateParty } from '@/lib/rmhtube/parties.server';

/** One watch party: read it (anyone with the code), edit it or cancel it (its host only). */
export const route = apiRoute('/api/rmhtube/parties/$roomId', {
  GET: implement(
    getPartyApi,
    {
      auth: 'optional',
      rateLimit: 'read',
    },
    async ({ userId, params }) => {
      const roomId = roomIdFromParams(params);
      const party = roomId ? await getParty(roomId, userId) : null;
      return party
        ? {
            party,
          }
        : refusalResponse('NOT_FOUND');
    },
  ),
  PATCH: implement(
    updatePartyApi,
    {
      rateLimit: 'write',
      body: updatePartyBody,
    },
    async ({ userId, params, body }) => {
      const roomId = roomIdFromParams(params);
      if (!roomId) return refusalResponse('NOT_FOUND');
      const result = await updateParty(roomId, userId, body);
      return result.ok
        ? {
            party: result.value,
          }
        : refusalResponse(result.reason);
    },
  ),
  DELETE: implement(
    cancelPartyApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const roomId = roomIdFromParams(params);
      if (!roomId) return refusalResponse('NOT_FOUND');
      const result = await cancelParty(roomId, userId);
      return result.ok
        ? {
            ok: true as const,
          }
        : refusalResponse(result.reason);
    },
  ),
});
