import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { challengeVoteSchema } from '@/lib/communities/plus-schema';
import { requireMember } from '@/lib/communities/guard.server';
import { ChallengeError, castVote, getCurrentChallenge } from '@/lib/communities/challenge.server';

/** POST /api/communities/$slug/challenge/vote — one vote per member, during voting. */
export const Route = createFileRoute('/api/communities/$slug/challenge/vote')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: challengeVoteSchema },
        async ({ params, userId, body }) => {
          const guard = await requireMember(params.slug, userId);
          if (!guard.ok) return guard.response;
          const current = await getCurrentChallenge(guard.value.id, userId);
          if (!current) return Response.json({ error: 'No challenge' }, { status: 404 });
          try {
            await castVote({
              communityId: guard.value.id,
              challengeId: current.id,
              entryId: body.entryId,
              userId,
            });
            return Response.json({ success: true, myVoteEntryId: body.entryId });
          } catch (e) {
            if (e instanceof ChallengeError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
