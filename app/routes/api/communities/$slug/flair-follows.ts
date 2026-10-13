import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { flairFollowsSchema } from '@/lib/communities/plus-schema';
import { OnboardingError, setFollowedFlairs } from '@/lib/communities/onboarding.server';
import { requireMember } from '@/lib/communities/guard.server';

/** PUT /api/communities/$slug/flair-follows — the flairs a member follows (feed priority). */
export const Route = createFileRoute('/api/communities/$slug/flair-follows')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: 'write', body: flairFollowsSchema },
        async ({ params, userId, body }) => {
          const guard = await requireMember(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const followedFlairIds = await setFollowedFlairs(guard.value.id, userId, body.flairIds);
            return Response.json({ followedFlairIds });
          } catch (e) {
            if (e instanceof OnboardingError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
