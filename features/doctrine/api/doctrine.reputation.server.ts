import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/doctrine/engine/doctrine.contract';
import { getReputation } from '@features/doctrine/engine/reputation';

export const route = apiRoute('/api/doctrine/reputation', {
  GET: implement(
    C.getDoctrineReputationApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'doctrine-rep' } },
    async ({ session }) => {
      try {
        const reputation = await getReputation(session.user.id);
        return Response.json(reputation);
      } catch (e) {
        console.error('Doctrine reputation failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
