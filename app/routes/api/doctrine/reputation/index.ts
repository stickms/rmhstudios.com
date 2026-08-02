import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { getReputation } from '@/lib/doctrine/reputation';

export const Route = createFileRoute('/api/doctrine/reputation/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: { limit: 30, windowMs: 60_000, prefix: 'doctrine-rep' } },
        async ({ request }) => {
          try {
            const session = await auth.api.getSession({ headers: request.headers });
            if (!session?.user?.id) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }

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
