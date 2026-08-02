import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { getUserTier } from '@/lib/doctrine/tiers';
import { getDisclosuresForTier } from '@/lib/doctrine/narrative';
import { aggregateReactions, calculateDivisiveness } from '@/lib/doctrine/divisiveness';
import type { TierId } from '@/lib/doctrine/types';

export const Route = createFileRoute('/api/doctrine/safehouse/disclosures')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'doctrine-disclosures' },
        },
        async ({ request }) => {
          try {
            const session = await auth.api.getSession({ headers: request.headers });
            if (!session?.user?.id) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const userTier = (await getUserTier(session.user.id)) as TierId;
            const disclosures = await getDisclosuresForTier(userTier);

            const items = disclosures.map((d) => {
              const reactionCounts = aggregateReactions(d.reactions);
              const isRedacted = d.status === 'CLASSIFIED';
              const isTeased = d.status === 'TEASED';

              return {
                id: d.id,
                codename: d.codename,
                publicTitle: isRedacted ? '[REDACTED]' : isTeased ? d.codename : d.publicTitle,
                content: isRedacted || isTeased ? null : d.content,
                narrative: isRedacted ? null : d.narrative,
                status: d.status,
                teasedAt: d.teasedAt,
                disclosedAt: d.disclosedAt,
                mediaUrls: isRedacted || isTeased ? [] : d.mediaUrls,
                reactions: reactionCounts,
                divisiveness: calculateDivisiveness(reactionCounts),
              };
            });

            return Response.json(items);
          } catch (e) {
            console.error('Doctrine disclosures failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
