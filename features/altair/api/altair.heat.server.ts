import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/altair/engine/altair.contract';
import { maxUnlockedHeat } from '@features/altair/engine/solo/heat.server';
import { HEAT_MAX } from '@features/altair/engine/data/heat';

/**
 * GET — the highest Heat tier this account may start, from the server's ledger of verified victories.
 * Signed-out visitors get 0: Heat runs are server-issued and replay-verified, so they need an account.
 */
export const route = apiRoute('/api/altair/heat', {
  GET: implement(
    C.getAltairHeatApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ userId }) => {
      const unlocked = userId ? await maxUnlockedHeat(userId) : 0;
      return Response.json({ unlocked, max: HEAT_MAX });
    },
  ),
});
