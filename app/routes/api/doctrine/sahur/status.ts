import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getSahurStatus, getSahurConfig } from '@/lib/doctrine/temporal';

export const Route = createFileRoute('/api/doctrine/sahur/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'doctrine-sahur' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          // Try to get user's timezone from their profile
          let timezone = 'America/New_York';
          const session = await auth.api.getSession({ headers: request.headers });
          if (session?.user?.id) {
            const user = await prisma.user.findUnique({
              where: { id: session.user.id },
              select: { doctrineTimezone: true },
            });
            timezone = user?.doctrineTimezone ?? timezone;
          }

          // Check from query param override
          const url = new URL(request.url);
          const tzParam = url.searchParams.get('timezone');
          if (tzParam) timezone = tzParam;

          const status = getSahurStatus(timezone);
          const config = getSahurConfig(timezone);

          return Response.json({ status, config });
        } catch (e) {
          console.error('Doctrine sahur status failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
