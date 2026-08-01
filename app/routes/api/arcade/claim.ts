import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { claimArcadeChallenge } from '@/lib/game/results.server';

const schema = z.object({ challengeId: z.string().min(1).max(64) });

/** POST /api/arcade/claim — claim a completed arcade challenge's reward. */
export const Route = createFileRoute('/api/arcade/claim')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'arcade-claim' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const reward = await claimArcadeChallenge(session.user.id, parsed.data.challengeId);
          if (!reward) return Response.json({ error: 'Challenge not claimable' }, { status: 400 });

          return Response.json({ success: true, ...reward });
        },
      ),
    },
  },
});
