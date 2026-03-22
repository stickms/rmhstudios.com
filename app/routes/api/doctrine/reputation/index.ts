import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getReputation } from '@/lib/doctrine/reputation';

export const Route = createFileRoute('/api/doctrine/reputation/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'doctrine-rep' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

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
    },
  },
});
