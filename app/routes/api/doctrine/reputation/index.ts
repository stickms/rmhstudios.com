import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/doctrine/doctrine.contract';
import { getReputation } from '@/lib/doctrine/reputation';

export const Route = createFileRoute('/api/doctrine/reputation/')({
  server: {
    handlers: {
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
    },
  },
});
