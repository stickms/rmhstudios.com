import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getSynapseStormRivalsApi } from '@features/synapse-storm/engine/matches.contract';
import { listRivals } from '@features/synapse-storm/engine/rivals.server';

/** GET — the caller's head-to-head record against each named player they finished versus matches with. Private. */
export const route = apiRoute('/api/games/synapse-storm/rivals', {
  GET: implement(getSynapseStormRivalsApi, { rateLimit: 'read' }, async ({ userId }) => listRivals(userId)),
});
