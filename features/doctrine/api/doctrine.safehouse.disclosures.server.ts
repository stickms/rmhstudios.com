import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getSafehouseDisclosuresApi } from '@features/doctrine/engine/doctrine.contract';
import { getUserTier } from '@features/doctrine/engine/tiers';
import { getDisclosuresForTier } from '@features/doctrine/engine/narrative';
import { aggregateReactions, calculateDivisiveness } from '@features/doctrine/engine/divisiveness';
import type { TierId } from '@features/doctrine/engine/types';

export const route = apiRoute('/api/doctrine/safehouse/disclosures', {
  GET: implement(
    getSafehouseDisclosuresApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'doctrine-disclosures' },
    },
    async ({ session }) => {
      try {
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
});
