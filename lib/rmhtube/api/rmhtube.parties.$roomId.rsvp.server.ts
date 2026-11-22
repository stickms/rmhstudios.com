import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { goingApi, notGoingApi } from '@/lib/rmhtube/parties.contract';
import { refusalResponse, roomIdFromParams, setGoing } from '@/lib/rmhtube/parties.server';

/** Going / not going to a watch party. Needs a session; the reminders go to whoever is going. */
export const route = apiRoute('/api/rmhtube/parties/$roomId/rsvp', {
  PUT: implement(
    goingApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const roomId = roomIdFromParams(params);
      if (!roomId) return refusalResponse('NOT_FOUND');
      const result = await setGoing(roomId, userId, true);
      return result.ok
        ? {
            party: result.value,
          }
        : refusalResponse(result.reason);
    },
  ),
  DELETE: implement(
    notGoingApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const roomId = roomIdFromParams(params);
      if (!roomId) return refusalResponse('NOT_FOUND');
      const result = await setGoing(roomId, userId, false);
      return result.ok
        ? {
            party: result.value,
          }
        : refusalResponse(result.reason);
    },
  ),
});
