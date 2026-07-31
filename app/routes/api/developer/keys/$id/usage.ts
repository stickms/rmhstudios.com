/**
 * GET /api/developer/keys/$id/usage?days=<1..90> — a key's own usage history.
 *
 * Owner-only: the key is looked up scoped to the session's user, so a key id
 * belonging to somebody else is indistinguishable from one that doesn't exist.
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { withRateLimit } from '@/lib/rate-limit';
import { getKeyUsage } from '@/lib/api/usage.server';

export const Route = createFileRoute('/api/developer/keys/$id/usage')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const limited = withRateLimit(request, 'read', { scope: session.user.id });
          if (limited) return limited;

          const key = await prisma.developerApiKey.findFirst({
            where: { id: params.id, userId: session.user.id },
            select: { id: true, name: true },
          });
          if (!key) return Response.json({ error: 'Key not found' }, { status: 404 });

          const raw = Number(new URL(request.url).searchParams.get('days'));
          const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 90) : 30;

          const usage = await getKeyUsage(key.id, days);
          const totals = usage.reduce(
            (acc, d) => ({
              requests: acc.requests + d.requests,
              units: acc.units + d.units,
              clientErrors: acc.clientErrors + d.clientErrors,
              serverErrors: acc.serverErrors + d.serverErrors,
            }),
            { requests: 0, units: 0, clientErrors: 0, serverErrors: 0 }
          );

          return Response.json(
            { key: { id: key.id, name: key.name }, days, usage, totals },
            { headers: { 'Cache-Control': 'private, no-store' } }
          );
        } catch (error) {
          console.error('developer key usage error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
