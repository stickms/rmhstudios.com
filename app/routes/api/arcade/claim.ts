import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { claimArcadeChallenge } from '@/lib/game/results.server';

const schema = z.object({ challengeId: z.string().min(1).max(64) });

/** POST /api/arcade/claim — claim a completed arcade challenge's reward. */
export const Route = createFileRoute('/api/arcade/claim')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'arcade-claim',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const reward = await claimArcadeChallenge(session.user.id, parsed.data.challengeId);
          if (!reward) return Response.json({ error: 'Challenge not claimable' }, { status: 400 });

          return Response.json({ success: true, ...reward });
        } catch (error) {
          console.error('arcade claim error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
