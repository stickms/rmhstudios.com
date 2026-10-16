import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createChallenge } from '@/lib/studio/challenge/challenge.server';
import { createChallengeSchema } from '@/lib/studio/challenge/shared';

/** POST /api/admin/studio-challenges — start a weekly sample-flip challenge (F12). */
export const Route = createFileRoute('/api/admin/studio-challenges/')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createChallengeSchema },
        async ({ userId, body }) => {
          const r = await createChallenge(userId, body);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ id: r.id }, { status: 201 });
        },
      ),
    },
  },
});
