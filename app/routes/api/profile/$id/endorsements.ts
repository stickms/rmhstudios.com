import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getEndorsements, setEndorsement } from '@/lib/profile/endorsements.server';

/**
 * GET /api/profile/$id/endorsements — skill counts on a profile, plus which the
 * viewer has endorsed (P8).
 * PUT — { skill, on } endorse or withdraw an endorsement. One per endorser per
 * skill per member; not yourself; not across a block; only while the owner has
 * the Skills module. `$id` is the user id.
 */
const body = z.object({ skill: z.string().min(1).max(32), on: z.boolean() });

export const Route = createFileRoute('/api/profile/$id/endorsements')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) =>
        Response.json(await getEndorsements(params.id, userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      PUT: defineHandler(
        { rateLimit: { limit: 40, windowMs: 60_000, prefix: 'profile-endorse' }, body },
        async ({ params, userId, body: input }) => {
          const result = await setEndorsement(userId, params.id, input.skill, input.on);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(await getEndorsements(params.id, userId));
        },
      ),
    },
  },
});
